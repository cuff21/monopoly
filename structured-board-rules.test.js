'use strict';
var assert = require('assert');
var BoardApi = require('./js/core/board');
var Context = require('./js/core/game-state-context');
var StateTypes = require('./js/core/state');
var registry = require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
var Game = require('./js/game/game-core').Game;
var registerFixtures = require('./test-support/controllers').registerFixtures;
require('./js/game/auction');
require('./js/game/trade');
require('./js/game/bankruptcy');
require('./js/game/turn-flow');
require('./js/game/property-actions');

function fixture(editionId, players) {
	var board = registry.buildBoardForGame(editionId);
	var state = Context.createState({ player: [], pcount: players || 2, turn: 0, pendingAuction: -1, auctionEnabled: true });
	Context.initializeBoardState(state, board, editionId);
	var game = new Game(null, state);
	state.player[0] = new StateTypes.Player('Bank', '', game);
	for (var i = 1; i <= state.pcount; i++) {
		var p = new StateTypes.Player('Player ' + i, '', game);
		p.index = i; p.human = false; p.active = true;
		p.AI = { alertList: '', buyProperty: function() { return false; }, bid: function() { return 0; }, beforeTurn: function() { return true; }, onLand: function() { return true; }, postBail: function() { return false; }, acceptTrade: function() { return false; } };
		Context.assignPlayerId(p, i); state.player[i] = p;
	}
	return registerFixtures(game);
}

