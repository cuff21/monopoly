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
const Context = require('./js/core/game-state-context');
const AITest3 = require('./js/ai/ai-genetic');

function randomFrom(seed) { let value = seed >>> 0; return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 4294967296); }
function makeParams() {
	return { purchaseThreshold: 0, housePurchaseThreshold: 0, bidUp: 50, tradeAcceptanceThreshold: 100,
		tradeRejectionThreshold: -100, spotsBehind: 5, spotsAhead: 5, communityChestJailCardValue: 50,
		chanceJailCardValue: 50, maxAmountOfRejections: 3, firstBuildingOdds: 35, lastBuildingOdds: 100 };
}
function makeGame(editionId, random) {
	const setup = global.Monopoly.Editions.buildGameSetup(editionId);
	const state = Context.createState({ player: [], editionId, cardDecks: setup.cardDecks, pcount: 3, turn: 1,
		random: random || randomFrom(9123), auctionEnabled: true, pendingAuction: null });
	Context.initializeBoardState(state, setup.board, editionId);
	const game = new Game(new global.UIBridge.HeadlessUI(), state);
	for (let seat = 0; seat <= 3; seat++) {
		const player = new global.Player(seat ? 'Bot ' + seat : 'Bank', 'red', game);
		player.index = seat;
		if (seat) Context.assignPlayerId(player, seat);
		player.human = false; player.money = 5000; state.player[seat] = player;
	}
	return { game, state, view: game.decisionView };
}

function policyFixture(options = {}) {
	const definition = {
		editionId: 'GeneticPolicyFixture',
		groups: [
			{ id: 'spare', label: 'Spare', color: 'brown' },
			{ id: 'target', label: 'Target', color: 'blue' },
			{ id: 'other', label: 'Other', color: 'orange' },
			{ id: 'transit', label: 'Transit', color: 'black', rent: [25, 50, 100, 200, 400] },
			{ id: 'services', label: 'Services', color: 'white', rent: [4, 10, 15, 20, 25] }
		],
		squares: [
			{ id: 'go', kind: 'go', label: 'GO' },
			{ id: 'spare-a', kind: 'street', group: 'spare', price: 100 },
			{ id: 'spacer', kind: 'free-parking' },
			{ id: 'target-a', kind: 'street', group: 'target', price: 200 },
			{ id: 'target-b', kind: 'street', group: 'target', price: 240 },
			{ id: 'spare-b', kind: 'street', group: 'spare', price: 80 },
			{ id: 'spare-c', kind: 'street', group: 'spare', price: 60 },
			{ id: 'railroad-a', kind: 'railroad', group: 'transit', price: 200 },
			{ id: 'railroad-b', kind: 'railroad', group: 'transit', price: 200 },
			{ id: 'utility-a', kind: 'utility', group: 'services', price: 150 },
			{ id: 'utility-b', kind: 'utility', group: 'services', price: 150 },
			{ id: 'other-a', kind: 'street', group: 'other', price: 140 },
			{ id: 'other-b', kind: 'street', group: 'other', price: 160 },
			{ id: 'other-c', kind: 'street', group: 'other', price: 180 },
			{ id: 'jail', kind: 'jail' }
		]
	};
	definition.squares.forEach((s, ordinal) => {
		s.label = s.id;
		s.presentation = { x: ordinal * 5, y: 0, rotationDegrees: 0 };
		if (s.kind === 'street') { s.rent = [10, 50, 150, 450, 625, 750]; s.houseCost = 50; }
	});
	if (options.changeDefinition) options.changeDefinition(definition);
	const board = new global.Board(definition);
	const state = Context.createState({ player: [], pcount: 3, turn: 1, cardDecks: {}, random: options.random || (() => 0.4) });
	Context.initializeBoardState(state, board);
	const game = new Game(new global.UIBridge.HeadlessUI(), state);
	for (let seat = 0; seat <= 3; seat++) {
		const player = new global.Player('Player ' + seat, 'blue', game);
		player.index = seat;
		if (seat) Context.assignPlayerId(player, seat);
		player.human = false; player.money = 5000; state.player[seat] = player;
	}
	game.getDie = () => 2;
	const ai = new AITest3(state.player[1], Object.assign(makeParams(), options.params));
	state.player[1].AI = ai;
	return { game, state, view: game.decisionView, ai, player: state.player[1],
		own: (id, ownerId = 'player-1') => Context.setSquareOwner(state, id, ownerId) };
}

