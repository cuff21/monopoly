const assert = require('assert');
const SimulationAdapters = require('./js/simulation/ai-adapter-registry');
const { SimBoard } = require('./js/simulation/match-runner');
const { processBatch } = require('./js/simulation/worker-runtime');

async function runTests() {
	const observedSetups = [];
    const adapter = {
        kind: 'fixture',
        supports: contestant => contestant && contestant.kind === 'fixture',
        createPlayerAI: (contestant, player) => {
			const state = player.game.state;
			observedSetups.push({
				editionId: state.editionId,
				rules: state.board.rules,
				roster: state.setup.roster,
				seed: state.setup.seed,
				playerId: player.playerId,
				decks: Object.keys(state.cardDecks).sort().map(id => [id, state.cardDecks[id].order.slice()])
			});
			return ({
            buyProperty: () => false,
            beforeTurn: () => false,
            onLand: () => false,
            postBail: () => false,
            payDebt() {},
            bid: () => -1,
            acceptTrade: () => false
			});
		},
        serialize: contestant => ({ kind: 'fixture', marker: contestant.marker }),
        deserialize: contestant => contestant
    };
    SimulationAdapters.register(adapter);

    const encoded = SimulationAdapters.serialize({ kind: 'fixture', marker: 'round-trip' });
    assert.deepStrictEqual(encoded, { kind: 'fixture', marker: 'round-trip' });
    assert.deepStrictEqual(SimulationAdapters.deserialize(encoded), encoded);
    assert.strictEqual(
        Object.keys(require.cache).some(path => /[\\/]ai[\\/]ai-gen6[\\/]/.test(path)),
        false,
        'shared simulation must not load a Gen6 implementation'
    );

    const contestants = [{ kind: 'fixture', marker: 'round-trip' }];
    const setup = {
        edition: 'Classic',
        playerCount: 2,
        seed: 314159,
		boardRuleOverrides: { startSalary: 250 },
		roster: ['player-1', 'player-2']
    };
    observedSetups.length = 0;
    const results = await new SimBoard(contestants, 1, setup).run();
    const directSetup = observedSetups.slice();
    assert.strictEqual(results.length, 2);
    assert.deepStrictEqual(results.map(result => result.playerIndex).sort(), [0, 1]);
    observedSetups.length = 0;
    const workerResults = await processBatch({ matches: [{ contestants: [{ kind: 'fixture', marker: 'round-trip' }], maxTurns: 1, ...setup }] });
    assert.deepStrictEqual(workerResults[0].results, results, 'direct and worker matches should retain seeded setup and outcomes');
	assert.deepStrictEqual(observedSetups, directSetup, 'direct and worker setup must match edition, rules, roster, seed, player IDs, and shuffled decks');
	assert.strictEqual(directSetup[0].editionId, setup.edition);
	assert.strictEqual(directSetup[0].rules.startSalary, 250);
    assert.strictEqual(directSetup[0].seed, setup.seed);

    for (const edition of ['Classic', 'NYC']) {
        const editionContestants = [
            { kind: 'fixture', marker: 'first' },
            { kind: 'fixture', marker: 'second' }
        ];
        const editionSetup = {
            edition,
            playerCount: 2,
            seed: edition === 'Classic' ? 6311 : 6312,
            boardRuleOverrides: { startSalary: 275 },
            roster: ['player-1', 'player-2']
        };
        observedSetups.length = 0;
        const directResults = await new SimBoard(editionContestants, 1, editionSetup).run();
        const directObservations = observedSetups.slice();
        observedSetups.length = 0;
        const workerBatch = await processBatch({ matches: [{
            contestants: editionContestants,
            maxTurns: 1,
            ...editionSetup
        }] });
        assert.deepStrictEqual(workerBatch[0].results, directResults, edition + ' direct and worker outcomes must match');
        assert.deepStrictEqual(observedSetups, directObservations, edition + ' direct and worker setup must match');
        assert.strictEqual(directObservations.length, 2, edition + ' setup must initialize every roster member');
        directObservations.forEach((observation, seat) => {
            assert.strictEqual(observation.editionId, edition);
            assert.strictEqual(observation.rules.startSalary, 275);
            assert.deepStrictEqual(observation.roster, editionSetup.roster);
            assert.strictEqual(observation.seed, editionSetup.seed);
            assert.strictEqual(observation.playerId, 'player-' + (seat + 1));
            assert.ok(observation.decks.length > 0, edition + ' should initialize and shuffle its edition decks');
        });
        assert.deepStrictEqual(directResults.map(result => result.playerIndex).sort(), [0, 1]);
    }

    require('./js/ai/ai-gen5/simulation-adapter');
    require('./js/ai/ai-strategic-simulation-adapter');
    const gen5Adapter = SimulationAdapters.get('gen5');
    const createGen5 = gen5Adapter.createPlayerAI;
    const originalHistory = global.GameStorage.getHistory;
    const policies = [];
    gen5Adapter.createPlayerAI = function(contestant, player) {
        const ai = createGen5(contestant, player);
        policies.push({ profile: { ...ai.profile }, params: { ...ai.params } });
        return ai;
    };
    try {
        global.GameStorage.getHistory = () => { throw new Error('simulation read ambient history'); };
        const fixedParams = global.AIGen5.ParameterGenerator.generate({ random: () => 0.5, history: [] });
        const history = [[{ type: 'gen5', result: 'win', params: fixedParams },
            { type: 'gen5', result: 'win', params: fixedParams }]];
        for (const edition of ['Classic', 'NYC']) {
            for (const seed of [12345, 54321]) {
                const setup = { edition, seed, playerCount: 2, roster: ['player-1', 'player-2'] };
                for (const policy of [{}, { history }, { params: fixedParams }]) {
                    const contestants = ['Tactician', 'Sentinel'].map(profile => ({ kind: 'gen5', profile, ...policy }));
                    policies.length = 0;
                    const direct = await new SimBoard(contestants, 12, setup).run();
                    const directPolicies = policies.slice();
                    policies.length = 0;
                    assert.deepStrictEqual(await new SimBoard(contestants, 12, setup).run(), direct);
                    assert.deepStrictEqual(policies, directPolicies, 'repeated seeded matches retain every Gen5 policy');
                    policies.length = 0;
                    const encoded = JSON.parse(JSON.stringify(contestants.map(c => SimulationAdapters.serialize(c))));
                    const worker = await processBatch({ matches: [{ contestants: encoded, maxTurns: 12, ...setup }] });
                    assert.deepStrictEqual(worker[0].results, direct, 'serialized Gen5 worker outcomes match direct execution');
                    assert.deepStrictEqual(policies, directPolicies, 'serialized Gen5 worker policies match direct execution');
                    if (policy.params) directPolicies.forEach(ai => assert.deepStrictEqual(ai.params, fixedParams));
                }
            }
        }
    } finally {
        gen5Adapter.createPlayerAI = createGen5;
        global.GameStorage.getHistory = originalHistory;
    }
    const aiContestants = [
        { kind: 'baseline', ai: 'gen5', profile: 'Tactician' },
        { kind: 'baseline', ai: 'strategic', profile: 'Balanced' }
    ];
    for (const edition of ['Classic', 'NYC']) {
        const aiSetup = {
			edition,
			playerCount: 2,
			seed: 2718,
			boardRuleOverrides: { startSalary: 250 },
			roster: ['player-1', 'player-2']
		};
        const directAIMatch = await new SimBoard(aiContestants.map(contestant => SimulationAdapters.deserialize(contestant)), 8, aiSetup).run();
        const workerAIMatch = await processBatch({ matches: [{ contestants: aiContestants, maxTurns: 8, ...aiSetup }] });
        assert.deepStrictEqual(workerAIMatch[0].results, directAIMatch, 'seeded ' + edition + ' Gen5/Strategic matches should match between direct and worker execution');
		assert.strictEqual(directAIMatch.length, 2, edition + ' direct match should return every player outcome');
        assert.deepStrictEqual(directAIMatch.map(result => result.playerIndex).sort(), [0, 1], edition + ' match outcomes should preserve original roster seats');
    }

    const Tournament = require('./js/ai/ai-gen6/sim/tournament');
    const tournamentSetupCalls = [];
    const tournamentPopulation = {
        species: [{ members: [
            { fitness: 0, clone() { return { fitness: this.fitness }; } },
            { fitness: 0, clone() { return { fitness: this.fitness }; } }
        ] }]
    };
    const tournament = new Tournament(tournamentPopulation, 3, async (bracket, turns, matchSetup) => {
        tournamentSetupCalls.push({ bracket, turns, setup: matchSetup });
        return bracket.map((_, playerIndex) => ({ playerIndex, netWorth: 1000 - playerIndex, turns: 2 }));
    }, {
        edition: 'NYC',
        playerCount: 2,
        seed: 9901,
        boardRuleOverrides: { startSalary: 300 },
        roster: ['player-1', 'player-2']
    });
    await tournament.run();
    assert.strictEqual(tournamentSetupCalls.length, 1);
    assert.strictEqual(tournamentSetupCalls[0].turns, 3);
    assert.deepStrictEqual(tournamentSetupCalls[0].setup, {
        edition: 'NYC',
        playerCount: 2,
        seed: require('./js/core/random').deriveSeed(9901, 1, 'training'),
        boardRuleOverrides: { startSalary: 300 },
        roster: ['player-1', 'player-2']
    }, 'tournament match execution should carry edition, rules, roster, and its deterministic match seed');
    console.log('Shared simulation runs with an independently registered adapter.');
}

runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
