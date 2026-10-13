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
const AISetupRegistry = require('./js/application/ai-setup-registry');
const GameStateContext = require('./js/core/game-state-context');
const { StrategicAI, PROFILE_LIBRARY } = require('./js/ai/ai-strategic');

function seeded(seed) {
	let value = seed >>> 0;
	return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function fixture(editionId) {
	const setup = global.Monopoly.Editions.buildGameSetup(editionId);
	const state = GameStateContext.createState({ player: [], editionId, cardDecks: setup.cardDecks, pcount: 3, turn: 1, random: seeded(9876) });
	GameStateContext.initializeBoardState(state, setup.board, editionId);
	const game = new Game(new global.UIBridge.HeadlessUI(), state);
	for (let seat = 0; seat <= 3; seat++) {
		const player = new global.Player(seat ? 'Player ' + seat : 'Bank', 'blue', game);
		player.index = seat;
		if (seat) GameStateContext.assignPlayerId(player, seat);
		player.money = 5000;
		player.human = false;
		state.player[seat] = player;
	}
	return { game, state, view: game.decisionView };
}

// Different board size, arbitrary square IDs, and extra railroads/utilities ensure
// strategic decisions depend on Board economics and kinds, rather than positions.
function strategyFixture(changeDefinition) {
	const definition = {
		editionId: 'StrategyFixture',
		groups: [
			{ id: 'strong', label: 'Strong', color: 'orange' },
			{ id: 'cheap', label: 'Cheap', color: 'brown' },
			{ id: 'luxury', label: 'Luxury', color: 'blue' },
			{ id: 'transit', label: 'Transit', color: 'black', rent: [25, 50, 100, 200, 400] },
			{ id: 'services', label: 'Services', color: 'white', rent: [4, 10, 15, 20, 25] }
		],
		squares: [{ id: 'go', kind: 'go', label: 'GO' }]
	};
	for (const [id, price, rent] of [['strong-a', 180, 10], ['strong-b', 200, 12], ['strong-c', 220, 15]]) {
		definition.squares.push({ id, kind: 'street', label: id, group: 'strong', price, houseCost: 50, rent: [rent, 50, 150, 450, 625, 750] });
	}
	for (const id of ['cheap-a', 'cheap-b', 'cheap-c']) {
		definition.squares.push({ id, kind: 'street', label: id, group: 'cheap', price: 60, houseCost: 50, rent: [4, 20, 60, 180, 320, 450] });
	}
	for (const id of ['luxury-a', 'luxury-b']) {
		definition.squares.push({ id, kind: 'street', label: id, group: 'luxury', price: 400, houseCost: 200, rent: [50, 200, 600, 1400, 1700, 2000] });
	}
	for (let ordinal = 1; ordinal <= 5; ordinal++) {
		definition.squares.push({ id: 'transit-' + ordinal, kind: 'railroad', label: 'Transit', group: 'transit', price: 200 });
	}
	for (let ordinal = 1; ordinal <= 3; ordinal++) {
		definition.squares.push({ id: 'service-' + ordinal, kind: 'utility', label: 'Service', group: 'services', price: 150 });
	}
	definition.squares.forEach((square, ordinal) => { square.presentation = { x: ordinal * 5, y: 0, rotationDegrees: 0 }; });
	if (changeDefinition) changeDefinition(definition);
	const board = new global.Board(definition);
	const state = GameStateContext.createState({ player: [], pcount: 3, turn: 1, random: seeded(1234), cardDecks: {} });
	GameStateContext.initializeBoardState(state, board);
	const game = new Game(new global.UIBridge.HeadlessUI(), state);
	for (let seat = 0; seat <= 3; seat++) {
		const player = new global.Player('Player ' + seat, 'blue', game);
		player.index = seat;
		if (seat) GameStateContext.assignPlayerId(player, seat);
		player.money = 2000;
		player.human = false;
		// Start with no position weighting; individual tests enable it explicitly.
		player.jail = true;
		state.player[seat] = player;
	}
	const view = game.decisionView;
	const ai = new StrategicAI(state.player[1], { name: 'Balanced' });
	state.player[1].AI = ai;
	return {
		game, state, view, ai, player: state.player[1],
		own: (id, playerId = 'player-1') => GameStateContext.setSquareOwner(state, id, playerId)
	};
}

{
	const { ai, player, own, view , game} = strategyFixture();
	assert.strictEqual(ai.getLiquidityFloor(), 240);
	player.money = 500;
	assert.strictEqual(ai.getLiquidityFloor(), 120, 'original minimum cash reserve is retained');
	assert.strictEqual(ai.buyProperty('strong-a'), true);
	player.money = 299;
	assert.strictEqual(ai.buyProperty('strong-a'), true, 'purchase intent can spend below the liquidity floor');
	player.money = view.getSquare('strong-a').rules.purchasePrice - 1;
	assert.strictEqual(ai.buyProperty('strong-a'), true, 'a desirable property can request controller funding');
	player.money = 2000;
	assert.strictEqual(ai.bid('cheap-a', 0), 0, 'weak property does not force an opening bid');
	assert.strictEqual(ai.bid('cheap-a', 80), -1);
	own('cheap-b', 'player-2');
	own('cheap-c', 'player-2');
	assert.strictEqual(ai.bid('cheap-a', 80), 83, 'opponent monopoly threat raises valuation up to the original bid cap');
	own('strong-a');
	assert.strictEqual(ai.buyProperty('strong-a'), false, 'owned property is never repurchased');
	assert.strictEqual(ai.bid('strong-a', 0), -1);
	assert.strictEqual(ai.bid('strong-b', 0), 10, 'original auction increments are retained');
	assert.strictEqual(ai.bid('strong-b', 1900), -1, 'auction cannot exhaust liquidity');
	assert.strictEqual(ai.buyProperty('transit-5'), true, 'railroad bonus applies beyond the original four locations');
	assert.strictEqual(ai.buyProperty('service-3'), true, 'utility bonus applies beyond the original two locations');
	view.getGroupSquareIds('strong').forEach(id => own(id));
	const plan = ai.planPortfolio();
	assert.strictEqual(plan.targetGroup.groupId, 'strong');
	assert.strictEqual(plan.targetGroup.owned, 3);
	assert.strictEqual(plan.confidence, 1, 'portfolio target and confidence are restored');
	ai.recordTrade('player-2', 'accepted', 150);
	assert.strictEqual(ai.tradeMemory['player-2'].count, 1);
	assert.strictEqual(ai.tradeMemory['player-2'].lastDirection, 'accepted');
	assert.ok(Math.abs(ai.getTradeBias('player-2') - 1.38) < 1e-12, 'outcomes and cumulative value both influence negotiation');
	ai.recordTrade('player-2', 'countered', -100);
	assert.strictEqual(ai.tradeMemory['player-2'].count, 2);
	assert.strictEqual(ai.tradeMemory['player-2'].rejected, 0, 'counteroffers are recorded separately from rejection');
	assert.throws(() => ai.buyProperty(1), RangeError, 'decision hooks require stable square IDs');
	const registration = AISetupRegistry.get('4');
	assert.strictEqual(registration.createPlayer(player, { profile: 'Defensive' }).profile.name, 'Defensive', 'setup keeps the selected personality');
	assert.strictEqual(registration.createPlayer(player, { profile: 'Random' }, () => 0.99).profile.name, 'Opportunist', 'random setup uses the supplied RNG');
}

{
	const { ai, state, own , game} = strategyFixture();
	const cards = [{ cardId: 'arbitrary-deck:0', direction: 1 }];
	const offer = new global.Trade('player-2', 'player-1', 20, [], [], cards);
	const counter = ai.acceptTrade(offer);
	assert.ok(counter instanceof global.Trade, 'marginal trades generate counteroffers');
	assert.strictEqual(counter.getMoney(), 50, 'original threshold, card valuation, and counteroffer adjustment are retained');
	assert.deepStrictEqual(counter.getHeldCards(), cards, 'counteroffer preserves physical card IDs and directions');
	assert.strictEqual(counter.getInitiator(), 'player-2');
	assert.strictEqual(counter.getRecipient(), 'player-1');
	state.player[2].money = 130;
	assert.strictEqual(ai.acceptTrade(offer), false, 'counteroffers preserve the initiator cash buffer');
	own('strong-a');
	own('strong-c');
	own('strong-b', 'player-2');
	assert.strictEqual(ai.acceptTrade(new global.Trade('player-2', 'player-1', -300, ['strong-b'], [], [])), true,
		'incoming properties are valued under the completed hypothetical monopoly');
	assert.strictEqual(ai.acceptTrade(new global.Trade('player-2', 'player-1', 0, [], ['strong-a'], [])), false,
		'valuable outgoing assets are protected');
}

{
	const { ai, state , game} = strategyFixture();
	assert.strictEqual(ai.bid('strong-b', 231), 232);
	state.player[2].jail = false;
	state.player[3].jail = false;
	assert.strictEqual(ai.bid('strong-b', 231), 234, 'nearby opponents increase expected rent and the maximum bid');
	state.player[2].jail = true;
	state.player[3].jail = true;
	state.player[3].eliminated = true;
	assert.strictEqual(ai.bid('strong-b', 231), -1, 'the remaining-player estimate updates the original endgame pressure');
}

for (const money of [1000, 220]) {
	const { ai, player, state, game, own } = strategyFixture();
	player.money = money;
	own('strong-a'); own('strong-c'); own('strong-b', 'player-2');
	own('cheap-a'); own('cheap-b'); own('cheap-c', 'player-2');
	state.player[2].AI = new StrategicAI(state.player[2], { name: 'Balanced' });
	let proposed;
	game.trade = offer => { proposed = offer; return false; };
	assert.strictEqual(await executePlanner(ai.onLand(), game), false, 'a rejected synchronous offer allows the turn to continue');
	assert.ok(proposed, 'profitable completion trade is proposed');
	assert.deepStrictEqual(proposed.getRequestedSquareIds(), ['strong-b']);
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), money === 220 ? ['cheap-a', 'cheap-b'] : ['cheap-a']);
	assert.strictEqual(proposed.getMoney(), money === 220 ? 0 : 134, 'recipient valuation determines the cash adjustment');
	assert.notStrictEqual(state.player[2].AI.acceptTrade(proposed), false, 'generated offers are negotiable for the recipient');
}