function completionFixture(options) {
	const fixture = policyFixture(options);
	fixture.own('target-a'); fixture.own('target-b', 'player-2'); fixture.own('spare-a');
	const offers = [];
	fixture.game.trade = offer => { offers.push(offer); return false; };
	return Object.assign(fixture, { offers });
}

// Golden decisions from the committed policy, with controlled random draws.
for (const edition of ['Classic', 'NYC']) {
	const { game, state, view } = makeGame(edition, () => 0.4);
	const ai = new AITest3(state.player[1], makeParams());
	const ids = view.getSquareIds();
	assert.strictEqual(ai.buyProperty(ids[1]), false, edition + ' first property uses its original position odds');
	assert.strictEqual(ai.buyProperty(ids[39]), true, edition + ' late property has the original higher odds');
	assert.strictEqual(ai.buyProperty(ids[5]), true);
	assert.strictEqual(ai.buyProperty(ids[12]), true);
	assert.strictEqual(ai.buyProperty(ids[0]), false);
	Context.setSquareOwner(state, ids[39], 'player-1');
	assert.strictEqual(ai.buyProperty(ids[39]), false, 'already-owned property is excluded');
	state.player[1].money = view.getSquare(ids[5]).rules.purchasePrice;
	assert.strictEqual(ai.buyProperty(ids[5]), false, 'the original cash comparison is strict');
	state.player[1].money++;
	assert.strictEqual(ai.buyProperty(ids[5]), true);
	ai.purchaseThreshold = 1;
	assert.strictEqual(ai.buyProperty(ids[5]), false, 'purchaseThreshold changes the reserve');
	state.player[1].money = 5000;
	assert.strictEqual(ai.bid(ids[5], 100), 118, 'original rounded random auction increment is preserved');
	assert.strictEqual(ai.bid(ids[5], 300), -1, 'auction remains capped at 150 percent of price');
	state.player[1].money = 67;
	assert.strictEqual(ai.bid(ids[5], 0), -1);
	state.player[1].money = 68;
	assert.strictEqual(ai.bid(ids[5], 0), 18, 'auction preserves its original $50 reserve boundary');
	assert.throws(() => ai.buyProperty(1), RangeError);
}

{
	const { ai , game} = policyFixture();
	assert.strictEqual(ai.buyProperty('spare-a'), false, 'position odds scale with the variable Board length');
	ai.firstBuildingOdds = 45;
	assert.strictEqual(ai.buyProperty('spare-a'), true);
	ai.firstBuildingOdds = 0; ai.lastBuildingOdds = 0;
	assert.strictEqual(ai.buyProperty('other-c'), false);
	ai.lastBuildingOdds = 100;
	assert.strictEqual(ai.buyProperty('other-c'), true, 'both purchase-odds parameters affect decisions');
}

