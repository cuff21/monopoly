async function runPolicyTests() {
const { executePlanner } = require('./test-support/planners');
const assert = require('assert');

require('./js/core/board');
require('./js/core/state');
require('./js/core/ui-bridge');
require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
const { Game } = require('./js/game/game-core');
require('./js/game/property-actions');
require('./js/game/auction');
require('./js/game/trade');
require('./js/game/bankruptcy');
const GameStateContext = require('./js/core/game-state-context');
require('./js/ai/ai-gen5/simulation-adapter');

function randomFrom(seed) {
	let value = seed >>> 0;
	return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function fixture(editionId, count = 3, ruleOverrides) {
    const setup = global.Monopoly.Editions.buildGameSetup(editionId, ruleOverrides);
	const state = GameStateContext.createState({
		player: [], editionId, cardDecks: setup.cardDecks, pcount: count, turn: 1,
		random: randomFrom(12345), auctionEnabled: true, pendingAuction: null
	});
	GameStateContext.initializeBoardState(state, setup.board, editionId);
	const game = new Game(new global.UIBridge.HeadlessUI(), state);
	for (let seat = 0; seat <= count; seat++) {
		const player = new global.Player(seat ? 'Bot ' + seat : 'Bank', 'red', game);
		player.index = seat;
		if (seat) GameStateContext.assignPlayerId(player, seat);
		player.human = false;
		player.money = 5000;
		state.player[seat] = player;
	}
	return { game, state, view: game.decisionView };
}

for (const editionId of ['Classic', 'NYC']) {
	const { game, state, view } = fixture(editionId);
	const ai = new global.Gen5AI(state.player[1], { name: 'Tactician' });
	const groupId = editionId === 'Classic' ? 'brown' : 'dark-purple';
	const groupSquareIds = view.getGroupSquareIds(groupId);
	assert.ok(groupSquareIds.length >= 2, editionId + ' fixture group exists');
	GameStateContext.setSquareOwner(state, groupSquareIds[0], 'player-1');
	assert.strictEqual(typeof ai.buyProperty(groupSquareIds[1]), 'boolean', editionId + ' buy hook accepts a square ID');
	assert.ok(Number.isInteger(ai.bid(groupSquareIds[1], 0)), editionId + ' auction hook accepts a square ID');

	groupSquareIds.forEach(id => GameStateContext.setSquareOwner(state, id, 'player-1'));
	assert.strictEqual(global.AIGen5.Valuation.groupScoreById(groupSquareIds[0], 'player-1', null, state), 80,
		editionId + ' structured valuation recognizes a completed ID-based group');
	assert.strictEqual(global.AIGen5.Analytics.countMonopolies('player-1', true, state), 1,
		editionId + ' analytics counts completed groups by player ID');
	assert.ok(global.AIGen5.Analytics.netWorth(state.player[1]) > state.player[1].money,
		editionId + ' analytics values assets through the decision view');
	assert.ok(Number.isFinite(global.AIGen5.Analytics.monopolyRisk(groupSquareIds[0], 'player-1', undefined, state)),
		editionId + ' monopoly risk accepts square and player IDs');
	const utilityId = view.getSquareIds().find(id => view.getSquare(id).kind === 'utility');
	GameStateContext.setSquareOwner(state, utilityId, 'player-1');
	const utility = view.getSquare(utilityId);
	const utilityGroup = view.getGroup(utility.groupId);
	const utilityMultiplier = utilityGroup.rules.rentTiers[0];
    assert.strictEqual(global.AIGen5.Valuation.rentById(utilityId, 'player-1', null, state), utilityMultiplier,
        editionId + ' utility valuation preserves the Gen5 multiplier heuristic');
	assert.strictEqual(global.AIGen5.getSquares, undefined, 'Gen5 exposes no positional square projection');
	const reachableSquareId = global.walk(state.board, 'go', 7);
	assert.ok(global.AIGen5.Probability.landingProbability('go', reachableSquareId, 1, state) > 0,
		editionId + ' probability accepts stable square IDs and the current Board traversal');
	const built = await executePlanner(global.AIGen5.Building.plan(state.player[1], ai.profile, {
		batchBuildMinROI: -1, reserveSafetyMargin: 0.1
	}), game);
	assert.ok(built.every(id => typeof id === 'string'), editionId + ' building plan reports stable square IDs');
	assert.ok(groupSquareIds.some(id => view.getSquareState(id).house > 0), editionId + ' completed group can be developed');

	const railroadId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	GameStateContext.setSquareOwner(state, railroadId, 'player-1');
	state.player[1].money = -100;
	const liquidated = await executePlanner(global.AIGen5.DebtManager.resolveDebt(state.player[1]), game);
	assert.ok(liquidated.every(item => typeof item.squareId === 'string'), editionId + ' debt actions identify squares by ID');
	assert.ok(state.player[1].money >= 0, editionId + ' AI debt resolution restores solvency where collateral permits');

	// Eliminate seat two and verify Gen5 still resolves the surviving participant by stable ID.
	state.turn = 2;
	state.player[2].money = -10;
	state.player[2].creditor = GameStateContext.BANK_ID;
	await game.bankruptcy();
	assert.throws(() => GameStateContext.getPlayerById(state, 'player-2'), RangeError);
	assert.strictEqual(GameStateContext.getPlayerById(state, 'player-1'), state.player[1]);
	assert.strictEqual(GameStateContext.getPlayerById(state, 'player-3'), state.player[2]);
	const survivorAI = new global.Gen5AI(state.player[1], { name: 'Tactician' });
	const tradeSquareId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	GameStateContext.setSquareOwner(state, tradeSquareId, 'player-3');
	const trade = new global.Trade('player-3', 'player-1', 3000, [tradeSquareId], [], []);
	const tradeEvaluation = global.AIGen5.TradeEvaluation.evaluate(trade, state.player[1], survivorAI.profile, survivorAI.tradeMemory, 4);
	assert.ok(Number.isFinite(tradeEvaluation.netValue), editionId + ' trade valuation uses square and player IDs after elimination');
	const reply = survivorAI.acceptTrade(trade);
	assert.ok(reply instanceof global.Trade, editionId + ' acceptable offer triggers the original final squeeze');
	assert.strictEqual(reply.getMoney(), trade.getMoney() + 35);
	assert.deepStrictEqual(reply.getOfferedSquareIds(), trade.getOfferedSquareIds());
	assert.deepStrictEqual(reply.getRequestedSquareIds(), trade.getRequestedSquareIds());
	assert.strictEqual(game.acceptTrade(reply), true);
	assert.strictEqual(view.getSquareOwner(tradeSquareId), 'player-1');
}

for (const editionId of ['Classic', 'NYC']) {
    const { game, state, view } = fixture(editionId);
    const p = state.player[1];
    const ai = new global.Gen5AI(p, { name: 'Tactician' }, {});
    const groupId = editionId === 'Classic' ? 'brown' : 'dark-purple';
    const [first, second] = view.getGroupSquareIds(groupId);
    const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

    // Literal strategy values: a $60 street with base rent $2 and $50 houses,
    // no owned neighbors, two open neighbors, and no one-roll traffic from GO.
    close(global.AIGen5.Valuation.evaluateProperty(first, p.playerId, p.money, ai.profile, 0, p), 47.8);
    assert.strictEqual(ai.buyProperty(first), false);
    GameStateContext.setSquareOwner(state, first, p.playerId);
    assert.strictEqual(ai.buyProperty(second), true, 'completion preference survives migration');
    GameStateContext.setSquareOwner(state, second, p.playerId);
    assert.strictEqual(global.AIGen5.Valuation.expectedRent(first, p.playerId, null, p), 4);
    view.getSquareState(first).house = 3;
    assert.strictEqual(global.AIGen5.Valuation.expectedRent(first, p.playerId, null, p), 90);
    assert.strictEqual(global.AIGen5.Valuation.tempoScore(p), 20, 'tempo uses least developed member');
    view.getSquareState(first).house = 0;

    close(global.AIGen5.Probability.landingProbability('go', global.walk(state.board, 'go', 7), 1, state), 6 / 36);
    close(global.AIGen5.Probability.landingProbability(global.walk(state.board, 'go', -7), 'go', 1, game), 6 / 36);
    close(global.AIGen5.Probability.landingProbability('go', global.walk(state.board, 'go', 4), 2, p), 3 / 36 + 1 / 1296);
    close(global.AIGen5.Probability.aggregateBoardThreat(global.walk(state.board, 'go', 7), p.playerId, 1, state), 12 / 36);
    assert.deepStrictEqual(global.AIGen5.Analytics.getActivePlayers(p).map(p => p.playerId), ['player-1', 'player-2', 'player-3']);
    assert.strictEqual(ai.bid('unknown-square', 0), -1);
    assert.throws(() => global.AIGen5.Probability.landingProbability('go', 'unknown-square', 1, state), RangeError);

    const railroads = view.getGroupSquareIds('railroads');
    railroads.forEach(id => GameStateContext.setSquareOwner(state, id, p.playerId));
    assert.strictEqual(global.AIGen5.Valuation.expectedRent(railroads[0], p.playerId, null, state), 200);
    view.getSquareState(railroads[0]).mortgage = true;
    assert.deepStrictEqual(await executePlanner(global.AIGen5.DebtManager.planUnmortgage(p, ai.profile, { unmortgageROIThreshold: 0.01 }), game), [railroads[0]]);
    assert.strictEqual(view.getSquareState(railroads[0]).mortgage, false);

    const sentinel = new global.Gen5AI(p, { name: 'Sentinel' }, {});
    const opponent = state.player[2];
    GameStateContext.setSquareOwner(state, first, opponent.playerId);
    const vetoed = new global.Trade(opponent.playerId, p.playerId, 3000, [], [second], []);
    assert.strictEqual(sentinel.acceptTrade(vetoed), false, 'defensive veto survives a generous cash offer');
    assert.ok(sentinel.tradeMemory.records['player-2']);

    const cards = [
        { cardId: GameStateContext.encodeCardId('chance', 1), direction: 1 },
        { cardId: GameStateContext.encodeCardId('community-chest', 2), direction: -1 }
    ];
    const offer = new global.Trade(opponent.playerId, p.playerId, 25, [first, railroads[0]], [second], cards);
    const normalized = global.AIGen5.TradeMemory.normalizeIncoming(offer);
    const signature = global.AIGen5.TradeMemory.createSignature(normalized.property, normalized.money);
    const reordered = new global.Trade(opponent.playerId, p.playerId, 25, [railroads[0], first], [second], cards);
    assert.strictEqual(global.AIGen5.TradeMemory.createSignature(global.AIGen5.TradeMemory.normalizeIncoming(reordered).property, -25), signature);
    const counter = global.AIGen5.counterTrade(offer, 60, { [first]: 1, [railroads[0]]: 1, [second]: -1 });
    assert.deepStrictEqual(counter.getOfferedSquareIds(), offer.getOfferedSquareIds());
    assert.deepStrictEqual(counter.getRequestedSquareIds(), offer.getRequestedSquareIds());
    assert.deepStrictEqual(counter.getHeldCards(), cards, 'counters preserve physical card identity and direction');

    const isolated = fixture(editionId);
    assert.strictEqual(isolated.view.getSquareOwner(first), null);
    assert.strictEqual(global.AIGen5.Analytics.countMonopolies(p.playerId, true, isolated.state), 0);

    // Tax hazards use edition economics rather than names or numeric locations.
    const taxpayer = isolated.state.player[1];
    taxpayer.money = 1000;
    taxpayer.squareId = global.walk(isolated.state.board, 'luxury-tax', -7);
    const luxuryTax = editionId === 'Classic' ? 100 : 75;
    const cityTaxProbability = global.AIGen5.Probability.landingProbability(taxpayer.squareId, 'city-tax', 1, taxpayer);
    const expectedReserve = 145 + (luxuryTax / 6 + cityTaxProbability * 200) * (1 + 1 / 6);
    close(global.AIGen5.Liquidity.computeReserve(taxpayer), expectedReserve);

    const overridden = fixture(editionId, 3, { bailAmount: 500, houseTotal: 4, startSalary: 250 });
    const jailed = overridden.state.player[1];
    jailed.money = 400;
    jailed.jail = true;
    jailed.jailroll = 1;
    jailed.squareId = 'jail';
    const gambler = new global.Gen5AI(jailed, { name: 'Gambler' }, {});
    assert.strictEqual(gambler.postBail(), false, 'bail decision honors match override');
    close(global.AIGen5.Valuation.houseBuildFeasibility(overridden.state), 0.4);
    close(global.AIGen5.Valuation.houseBuildFeasibility(jailed), 0.4);
    assert.strictEqual(isolated.view.board.rules.bailAmount, 50, 'overrides do not leak');

    const proactive = fixture(editionId);
    const proposer = proactive.state.player[1];
    const proactiveAI = new global.Gen5AI(proposer, { name: 'Tactician' }, {});
    GameStateContext.setSquareOwner(proactive.state, first, proposer.playerId);
    GameStateContext.setSquareOwner(proactive.state, second, 'player-2');
    GameStateContext.setSquareOwner(proactive.state, railroads[0], proposer.playerId);
    let proposal;
    proactive.game.trade = offer => { proposal = offer; return true; };
    assert.strictEqual(await executePlanner(proactiveAI.onLand(), proactive.game), false, 'synchronous bot proposal lets the turn continue');
    assert.ok(proposal instanceof global.Trade);
    assert.strictEqual(proposal.getInitiator(), 'player-1');
    assert.strictEqual(proposal.getRecipient(), 'player-2');
    assert.deepStrictEqual(proposal.getRequestedSquareIds(), [second]);
    assert.deepStrictEqual(proposal.getOfferedSquareIds(), [railroads[0]]);
    proactive.game.trade = offer => { proposal = offer; proactive.game.tradeState.pending = true; };
    proactiveAI.tradeMemory = global.AIGen5.TradeMemory.create();
    assert.strictEqual(await executePlanner(proactiveAI.onLand(), proactive.game), false, 'planner resumes after the controller resolves the proposal');
}

// Probability follows the actual linked Board on boards smaller than the built-ins.
{
    const board = new global.Board({ editionId: 'Tiny', squares: [
        { id: 'go', kind: 'go', label: 'GO', presentation: { x: 0, y: 0, rotationDegrees: 0 } },
        { id: 'jail', kind: 'jail', label: 'Jail', presentation: { x: 50, y: 0, rotationDegrees: 0 } },
        { id: 'free-parking', kind: 'free-parking', label: 'Parking', presentation: { x: 100, y: 0, rotationDegrees: 0 } }
    ] });
    const state = GameStateContext.createState();
    GameStateContext.initializeBoardState(state, board);
    assert.ok(Math.abs(global.AIGen5.Probability.landingProbability('go', 'go', 1, state) - 1 / 3) < 1e-10);
}

// IDs that overlap Object.prototype remain valid Board IDs.
{
    const board = new global.Board({ editionId: 'PrototypeIds',
        groups: [{ id: 'streets', label: 'Streets', color: '#123456' }],
        squares: [
            { id: 'go', kind: 'go', label: 'GO', presentation: { x: 0, y: 0, rotationDegrees: 0 } },
            { id: 'constructor', kind: 'street', label: 'Constructor', group: 'streets',
                price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50,
                presentation: { x: 50, y: 0, rotationDegrees: 0 } },
            { id: 'other-street', kind: 'street', label: 'Other', group: 'streets',
                price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50,
                presentation: { x: 100, y: 0, rotationDegrees: 0 } }
        ] });
    const state = GameStateContext.createState();
    GameStateContext.initializeBoardState(state, board);
    for (const from of ['go', 'constructor', 'other-street']) {
        for (const target of ['go', 'constructor', 'other-street']) {
            assert.ok(Math.abs(global.AIGen5.Probability.landingProbability(from, target, 2, state) - 5 / 9) < 1e-10,
                'two rolls on a three-square Board must have finite, correct probability');
        }
    }
    state.players = [{ playerId: 'player-1' }, { playerId: 'player-2' }];
    GameStateContext.setSquareOwner(state, 'constructor', 'player-1');
    const valuation = global.AIGen5.Valuation;
    assert.strictEqual(valuation.propertyOwner('constructor', {}, state), 'player-1');
    assert.strictEqual(valuation.propertyOwner('constructor', Object.create({ constructor: 'player-2' }), state), 'player-1');
    assert.strictEqual(valuation.groupScore('constructor', 'player-1', { 'other-street': 'player-1' }, state), 80);
    assert.strictEqual(valuation.propertyOwner('constructor', { constructor: null }, state), null);
    assert.strictEqual(valuation.propertyOwner('constructor', { constructor: 'player-2' }, state), 'player-2');
    const trade = new global.Trade('player-1', 'player-2', 0, ['constructor'], ['other-street'], []);
    const normalized = global.AIGen5.TradeMemory.normalizeIncoming(trade);
    assert.strictEqual(normalized.property.constructor, -1);
    assert.ok(global.AIGen5.TradeMemory.createSignature(normalized.property, 0).includes('constructor'));
}

// Seeded policy generation uses only the supplied RNG and history.
{
    const generator = global.AIGen5.ParameterGenerator;
    const savedStorage = global.GameStorage;
    const savedNormal = global.normal;
    const savedRandom = Math.random;
    try {
        global.GameStorage = { getHistory() { throw new Error('ambient history accessed'); } };
        global.normal = () => { throw new Error('ambient normal accessed'); };
        Math.random = () => { throw new Error('ambient RNG accessed'); };
        const defaults = generator.generate({ random: randomFrom(1), history: [] });
        assert.deepStrictEqual(generator.generate({ random: randomFrom(1), history: [] }), defaults);
        const winningParams = Object.fromEntries(Object.entries(generator.PARAM_SPEC).map(([key, spec]) => [key, spec.max]));
        const history = [[{ type: 'gen5', result: 'win', params: winningParams },
            { type: 'gen5', result: 'win', params: winningParams }]];
        const learned = generator.generate({ random: randomFrom(1), history });
        assert.deepStrictEqual(generator.generate({ random: randomFrom(1), history }), learned);
        assert.notDeepStrictEqual(learned, defaults, 'explicit winning history affects policy generation');
        assert.notDeepStrictEqual(generator.generate({ random: randomFrom(54321), history: [] }), defaults);
    } finally {
        global.GameStorage = savedStorage;
        global.normal = savedNormal;
        Math.random = savedRandom;
    }
}

console.log('Gen5 structured Classic/NYC decision and strategy regression fixtures passed.');

}
runPolicyTests().catch(error => { console.error(error); process.exitCode = 1; });