{
	const { ai, game, own } = strategyFixture();
	own('service-3'); own('transit-5', 'player-2');
	let proposed;
	game.trade = offer => { proposed = offer; return true; };
	assert.strictEqual(await executePlanner(ai.onLand(), game), false);
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), ['service-3']);
	assert.deepStrictEqual(proposed.getRequestedSquareIds(), ['transit-5'], 'utility-for-railroad fallback is restored');
	proposed = undefined;
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(proposed, undefined, 'utility-for-railroad fallback is attempted only once');
}

{
	const { ai, game, view, own } = strategyFixture();
	view.getGroupSquareIds('strong').forEach(id => { own(id); view.getSquareState(id).house = 2; });
	view.getGroupSquareIds('cheap').forEach(id => { own(id); view.getSquareState(id).house = 2; });
	let built;
	game.buyHouse = id => { built = id; return true; };
	await executePlanner(ai.beforeTurn(), game);
	assert.strictEqual(built, 'strong-a', 'development ranks marginal rent return and the three-house breakpoint');
	view.getSquareState('strong-b').house = 1;
	await executePlanner(ai.beforeTurn(), game);
	assert.strictEqual(built, 'cheap-a', 'a group with uneven buildings must develop its lowest level first');
	view.getGroupSquareIds('cheap').forEach(id => { view.getSquareState(id).house = 5; view.getSquareState(id).hotel = 1; });
	await executePlanner(ai.beforeTurn(), game);
	assert.strictEqual(built, 'strong-b', 'lowest level is chosen when it is the remaining development target');
}