{
	const { ai, state, player, view , game} = policyFixture();
	const offer = (money, incoming = [], outgoing = [], cards = []) => new global.Trade('player-2', 'player-1', money, incoming, outgoing, cards);
	const cashCounter = ai.acceptTrade(offer(10));
	assert.ok(cashCounter instanceof global.Trade);
	assert.strictEqual(cashCounter.getMoney(), 50, 'original counteroffers target bidUp rather than the acceptance threshold');
	assert.strictEqual(ai.acceptTrade(offer(100)), true);
	assert.strictEqual(ai.acceptTrade(offer(-101)), false);
	ai.tradeRejectionThreshold = -120;
	assert.strictEqual(ai.acceptTrade(offer(-101)).getMoney(), 50, 'rejection threshold controls whether an offer can be countered');
	state.player[2].money = 50;
	assert.strictEqual(ai.acceptTrade(offer(10)), false, 'initiator must have strictly more than proposed counter cash');
	state.player[2].money = 5000;
	ai.bidUp = 80;
	assert.strictEqual(ai.acceptTrade(offer(10)).getMoney(), 80);
	ai.bidUp = 50;
	ai.tradeAcceptanceThreshold = 120;
	assert.ok(ai.acceptTrade(offer(0, ['spare-a'])) instanceof global.Trade, 'rent and group bonuses do not inflate asset valuation');
	ai.tradeAcceptanceThreshold = 100;
	assert.strictEqual(ai.acceptTrade(offer(0, ['spare-a'])), true);
	view.getSquareState('spare-a').mortgage = true;
	assert.strictEqual(ai.acceptTrade(offer(0, ['spare-a'])).getMoney(), 0, 'mortgage discount is exactly 50 percent');
	view.getSquareState('spare-a').mortgage = false;
	ai.tradeAcceptanceThreshold = 200;
	const cards = [{ cardId: Context.encodeCardId('custom deck:bonus', 2), direction: -1 }];
	const incoming = ['target-b'], outgoing = ['spare-a'];
	const counter = ai.acceptTrade(offer(10, incoming, outgoing, cards));
	assert.deepStrictEqual(counter.getOfferedSquareIds(), incoming);
	assert.deepStrictEqual(counter.getRequestedSquareIds(), outgoing);
	assert.deepStrictEqual(counter.getHeldCards(), cards);
	assert.strictEqual(counter.getInitiator(), 'player-2');
	assert.strictEqual(counter.getRecipient(), 'player-1');
	assert.strictEqual(counter.getMoney(), -40);
	player.money = 39;
	assert.strictEqual(ai.acceptTrade(offer(10, incoming, outgoing, cards)), false, 'negative counters cannot exceed the recipient cash');
}

{
	const { ai, state, player , game} = policyFixture();
	ai.bidUp = 50.6;
	state.player[2].money = 50.8;
	const offer = new global.Trade('player-2', 'player-1', 10, [], []);
	assert.strictEqual(ai.acceptTrade(offer), false, 'rounding cannot make the initiator pay more cash than available');
	state.player[2].money = 51;
	assert.strictEqual(ai.acceptTrade(offer).getMoney(), 51);
	ai.bidUp = 49.4;
	player.money = 50;
	const negative = new global.Trade('player-2', 'player-1', 0, ['spare-a'], []);
	assert.strictEqual(ai.acceptTrade(negative), true);
	ai.tradeAcceptanceThreshold = 200;
	assert.strictEqual(ai.acceptTrade(negative), false, 'rounded negative counters must fit the recipient cash');
	player.money = 51;
	assert.strictEqual(ai.acceptTrade(negative).getMoney(), -51);
}

{
	const { ai , game} = policyFixture({ params: { communityChestJailCardValue: 80, chanceJailCardValue: 20 } });
	const cardOffer = (deckId, direction = 1) => new global.Trade('player-2', 'player-1', 0, [], [], [{ cardId: Context.encodeCardId(deckId, 0), direction }]);
	assert.strictEqual(ai.acceptTrade(cardOffer('chance')).getMoney(), 30);
	assert.strictEqual(ai.acceptTrade(cardOffer('community-chest')).getMoney(), -30);
	assert.strictEqual(ai.acceptTrade(cardOffer('custom deck:extra')).getMoney(), 0, 'other decks use the mean of both card parameters');
	assert.strictEqual(ai.acceptTrade(cardOffer('community-chest', -1)).getMoney(), 130, 'outgoing physical cards subtract their value');
}