async function run() {
	['Classic', 'NYC'].forEach(function(edition) {
		var game = fixture(edition), p = game.state.player[1];
		game.state.turn = 1;
		var result = game.move(40);
		assert.strictEqual(result.destinationId, 'go');
		assert.strictEqual(result.traversedIds.length, 40);
		assert.strictEqual(result.crossedStart, true);
		assert.strictEqual(p.money, 1700);
		result = game.move(-1);
		assert.strictEqual(result.crossedStart, false);
		assert.strictEqual(p.squareId, BoardApi.getSquare(game.state.board, 'go').previousId);
		result = game.move(2);
		assert.strictEqual(result.destinationId, BoardApi.getSquare(game.state.board, 'go').nextId);
		assert.strictEqual(result.crossedStart, true);
		assert.strictEqual(p.money, 1900);
	});

	await Promise.all([32, 40, 52].map(async function(tileCount) {
		var ids = Array.from({ length: tileCount }, function(_, index) { return index === 0 ? 'go' : 'tile-' + index; });
		var squaresById = {};
		ids.forEach(function(id, index) {
			squaresById[id] = new BoardApi.Square({
				id: id, kind: index === 0 ? 'go' : 'free-parking',
				nextId: ids[(index + 1) % tileCount], previousId: ids[(index + tileCount - 1) % tileCount],
				rules: { purchasePrice: 0, baseRent: 0, rentTiers: [], mortgageValue: 0, houseCost: 0, taxAmount: 0 },
				presentation: { label: id, color: '#FFFFFF', x: index * 100 / tileCount, y: 50, rotationDegrees: 0 }
			});
		});
		var board = BoardApi.validateBoard(new BoardApi.Board({ editionId: 'Variable-' + tileCount, startSquareId: 'go', squaresById: squaresById, groupsById: {}, rules: { startSalary: 200, bailAmount: 75, houseTotal: 32, hotelTotal: 12 } }));
		var traveler = new StateTypes.Player('Traveler', 'red');
		Context.assignPlayerId(traveler, 1);
		var state = Context.createState({ player: [null, traveler], pcount: 1, turn: 1, board: board });
		Context.initializeBoardState(state, board);
		var variableGame = new Game(null, state);
		var movement = variableGame.move(tileCount);
		assert.strictEqual(movement.destinationId, 'go');
		assert.strictEqual(movement.traversedIds.length, tileCount);
		assert.strictEqual(traveler.money, 1700);
		traveler.jail = true;
		traveler.jailroll = 2;
		await variableGame.payBail();
		assert.strictEqual(traveler.money, 1625, 'bail uses the edition configured amount');
	}));

	var game = fixture('Classic'), state = game.state;
	var p1 = state.player[1], p2 = state.player[2];
	// Three doubles send the player to the Board's Jail square directly from distinct positions.
	for (const startId of ['go', 'st-james-place']) {
		var jailGame = fixture('Classic'), jailPlayer = jailGame.state.player[1], popupCallback;
		jailGame.state.turn = 1; jailPlayer.human = true; jailPlayer.squareId = startId;
		jailGame.rollDice = function() {};
		jailGame.getDie = function() { return 2; };
		jailGame.ui = {
			popup: function(message, callback) { popupCallback = callback; },
			displayLanded: function() {}, alert: function() {}, updateMoney: function() {},
			updatePosition: function() {}, updateOwned: function() {}, updateButtonState: function() {},
			updateDice: function() {}, focusNextButton: function() {}, updateDrawnCard: function() {},
			showCard: function() {}, updateFreeParking: function() {}, showMessage: function() {},
			onLeaveJail: function() {}, delay: function() {}
		};
		await jailGame.roll(); await jailGame.roll();
		var moneyBeforeJail = jailPlayer.money;
		await jailGame.roll();
		assert.strictEqual(jailPlayer.jail, true);
		assert.strictEqual(jailGame.state.doublecount, 0);
		assert.strictEqual(jailPlayer.money, moneyBeforeJail, 'third doubles must not land on the intervening square');
		assert.strictEqual(popupCallback, undefined, 'acknowledgement is delegated to the controller');
		assert.strictEqual(jailPlayer.squareId, 'jail');
	}

	// Invalid held-card requests leave player, deck, and UI state untouched; a valid card is returned.
	var cardGame = fixture('Classic'), cardPlayer = cardGame.state.player[1];
	cardGame.state.turn = 1; cardPlayer.jail = true; cardPlayer.jailroll = 2;
	cardGame.state.doublecount = 1; cardPlayer.heldCards = ['chance:0'];
	cardGame.state.cardDecks.chance = { cards: [{ keepable: true }], order: [3, 4], index: 1 };
	var cardUiCalls = 0;
	cardGame.ui = { onLeaveJail: function() { cardUiCalls++; }, updateOwned: function() { cardUiCalls++; }, updatePosition: function() { cardUiCalls++; } };
	var deckBeforeInvalidCard = cardGame.state.cardDecks.chance.order.slice();
	await assert.rejects(cardGame.useJailCard('community-chest:0'), RangeError);
	assert.strictEqual(cardPlayer.jail, true);
	assert.strictEqual(cardPlayer.jailroll, 2);
	assert.strictEqual(cardGame.state.doublecount, 1);
	assert.deepStrictEqual(cardPlayer.heldCards, ['chance:0']);
	assert.deepStrictEqual(cardGame.state.cardDecks.chance.order, deckBeforeInvalidCard);
	assert.strictEqual(cardUiCalls, 0);
	await cardGame.useJailCard('chance:0');
	assert.strictEqual(cardPlayer.jail, false);
	assert.strictEqual(cardPlayer.jailroll, 0);
	assert.strictEqual(cardGame.state.doublecount, 0);
	assert.deepStrictEqual(cardPlayer.heldCards, []);
	assert.deepStrictEqual(cardGame.state.cardDecks.chance.order, [3, 0, 4]);

	state.turn = 1; p1.squareId = 'boardwalk';
	await game.advanceToSquare('go', 'onCrossing');
	assert.strictEqual(p1.money, 1700);
	p1.money = 1500; p1.squareId = 'boardwalk';
	await game.advanceToSquare('go', 'always');
	assert.strictEqual(p1.money, 1700);
	p1.money = 1500;
	Context.setSquareOwner(state, 'mediterranean-avenue', p1.playerId);
	p2.squareId = 'mediterranean-avenue'; state.turn = 2;
	game.getDie = function(die) { return die === 1 ? 2 : 3; };
	await game.land();
	assert.strictEqual(p2.money, 1498);
	assert.strictEqual(p1.money, 1502);
	Context.setSquareOwner(state, 'baltic-avenue', p1.playerId);
	p2.squareId = 'mediterranean-avenue'; p1.money = 1500; p2.money = 1500;
	await game.land();
	assert.strictEqual(p2.money, 1496); // monopoly doubles undeveloped street rent
	state.squareStateById['mediterranean-avenue'].house = 1;
	p2.money = 1500; await game.land();
	assert.strictEqual(p2.money, 1490); // one-house rent tier
	state.squareStateById['mediterranean-avenue'].house = 0;
	state.squareStateById['mediterranean-avenue'].mortgage = true;
	p2.money = 1500; await game.land();
	assert.strictEqual(p2.money, 1500); // mortgaged properties collect no rent
	state.squareStateById['mediterranean-avenue'].mortgage = false;
	Context.setSquareOwner(state, 'reading-railroad', p1.playerId);
	Context.setSquareOwner(state, 'pennsylvania-railroad', p1.playerId);
	p2.squareId = 'reading-railroad'; p2.money = 1500; await game.land();
	assert.strictEqual(p2.money, 1450); // railroad rent follows group ownership count
	p2.money = 1500; p2.squareId = 'go';
	await game.advanceToGroupNearest('railroads');
	assert.strictEqual(p2.money, 1400); // nearest-railroad card doubles scheduled rent
	p2.squareId = 'electric-company'; p2.money = 1500;
	Context.setSquareOwner(state, 'electric-company', p1.playerId);
	Context.setSquareOwner(state, 'water-works', p1.playerId);
	await game.land();
	assert.strictEqual(p2.money, 1450); // two utilities: 10x the dice total
	Context.setSquareOwner(state, 'mediterranean-avenue', null);
	Context.setSquareOwner(state, 'baltic-avenue', null);

	state.turn = 1; p1.squareId = 'baltic-avenue';
	assert.strictEqual(game.buy('baltic-avenue'), true);
	assert.strictEqual(state.squareStateById['baltic-avenue'].ownerId, p1.playerId);
	assert.strictEqual(game.buyHouse('mediterranean-avenue'), false); // incomplete monopoly, no mutation
	assert.strictEqual(state.squareStateById['mediterranean-avenue'].house, 0);
	Context.setSquareOwner(state, 'mediterranean-avenue', p1.playerId);
	assert.strictEqual(game.buyHouse('mediterranean-avenue'), true);
	assert.strictEqual(state.squareStateById['mediterranean-avenue'].house, 1);
	p1.money = 0;
	assert.strictEqual(game.buyHouse('baltic-avenue'), false); // unaffordable build has no partial mutation
	assert.strictEqual(state.squareStateById['baltic-avenue'].house, 0);
	p1.money = 1000;
	assert.strictEqual(game.mortgage('mediterranean-avenue'), false);
	assert.strictEqual(game.sellHouse('mediterranean-avenue'), true);
	assert.strictEqual(game.mortgage('mediterranean-avenue'), true);
	assert.throws(function() { game.mortgage('not-a-square'); }, RangeError);

	var auctionGame = fixture('NYC'), auctionState = auctionGame.state;
	auctionGame.ui = { isHeadless: true };
	auctionState.player[1].AI.bid = function() { return 100; };
	auctionState.player[2].AI.bid = function() { return 150; };
	auctionGame.addPropertyToAuctionQueue('port-authority-bus-terminal');
	assert.strictEqual(await auctionGame.auction(), true);
	assert.strictEqual(auctionState.squareStateById['port-authority-bus-terminal'].ownerId, auctionState.player[2].playerId);
	assert.strictEqual(auctionState.player[2].money, 1350);
	var settledBid = auctionGame.auctionState.highestBid;
	assert.strictEqual(auctionGame.auctionBid(settledBid), false);
	assert.strictEqual(auctionGame.auctionState.highestBid, settledBid);

	// Trade validation is atomic and transfers only named properties.
	var offer = new StateTypes.Trade(p1.playerId, p2.playerId, 25, ['baltic-avenue'], [], 0, 0);
	var moneyBeforeTrade = p1.money;
	assert.strictEqual(game.acceptTrade(offer), true);
	assert.strictEqual(state.squareStateById['baltic-avenue'].ownerId, p2.playerId);
	assert.strictEqual(p1.money, moneyBeforeTrade - 25);
	var invalid = new StateTypes.Trade(p1.playerId, p2.playerId, 10, ['boardwalk'], [], 0, 0);
	var before = p1.money;
	assert.throws(function() { game.acceptTrade(invalid); }, RangeError);
	assert.strictEqual(p1.money, before);

	// Bankruptcy transfers property by stable identity before the active roster shifts.
	state.squareStateById['baltic-avenue'].ownerId = p1.playerId;
	p1.creditor = p2.playerId; p1.money = -10; state.turn = 1;
	await game.bankruptcy();
	assert.strictEqual(state.squareStateById['baltic-avenue'].ownerId, p2.playerId);
	assert.strictEqual(state.player[1].playerId, 'player-2');
	assert.strictEqual(state.player[1].index, 1);

	// With players still competing, inheritance retains interest and unmortgage decisions.
	var mortgageGame = fixture('Classic', 3), mortgageState = mortgageGame.state;
	var bankrupt = mortgageState.player[1], creditor = mortgageState.player[2], mortgagePrompt = 0, transferredSquare = 'mediterranean-avenue';
	mortgageState.turn = 1; bankrupt.money = -10; bankrupt.creditor = creditor.playerId;
	Context.setSquareOwner(mortgageState, transferredSquare, bankrupt.playerId);
	mortgageState.squareStateById[transferredSquare].mortgage = true;
	creditor.human = true;
    mortgageGame.registerController(creditor.playerId, new global.PlayerControllers.BrowserController(mortgageGame));
	mortgageGame.play = function() {};
	mortgageGame.ui = {
		alert: function() {}, updateMoney: function() {}, updateOwned: function() {},
		showMessage: function(message, callback) { mortgagePrompt++; callback(); },
		showBankruptcyUnmortgage: function(name, pending, confirm, finish) {
			assert.strictEqual(name, creditor.name);
			assert.deepStrictEqual(pending.map(function(property) { return property.squareId; }), [transferredSquare]);
			assert.strictEqual(confirm(transferredSquare), true);
            if (!pending.length) finish();
		}
	};
	await mortgageGame.bankruptcy();
	assert.strictEqual(mortgagePrompt, 1);
	assert.strictEqual(mortgageState.squareStateById[transferredSquare].ownerId, creditor.playerId);
	assert.strictEqual(mortgageState.squareStateById[transferredSquare].mortgage, false);
	assert.strictEqual(creditor.money, 1454, 'creditor pays debt offset, 10% transfer interest, and half-price unmortgage cost');
	assert.strictEqual(mortgageState.pcount, 2);

	// The final elimination declares a winner without inheritance decisions or fees.
	for (var losingSeat of [1, 2]) {
		var finalGame = fixture('Classic'), finalState = finalGame.state;
		var loser = finalState.player[losingSeat], winner = finalState.player[3 - losingSeat];
		finalState.turn = losingSeat; loser.money = -10; loser.creditor = winner.playerId;
		Context.setSquareOwner(finalState, transferredSquare, loser.playerId);
		finalState.squareStateById[transferredSquare].mortgage = true;
		var declaredWinner;
		finalGame.requestDecision = function() { throw new Error('No decisions after the final elimination'); };
		finalGame.ui = { onGameOver: function(name) { declaredWinner = name; } };
		await finalGame.bankruptcy();
		assert.strictEqual(finalGame.isOver, true);
		assert.strictEqual(declaredWinner, winner.name);
		assert.strictEqual(finalState.pcount, 1);
		assert.strictEqual(finalState.player[1], winner);
		assert.strictEqual(finalState.squareStateById[transferredSquare].ownerId, winner.playerId);
		assert.strictEqual(finalState.squareStateById[transferredSquare].mortgage, true);
		assert.strictEqual(winner.money, 1490, 'winner pays no transfer interest or unmortgage fee');
	}

	var bankGame = fixture('Classic'), bankState = bankGame.state;
	Context.setSquareOwner(bankState, 'boardwalk', bankState.player[1].playerId);
	bankState.player[1].money = -5; bankState.player[1].creditor = Context.BANK_ID; bankState.turn = 1;
	await bankGame.bankruptcy();
	assert.strictEqual(bankState.squareStateById.boardwalk.ownerId, null);
	assert.ok(bankGame.auctionState.queue.includes('boardwalk'));

	console.log('Structured Board movement, property, trade, and bankruptcy rules pass.');
}
run().catch(function(error) { console.error(error); process.exitCode = 1; });
