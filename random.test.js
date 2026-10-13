'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Random = require('./js/core/random');

async function run() {
    // Independently calculated with unsigned 32-bit arithmetic in Python.
    const expected = [1789933344, 44971166, 2521387044, 3848737593,
        1138324114, 749234105, 1899511038, 1995189375];
    const zero = Random.create(0);
    assert.deepEqual(expected.map(() => zero() * 4294967296), expected);
    const browser = vm.createContext({});
    vm.runInContext(fs.readFileSync('./js/core/random.js', 'utf8'), browser);
    const browserZero = browser.GameRandom.create(0);
    assert.deepEqual(expected.map(() => browserZero() * 4294967296), expected);
    for (const seed of [0, 1, 12345, 0xffffffff]) {
        const first = Random.create(seed), replay = Random.create(seed);
        for (let i = 0; i < 1000; i++) {
            const value = first();
            assert.equal(value, replay());
            assert.ok(value >= 0 && value < 1);
        }
    }
    assert.throws(() => Random.create(undefined), TypeError);

    // Exercise actual dice conversion and pairs; this is a distribution smoke
    // check, not a proof of statistical independence or unpredictability.
    const { Game } = require('./js/game/game-core');
    const diceGame = new Game({}, { random: Random.create(12345) });
    const faces = Array(6).fill(0), sums = Array(13).fill(0);
    let doubles = 0;
    for (let i = 0; i < 200000; i++) {
        diceGame.rollDice();
        const a = diceGame.getDie(1), b = diceGame.getDie(2);
        faces[a - 1]++; faces[b - 1]++; sums[a + b]++;
        if (a === b) doubles++;
    }
    faces.forEach(count => assert.ok(Math.abs(count / 400000 - 1 / 6) < 0.003));
    assert.ok(Math.abs(doubles / 200000 - 1 / 6) < 0.003);
    assert.ok(Math.abs(sums[7] / 200000 - 1 / 6) < 0.003);

    const { SimBoard } = require('./js/simulation/match-runner');
    const Adapters = require('./js/simulation/ai-adapter-registry');
    const games = [];
    Adapters.register({
        kind: 'random-fixture', supports: c => c && c.kind === 'random-fixture',
        serialize: c => c, deserialize: c => c,
        createPlayerAI(c, player) {
            games.push(player.game);
            return { beforeTurn: () => false, onLand: () => false,
                buyProperty: () => false, postBail: () => false,
                payDebt() {}, bid: () => -1, acceptTrade: () => false };
        }
    });
    const originalFresh = Random.freshSeed;
    let seedCounter = 900;
    Random.freshSeed = () => ++seedCounter;
    try {
        const contestants = [{ kind: 'random-fixture' }];
        const first = await new SimBoard(contestants, 8, { playerCount: 2, edition: 'Classic' }).run();
        const firstGame = games.at(-1);
        await new SimBoard(contestants, 8, { playerCount: 2, edition: 'Classic' }).run();
        assert.equal(firstGame.state.setup.seed, 901);
        assert.equal(games.at(-1).state.setup.seed, 902);
        const replay = await new SimBoard(contestants, 8, {
            playerCount: 2, edition: 'Classic', seed: firstGame.state.setup.seed
        }).run();
        assert.deepEqual(replay, first);
        const deckState = game => Object.entries(game.state.cardDecks).map(([id, deck]) => ({ id, order: deck.order, index: deck.index }));
        assert.deepEqual(deckState(games.at(-1)), deckState(firstGame));
        assert.equal(games.at(-1).getDie(1), firstGame.getDie(1));
        assert.equal(games.at(-1).getDie(2), firstGame.getDie(2));

        const Tournament = require('./js/ai/ai-gen6/sim/tournament');
        const PolicyEvaluator = require('./js/ai/ai-gen6/sim/policy-evaluator');
        const trainingSeeds = [];
        const population = { species: [{ members: Array.from({ length: 8 }, () => ({
            clone() { return { fitness: this.fitness }; }
        })) }] };
        await new Tournament(population, 2, async (lineup, turns, setup) => {
            trainingSeeds.push(setup.seed);
            return lineup.map((_, playerIndex) => ({ playerIndex, netWorth: 1000, turns: 1 }));
        }, { edition: 'Classic', playerCount: 2, seed: 0xffffffff }).run();
        assert.equal(new Set(trainingSeeds).size, trainingSeeds.length);
        assert.ok(trainingSeeds.every(seed => seed < 0x80000000));

        const setups = [];
        const evaluator = new PolicyEvaluator({ games: 32, editions: ['Classic'], playerCounts: [2],
            random: () => 0, matchRunner: async (lineup, turns, setup) => {
                setups.push(setup);
                return lineup.map((_, playerIndex) => ({ playerIndex, netWorth: 1000 }));
            }
        });
        const genome = { vertices: [], edges: [] };
        await evaluator.evaluate(genome);
        const validationSeeds = setups.map(s => s.seed);
        assert.equal(new Set(validationSeeds).size, 32, 'constant layout RNG must not repeat validation seeds');
        assert.ok(validationSeeds.every(seed => seed >= 0x80000000 && !trainingSeeds.includes(seed)));
        setups.length = 0;
        await evaluator.evaluate(genome);
        assert.notDeepEqual(setups.map(s => s.seed), validationSeeds, 'new evaluation gets a fresh seed batch');
        const fixed = new PolicyEvaluator({ games: 4, seed: 123, matchRunner: evaluator.matchRunner });
        setups.length = 0;
        await fixed.evaluate(genome);
        const fixedSetups = setups.slice();
        setups.length = 0;
        await new PolicyEvaluator({ games: 4, seed: 123, matchRunner: evaluator.matchRunner }).evaluate(genome);
        assert.deepEqual(setups, fixedSetups, 'explicit evaluator seed reproduces layouts and game seeds');

        const WorkerPool = require('./js/simulation/worker-pool');
        const messages = [];
        class RetryWorker {
            postMessage(message) {
                messages.push(message);
                if (messages.length > 1) setTimeout(() => this.onmessage({ data: {
                    id: message.id, success: true, result: [{ results: [] }]
                } }), 0);
            }
            terminate() {}
        }
        const pool = new WorkerPool(1, 'fixture.js', RetryWorker, 20, 1);
        try {
            await pool.runMatch(contestants, 2, { edition: 'Classic', playerCount: 2 });
            assert.equal(messages.length, 2);
            assert.ok(Number.isInteger(messages[0].matches[0].seed));
            assert.equal(messages[0].matches[0].seed, messages[1].matches[0].seed);
        } finally { pool.terminate(); }
    } finally { Random.freshSeed = originalFresh; }
    console.log('Randomness, seed separation, replay, and worker retry tests passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