{
	const { ai, offers, own, view , game} = completionFixture();
	assert.strictEqual(await executePlanner(ai.onLand(), game), false);
	assert.deepStrictEqual(ai.currentTileTrade, ['target-b', 'spare-a']);
	assert.strictEqual(offers[0].getMoney(), 140);
	own('other-a');
	await executePlanner(ai.onLand(), game);
	assert.deepStrictEqual(offers[1].getRequestedSquareIds(), ['target-b']);
	assert.deepStrictEqual(offers[1].getOfferedSquareIds(), ['spare-a'], 'failed attempts retain the selected pair');
	assert.strictEqual(offers[1].getMoney(), 190);
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(offers[2].getMoney(), 240);
	assert.strictEqual(ai.amountOfRejections, 0);
	assert.deepStrictEqual(ai.currentTileTrade, []);
	assert.deepStrictEqual(ai.doNotOfferThose, ['target-b'], 'the rejection limit blacklists the requested asset');
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(offers.length, 3, 'blacklisted targets are not immediately offered again');
	view.getSquareState('other-a').house = 1;
}

{
	const { ai, offers, player , game} = completionFixture({ params: { bidUp: 7, maxAmountOfRejections: 2 } });
	player.money = 239;
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(offers.length, 0, 'cash must cover the price difference and acceptance threshold');
	player.money = 240;
	await executePlanner(ai.onLand(), game);
	player.money = 247;
	await executePlanner(ai.onLand(), game);
	assert.deepStrictEqual(offers.map(offer => offer.getMoney()), [140, 147]);
	assert.deepStrictEqual(ai.doNotOfferThose, ['target-b']);
}

{
	const { ai, offers, game, own, view } = completionFixture();
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(ai.amountOfRejections, 1);
	ai.doNotOfferThose.push('other-b');
	game.trade = offer => { offers.push(offer); own(offer.getRequestedSquareIds()[0]); own(offer.getOfferedSquareIds()[0], 'player-2'); return true; };
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(ai.amountOfRejections, 0);
	assert.deepStrictEqual(ai.currentTileTrade, []);
	assert.deepStrictEqual(ai.doNotOfferThose, [], 'successful acquisition resets negotiation memory');
	assert.strictEqual(view.getSquareOwner('target-b'), 'player-1');
}

for (const invalidate of [f => f.own('spare-a', 'player-3'), f => { f.view.getSquareState('spare-a').mortgage = true; },
	f => { f.view.getSquareState('spare-b').house = 1; }, f => f.own('target-b', null)]) {
	const f = completionFixture();
	await executePlanner(f.ai.onLand(), f.game); invalidate(f); await executePlanner(f.ai.onLand(), f.game);
	assert.strictEqual(f.offers.length, 1, 'ownership, mortgage, group development, or missing ownership invalidates a pending offer');
	assert.deepStrictEqual(f.ai.currentTileTrade, []);
	assert.strictEqual(f.ai.amountOfRejections, 0);
}

for (const [offeredId, behind, ahead, expected] of [['spare-a', 1, 0, false], ['spare-a', 2, 0, true],
	['spare-a', 1.5, 0, false], ['spare-a', 2.5, 0, true],
	['spare-b', 0, 0, false], ['spare-b', 0, 0.5, false], ['spare-b', 0, 1.5, true],
	['spare-b', 0, 1, true], ['other-a', 20, 0, false]]) {
	const { ai, own, game } = policyFixture({ params: { spotsBehind: behind, spotsAhead: ahead } });
	own('target-a'); own('target-b', 'player-2'); own(offeredId);
	let count = 0;
	game.trade = () => { count++; return false; };
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(count, expected ? 1 : 0, 'clipped inclusive search window for ' + offeredId + '/' + behind + '/' + ahead);
}