{
	const { ai, game, view, own } = strategyFixture();
	own('cheap-a'); own('luxury-a'); own('luxury-b');
	own('cheap-b', 'player-2'); own('cheap-c', 'player-2');
	view.getSquareState('cheap-a').mortgage = true;
	view.getSquareState('luxury-a').mortgage = true;
	const restored = [];
	game.unmortgage = id => { restored.push(id); return true; };
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(restored, ['luxury-a', 'cheap-a'], 'unmortgaging ranks return per dollar rather than purchase price');
	ai.profile = Object.assign({}, ai.profile, { name: 'Defensive' });
	restored.length = 0;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(restored, [], 'Defensive profile retains its unmortgaging policy');
}

{
	const { ai, player, view, own , game} = strategyFixture();
	player.money = 100;
	player.jailroll = 2;
	assert.strictEqual(ai.postBail(), true, 'third jail turn forces release without requiring a held card');
	player.jailroll = 1;
	player.money = 2000;
	assert.strictEqual(ai.postBail(), false, 'cash alone does not force early release');
	own('strong-a', 'player-2');
	view.getSquareState('strong-a').house = 2;
	assert.strictEqual(ai.postBail(), true, 'developed opponent rent changes the bail decision');
	player.money = 100;
	assert.strictEqual(ai.postBail(), false, 'bail respects the reserve after paying the Board fine');
	player.heldCards.push('arbitrary-deck:0');
	assert.strictEqual(ai.postBail(), true, 'held jail cards retain their danger-based release policy');
}