for (const [groupId, requestedId] of [['transit', 'railroad-b'], ['services', 'utility-b']]) {
	const { ai, view, own, game } = policyFixture({ params: { spotsBehind: 20, spotsAhead: 20 } });
	view.getGroupSquareIds(groupId).forEach(id => own(id, id === requestedId ? 'player-2' : 'player-1'));
	own('spare-a');
	let proposed;
	game.trade = offer => { proposed = offer; return false; };
	await executePlanner(ai.onLand(), game);
	assert.deepStrictEqual(proposed.getRequestedSquareIds(), [requestedId], 'completion targets include ' + groupId);
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), ['spare-a']);
}

{
	const { ai, own, game } = policyFixture({ params: { spotsBehind: 20, spotsAhead: 20 }, changeDefinition: definition => { definition.squares.find(s => s.id === 'other-a').price = 20; } });
	own('target-a'); own('target-b', 'player-2'); own('spare-a'); own('other-a');
	let proposed;
	game.trade = offer => { proposed = offer; return false; };
	await executePlanner(ai.onLand(), game);
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), ['spare-a'], 'candidate selection preserves board order rather than sorting by value');
}

{
	const { ai, own, game, view } = policyFixture();
	own('target-a'); own('target-b', 'player-2'); own('railroad-a');
	let count = 0;
	game.trade = () => { count++; return false; };
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(count, 0, 'railroads are protected as completion offers');
	own('spare-a'); own('spare-b');
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(count, 0, 'near-complete owned groups are protected');
	own('spare-b', null);
	view.getSquareState('target-a').house = 1;
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(count, 0, 'developed target groups cannot be traded');
}

for (const accepted of [false, true]) {
	const { ai, own, game } = policyFixture();
	own('utility-a'); own('railroad-a', 'player-2');
	const offers = [];
	game.trade = offer => { offers.push(offer); return accepted; };
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(offers.length, 0, 'railroad fallback is suppressed on doubles');
	game.getDie = die => die;
	assert.strictEqual(await executePlanner(ai.onLand(), game), false);
	assert.deepStrictEqual(offers[0].getOfferedSquareIds(), ['utility-a']);
	assert.deepStrictEqual(offers[0].getRequestedSquareIds(), ['railroad-a']);
	assert.strictEqual(offers[0].getMoney(), 0);
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(offers.length, 1, 'fallback is attempted once regardless of acceptance');
}

{
	const { ai, own, game } = policyFixture();
	own('utility-a'); own('utility-b'); own('railroad-a', 'player-2');
	game.getDie = die => die;
	let count = 0;
	game.trade = () => { count++; return false; };
	await executePlanner(ai.onLand(), game);
	assert.strictEqual(count, 0, 'fallback requires exactly one utility');
}

{
	const { ai, player, own, view, game } = policyFixture();
	view.getGroupSquareIds('spare').forEach(id => own(id));
	const built = [], actualBuild = game.buyHouse.bind(game);
	game.buyHouse = id => { const result = actualBuild(id); if (result) built.push(id); return result; };
	player.money = 50;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(built, [], 'house purchase comparison is strict');
	player.money = 51; ai.housePurchaseThreshold = 1;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(built, [], 'housePurchaseThreshold preserves its cash buffer');
	player.money = 5000;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(built, ['spare-c', 'spare-b', 'spare-a'], 'reverse-group ties and repeated building opportunities match the original');
	view.getSquareState('spare-a').house = 5; view.getSquareState('spare-a').hotel = 1;
	view.getSquareState('spare-b').house = 4; view.getSquareState('spare-c').house = 4;
	built.length = 0;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(built, ['spare-c'], 'the original hotel gate skips a visited property upgraded earlier in this pass');
}

{
	const { ai, player, own, view, game } = policyFixture();
	for (const id of ['spare-a', 'other-c']) { own(id); view.getSquareState(id).mortgage = true; }
	const restored = [], actualRestore = game.unmortgage.bind(game);
	game.unmortgage = id => { const result = actualRestore(id); if (result) restored.push(id); return result; };
	player.money = 180;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(restored, ['spare-a'], 'unmortgaging requires money strictly above the full purchase price');
	view.getSquareState('spare-a').mortgage = true;
	player.money = 5000; restored.length = 0;
	await executePlanner(ai.beforeTurn(), game);
	assert.deepStrictEqual(restored, ['other-c', 'spare-a'], 'all affordable unmortgages execute in reverse Board order');
}

{
	const { ai, player, own, view , game} = policyFixture();
	player.jailroll = 2;
	assert.strictEqual(ai.postBail(), false);
	player.heldCards.push(Context.encodeCardId('custom deck:extra', 2));
	assert.strictEqual(ai.postBail(), true, 'physical jail cards are used on the third turn');
	player.jailroll = 1;
	assert.strictEqual(ai.postBail(), false);
	view.getGroupSquareIds('spare').forEach(id => { own(id); view.getSquareState(id).house = 1; });
	view.getSquareState('spare-a').house = 2;
	player.money = -10; await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('spare-a').house, 1, 'liquidation respects even-building restrictions');
	view.getGroupSquareIds('spare').forEach(id => { view.getSquareState(id).house = 5; view.getSquareState(id).hotel = 1; });
	player.money = -10; await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('spare-c').hotel, 0, 'hotels liquidate in reverse Board order');
	assert.strictEqual(view.getSquareState('spare-c').house, 4);
	player.money = -400; await executePlanner(ai.payDebt(), game);
	assert.ok(player.money >= 0, 'stripped properties can be mortgaged until debt is covered');
	const money = player.money;
	await executePlanner(ai.payDebt(), game);
	assert.strictEqual(player.money, money, 'liquidation stops once debt is covered');
}

{
	const { ai, player, own, view , game} = policyFixture();
	own('spare-a'); own('other-c');
	player.money = -50; await executePlanner(ai.payDebt(), game);
	assert.strictEqual(view.getSquareState('other-c').mortgage, true, 'mortgages preserve reverse Board order');
	assert.strictEqual(view.getSquareState('spare-a').mortgage, false);
	player.money = -1000; await executePlanner(ai.payDebt(), game);
	assert.ok(player.money < 0, 'unpayable debt exits without looping indefinitely');
}

for (const edition of ['Classic', 'NYC']) {
	const { game, state, view } = makeGame(edition);
	const ai = new AITest3(state.player[1], makeParams());
	const groupId = edition === 'Classic' ? 'brown' : 'dark-purple';
	const group = view.getGroupSquareIds(groupId);
	Context.setSquareOwner(state, group[0], 'player-1');
	assert.strictEqual(typeof ai.buyProperty(group[1]), 'boolean', edition + ' buy hook takes a square ID');
	assert.ok(Number.isInteger(ai.bid(group[1], 0)), edition + ' bid hook takes a square ID');
	group.forEach(id => Context.setSquareOwner(state, id, 'player-1'));
	await executePlanner(ai.beforeTurn(), game);
	assert.ok(group.some(id => view.getSquareState(id).house > 0), edition + ' group building calls ID-based Game actions');
	const tradeGroupId = Object.keys(state.board.groupsById).find(id => state.board.groupsById[id].squareIds.length === 2 && id !== groupId && view.getSquare(state.board.groupsById[id].squareIds[0]).kind === 'street');
	const tradeGroup = view.getGroupSquareIds(tradeGroupId);
	Context.setSquareOwner(state, tradeGroup[0], 'player-1');
	Context.setSquareOwner(state, tradeGroup[1], 'player-2');
	const boardIds = view.getSquareIds();
	const targetOrdinal = boardIds.indexOf(tradeGroup[0]);
	const offeredId = boardIds.find((id, ordinal) => ordinal >= targetOrdinal - 5 && ordinal <= targetOrdinal + 5
		&& view.getSquare(id).kind === 'street' && view.getGroupSquareIds(view.getSquare(id).groupId).length >= 3);
	Context.setSquareOwner(state, offeredId, 'player-1');
	let proposed;
	const originalTrade = game.trade;
	game.trade = offer => { proposed = offer; return true; };
	assert.strictEqual(await executePlanner(ai.onLand(), game), false, edition + ' turn continues after a synchronous offer');
	assert.ok(proposed, edition + ' group-completion trade is proposed');
	assert.deepStrictEqual(proposed.getOfferedSquareIds(), [offeredId]);
	assert.deepStrictEqual(proposed.getRequestedSquareIds(), [tradeGroup[1]]);
	game.trade = originalTrade;

	const railroad = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad');
	Context.setSquareOwner(state, railroad, 'player-1');
	state.player[1].money = -50;
	await executePlanner(ai.payDebt(), game);
	assert.ok(state.player[1].money >= 0, edition + ' liquidation resolves debt through ID-based actions');

	state.turn = 2;
	state.player[2].money = -20;
	state.player[2].creditor = Context.BANK_ID;
	game.bankruptcy();
	assert.throws(() => Context.getPlayerById(state, 'player-2'), RangeError);
	assert.strictEqual(Context.getPlayerById(state, 'player-3'), state.player[2]);
	const survivorAI = ai;
	const incomingId = view.getSquareIds().find(id => view.getSquare(id).kind === 'railroad' && view.getSquareOwner(id) === null);
	Context.setSquareOwner(state, incomingId, 'player-3');
	const offer = new global.Trade('player-3', 'player-1', 5000, [incomingId], [], []);
	assert.strictEqual(survivorAI.acceptTrade(offer), true, edition + ' trade valuation resolves stable IDs after seat elimination');
	assert.strictEqual(game.acceptTrade(offer), true);
	assert.strictEqual(view.getSquareOwner(incomingId), 'player-1');
}