{
	const { ai, player, view, own , game} = strategyFixture(definition => { definition.rules = { bailAmount: 600 }; });
	own('strong-a', 'player-2');
	view.getSquareState('strong-a').house = 2;
	player.jailroll = 1;
	player.money = 500;
	assert.strictEqual(ai.postBail(), false, 'bail liquidity uses the edition Board fine');
}

{
	const { ai, player, view, own , game} = strategyFixture();
	view.getGroupSquareIds('strong').forEach(id => { own(id); view.getSquareState(id).house = 1; });
	view.getGroupSquareIds('cheap').forEach(id => { own(id); view.getSquareState(id).house = 1; });
	player.money = -10;
	await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('cheap-a').house, 0, 'debt sales minimize expected rent lost per dollar raised');
	assert.strictEqual(view.getSquareState('strong-a').house, 1, 'more productive developments are protected');
	player.money = -500;
	await executePlanner(ai.payDebt(), game);
	assert.ok(player.money >= 0, 'properties made eligible by selling buildings can then be mortgaged');
	assert.ok(view.getGroupSquareIds('cheap').some(id => view.getSquareState(id).mortgage));
}

{
	const { ai, player, view, own , game} = strategyFixture();
	own('cheap-c'); own('strong-a'); own('transit-5');
	player.money = -20;
	await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('cheap-c').mortgage, true, 'mortgages start with the least valuable asset');
	assert.strictEqual(view.getSquareState('transit-5').mortgage, false);
	view.getGroupSquareIds('strong').forEach(id => { own(id); view.getSquareState(id).house = 1; });
	view.getSquareState('strong-a').house = 2;
	player.money = -10;
	await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('strong-a').house, 1, 'sales obey the even-building rule');
	assert.strictEqual(view.getSquareState('strong-b').house, 1);
}