{
	const { game, state, own } = policyFixture();
	const player = state.player[3];
	const ai = new AITest3(player, makeParams());
	player.AI = ai;
	own('target-a', 'player-3'); own('target-b', 'player-1'); own('spare-a', 'player-3');
	const offers = [];
	game.trade = offer => { offers.push(offer); return false; };
	await executePlanner(ai.onLand(), game);
	state.turn = 2;
	state.player[2].money = -20;
	state.player[2].creditor = Context.BANK_ID;
	game.bankruptcy();
	assert.strictEqual(state.player[2], player, 'the existing bot moves to the eliminated seat');
	await executePlanner(ai.onLand(), game);
	assert.deepStrictEqual(offers.map(offer => offer.getMoney()), [140, 190]);
	assert.ok(offers.every(offer => offer.getInitiator() === 'player-3' && offer.getRecipient() === 'player-1'),
		'pending negotiations retain participant identities when the bot seat shifts');
	assert.deepStrictEqual(ai.currentTileTrade, ['target-b', 'spare-a']);
}

{
	const storage = require('./js/core/storage');
	const { generateParameters } = require('./js/ai/parameter-generator');
	const oldHistory = storage.getHistory, oldRandom = Math.random, oldLog = console.log;
	try {
		const winner = Object.assign(makeParams(), { purchaseThreshold: 100, housePurchaseThreshold: 150 });
		storage.getHistory = () => [[{ type: 'genetic3', result: 'win', params: winner }],
			[{ result: 'win', params: winner }, { type: 'gen5', result: 'win', params: { unrelated: 999 } }]];
		Math.random = () => { throw new Error('Seeded generation must not use ambient randomness'); };
		console.log = () => {};
		let draws = 0;
		const learned = generateParameters(() => { draws++; return 0.5; });
		assert.strictEqual(draws, 49, 'initial sampling, history branch, and all winner-derived sampling use the supplied RNG');
		assert.ok(learned.purchaseThreshold > 90, 'winner history contributes to generated parameters');
		assert.deepStrictEqual(Object.keys(learned).sort(), Object.keys(makeParams()).sort(), 'history retains the existing schema and ignores Gen5 winners');
		assert.deepStrictEqual(generateParameters(randomFrom(9123)), generateParameters(randomFrom(9123)), 'populated history generation is deterministic');
		storage.getHistory = () => [[{ type: 'gen5', result: 'win', params: { unrelated: 999 } }], []];
		const initial = generateParameters(() => 0.5);
		assert.ok(!Number.isInteger(initial.spotsBehind), 'the existing no-winner history path can retain fractional distances');
		const fixture = completionFixture({ params: initial });
		await assert.doesNotReject(async () => await executePlanner(fixture.ai.onLand(), fixture.game));
		assert.strictEqual(fixture.offers.length, 1, 'generated fractional distances still find eligible completion offers');
	} finally { storage.getHistory = oldHistory; Math.random = oldRandom; console.log = oldLog; }
}