for (const editionId of ['Classic', 'NYC']) {
	const { game, state, view } = fixture(editionId);
	const ai = new StrategicAI(state.player[1], { name: 'Balanced' });
	assert.ok(PROFILE_LIBRARY.some(profile => profile.name === ai.profile.name));
	const groupId = 'orange';
	const ids = view.getGroupSquareIds(groupId);
	GameStateContext.setSquareOwner(state, ids[0], 'player-1');
	assert.strictEqual(typeof ai.buyProperty(ids[1]), 'boolean', editionId + ' purchase hook accepts a square ID');
	assert.ok(ai.bid(ids[1], 0) >= 0, editionId + ' auction hook accepts a square ID');
	ids.forEach(id => GameStateContext.setSquareOwner(state, id, 'player-1'));
	state.player[1].money = 5000;
	await executePlanner(ai.beforeTurn(), game);
	assert.ok(ids.some(id => view.getSquareState(id).house > 0), editionId + ' StrategicAI develops a completed group');
	const tradeGroupId = Object.keys(state.board.groupsById).find(id => state.board.groupsById[id].squareIds.length === 2 && id !== groupId && view.getSquare(state.board.groupsById[id].squareIds[0]).kind === 'street');
	const tradeGroup = view.getGroupSquareIds(tradeGroupId);
	GameStateContext.setSquareOwner(state, tradeGroup[0], 'player-1');
	GameStateContext.setSquareOwner(state, tradeGroup[1], 'player-2');
	const offerRailroadId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	GameStateContext.setSquareOwner(state, offerRailroadId, 'player-1');
	let proposed;
	const originalTrade = game.trade;
	game.trade = offer => { proposed = offer; return true; };
	assert.strictEqual(await executePlanner(ai.onLand(), game), false, editionId + ' turn continues after a synchronous trade proposal');
	assert.ok(proposed, editionId + ' group-completion trade is proposed');
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), [offerRailroadId]);
	assert.deepStrictEqual(proposed.getRequestedSquareIds(), [tradeGroup[1]]);
	game.trade = originalTrade;

	const railroadId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	GameStateContext.setSquareOwner(state, railroadId, 'player-1');
	state.player[1].money = -100;
	await executePlanner(ai.payDebt(), game);
	assert.ok(state.player[1].money >= 0, editionId + ' debt hook liquidates through Game square-ID actions');

	state.turn = 2;
	state.player[2].money = -10;
	state.player[2].creditor = GameStateContext.BANK_ID;
	await game.bankruptcy();
	assert.throws(() => GameStateContext.getPlayerById(state, 'player-2'), RangeError);
	assert.strictEqual(GameStateContext.getPlayerById(state, 'player-3'), state.player[2], 'original player ID survives active-seat compaction');
	const survivingAI = ai;
	const tradeSquareId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	GameStateContext.setSquareOwner(state, tradeSquareId, 'player-3');
	const trade = new global.Trade('player-3', 'player-1', 5000, [tradeSquareId], [], []);
	assert.strictEqual(survivingAI.acceptTrade(trade), true, editionId + ' trade hook values stable IDs after elimination');
	assert.strictEqual(game.acceptTrade(trade), true);
	assert.strictEqual(view.getSquareOwner(tradeSquareId), 'player-1');
}

require('./js/game/turn-flow');

async function checkTradeTurnFlow() {
	for (const accepted of [false, true]) {
		const { game, state, view, own, ai } = strategyFixture();
		own('strong-a'); own('strong-c'); own('strong-b', 'player-2');
		own('cheap-a'); own('cheap-b'); own('cheap-c', 'player-2');
		state.player[2].AI = { acceptTrade: () => accepted };
		let continuations = 0;
		game.next = () => { continuations++; };
        game.registerController('player-1', new global.PlayerControllers.AIController(ai));
        game.registerController('player-2', new global.PlayerControllers.AIController(state.player[2].AI));
        await game.land();
        await game.requestDecision('manage', 'player-1', { hook: 'onLand' });
        assert.strictEqual(continuations, 0, 'trade returns to the originating phase without advancing the turn');
		assert.strictEqual(view.getSquareOwner('strong-b'), accepted ? 'player-1' : 'player-2', 'trade is settled through the ID-based engine');
	}
}

await checkTradeTurnFlow().then(() => {
	console.log('StrategicAI strategy and structured Classic/NYC decision fixtures passed.');
}).catch(error => {
	console.error(error);
	process.exitCode = 1;
});

}
runPolicyTests().catch(error => { console.error(error); process.exitCode = 1; });