{
    const f = completionFixture({ params: { maxAmountOfRejections: 1 } });
    delete f.game.trade;
    f.state.player[2].human = true;
    let displayed, continuations = 0;
    f.game.ui.writeTradeView = offer => { displayed = offer; };
    f.game.next = () => { continuations++; };
    f.game.registerController('player-2', new global.PlayerControllers.BrowserController(f.game));
    const completion = executePlanner(f.ai.onLand(), f.game);
    await new Promise(resolve => setImmediate(resolve));
    assert.strictEqual(f.game.tradeState.pending, true);
    assert.deepStrictEqual(f.ai.currentTileTrade, ['target-b', 'spare-a']);
    assert.deepStrictEqual(f.ai.doNotOfferThose, []);
    assert.ok(displayed);
    assert.strictEqual(f.game.submitPlayerAction({ type: 'acceptTrade' }), true);
    assert.strictEqual(await completion, false);
    assert.strictEqual(f.game.tradeState.pending, false);
    assert.strictEqual(continuations, 0, 'trade returns to its caller instead of advancing the turn');
    assert.strictEqual(f.view.getSquareOwner('target-b'), 'player-1');
    assert.strictEqual(f.ai.amountOfRejections, 0);

}

{
	const first = completionFixture(), second = completionFixture();
	for (const f of [first, second]) {
		Object.defineProperty(f.state, 'square', { get() { throw new Error('Legacy board access'); } });
	}
	await executePlanner(first.ai.onLand(), first.game);
	assert.strictEqual(second.ai.amountOfRejections, 0, 'negotiation state belongs to one AI');
	first.own('target-b');
	assert.strictEqual(second.view.getSquareOwner('target-b'), 'player-2', 'identical square IDs retain per-Game ownership');
	await executePlanner(second.ai.onLand(), second.game);
	assert.strictEqual(second.offers[0].getMoney(), 140);
	assert.strictEqual(second.ai.buyProperty('other-c'), true);
	assert.strictEqual(second.ai.bid('railroad-a', 0), 18);
	await executePlanner(second.ai.beforeTurn(), second.game);
	await executePlanner(second.ai.payDebt(), second.game);
}

require('./js/game/turn-flow');
async function checkTradeTurnFlow() {
	for (const accepted of [false, true]) {
		const { ai, game, state, view } = completionFixture();
		delete game.trade;
		state.player[2].AI = { acceptTrade: () => accepted };
		let continuations = 0;
		game.next = () => { continuations++; };
        game.registerController('player-1', new global.PlayerControllers.AIController(ai));
        game.registerController('player-2', new global.PlayerControllers.AIController(state.player[2].AI));
        await game.land();
        await game.requestDecision('manage', 'player-1', { hook: 'onLand' });
        assert.strictEqual(continuations, 0, 'landing returns without implicitly advancing the turn');
		assert.strictEqual(view.getSquareOwner('target-b'), accepted ? 'player-1' : 'player-2');
		assert.strictEqual(ai.amountOfRejections, accepted ? 0 : 1);
	}
}
await checkTradeTurnFlow().then(() => {
	console.log('Genetic AI original strategy, negotiation, evolution, and structured Board fixtures passed.');
}).catch(error => { console.error(error); process.exitCode = 1; });

}
runPolicyTests().catch(error => { console.error(error); process.exitCode = 1; });
