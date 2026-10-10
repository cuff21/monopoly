'use strict';

var assert = require('assert');
var apiCases = require('./structured-board-api-contract.cases');
var Context = require('./js/core/game-state-context');
var StateTypes = require('./js/core/state');
var Editions = require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
var Game = require('./js/game/game-core').Game;
require('./js/game/trade');
require('./js/game/bankruptcy');
require('./js/game/turn-flow');

function addCardSquare(board, squareId, deckId) {
	var ids = [], cursor = board.startSquareId;
	for (var i = 0; i < Object.keys(board.squaresById).length; i++) {
		ids.push(cursor);
		cursor = board.squaresById[cursor].nextId;
	}
	var lastId = ids[ids.length - 1];
	board.squaresById[lastId].nextId = squareId;
	board.squaresById[board.startSquareId].previousId = squareId;
	board.squaresById[squareId] = {
		id: squareId,
		kind: 'card',
		deckId: deckId,
		nextId: board.startSquareId,
		previousId: lastId,
		rules: { purchasePrice: 0, baseRent: 0, rentTiers: [], mortgageValue: 0, houseCost: 0, taxAmount: 0 },
		presentation: { x: 50, y: 50, rotationDegrees: 0, label: 'Card' }
	};
}

function buildBoard() {
	var board = apiCases.createBoardFixture();
	board.editionId = 'GenericCardFixture';
	addCardSquare(board, 'card-alpha', 'deck alpha:extra');
	addCardSquare(board, 'card-beta', 'deck-beta');
	addCardSquare(board, 'card-gamma', 'deck alpha:extra');
	return board;
}

function buildDecks() {
	function jailCard(label) {
		return { text: label, action: function(context) { context.state.player[context.state.turn].heldCards.push(context.cardId); } };
	}
	return {
		'deck alpha:extra': { label: 'Alpha', cards: [jailCard('A0'), { text: 'cash', action: function() {} }, jailCard('A2')], keepable: [0, 2] },
		'deck-beta': { label: 'Beta', cards: [{ text: 'cash', action: function() {} }, jailCard('B1')], keepable: [1] }
	};
}

Editions.register('GenericCardFixture', { buildBoard: buildBoard, buildCardDecks: buildDecks });
assert.throws(function() {
	Editions.register('UnknownCardDeckFixture', {
		buildBoard: function() { var board = buildBoard(); board.editionId = 'UnknownCardDeckFixture'; board.squaresById['card-beta'].deckId = 'missing'; return board; },
		buildCardDecks: buildDecks
	});
}, /references unknown card deck/);
assert.throws(function() {
	Editions.register('EmptyCardDeckFixture', {
		buildBoard: function() { var board = buildBoard(); board.editionId = 'EmptyCardDeckFixture'; return board; },
		buildCardDecks: function() { return { 'deck alpha:extra': { cards: [] }, 'deck-beta': buildDecks()['deck-beta'] }; }
	});
}, /nonempty cards/);

var firstSetup = Editions.buildGameSetup('GenericCardFixture');
var secondSetup = Editions.buildGameSetup('GenericCardFixture');
assert.strictEqual(firstSetup.board.squaresById['card-alpha'].deckId, 'deck alpha:extra');
assert.strictEqual(firstSetup.board.squaresById['card-gamma'].deckId, firstSetup.board.squaresById['card-alpha'].deckId, 'multiple card squares may share a deck');
assert.deepStrictEqual(Object.keys(firstSetup.cardDecks), ['deck alpha:extra', 'deck-beta']);
assert.strictEqual(firstSetup.cardDecks['deck alpha:extra'].cards.length, 3);
assert.strictEqual(firstSetup.cardDecks['deck-beta'].cards.length, 2);
assert.notStrictEqual(firstSetup.cardDecks, secondSetup.cardDecks);
assert.notStrictEqual(firstSetup.cardDecks['deck alpha:extra'].cards[0], secondSetup.cardDecks['deck alpha:extra'].cards[0]);

var state = Context.createState({ player: [], pcount: 2, turn: 1, cardDecks: firstSetup.cardDecks });
Context.initializeBoardState(state, firstSetup.board, 'GenericCardFixture');
var game = new Game({ isHeadless: true }, state);
var p1 = new StateTypes.Player('One', 'red', game), p2 = new StateTypes.Player('Two', 'blue', game);
Context.assignPlayerId(p1, 1); Context.assignPlayerId(p2, 2);
p1.index = 1; p2.index = 2; p1.human = true; p2.human = true;
state.player[1] = p1; state.player[2] = p2;
require('./test-support/controllers').registerFixtures(game);

async function run() {
	// Draw from two arbitrary decks. Each physical card retains its source deck identity.
	p1.squareId = 'card-alpha';
	await game.drawCardAtSquare();
	p1.squareId = 'card-beta';
	firstSetup.cardDecks['deck-beta'].index = 1;
	await game.drawCardAtSquare();
	assert.deepStrictEqual(p1.heldCards, [Context.encodeCardId('deck alpha:extra', 0), Context.encodeCardId('deck-beta', 1)]);

	// Transfer multiple held cards, then use one and return it to its own deck.
	var offer = new StateTypes.Trade(p1.playerId, p2.playerId, 0, [], [], [
		{ cardId: p1.heldCards[0], direction: 1 }
	]);
	assert.strictEqual(game.acceptTrade(offer), true);
	assert.deepStrictEqual(p1.heldCards, [Context.encodeCardId('deck-beta', 1)], 'a trade may select only a subset of held cards');
	assert.deepStrictEqual(p2.heldCards, [Context.encodeCardId('deck alpha:extra', 0)]);
	p2.jail = true; state.turn = 2;
	await game.useJailCard();
	assert.deepStrictEqual(p2.heldCards, []);
	assert.ok(firstSetup.cardDecks['deck alpha:extra'].order.includes(0));
	assert.ok(!firstSetup.cardDecks['deck-beta'].order.includes(1));
	var secondOffer = new StateTypes.Trade(p1.playerId, p2.playerId, 0, [], [], [
		{ cardId: p1.heldCards[0], direction: 1 }
	]);
	assert.strictEqual(game.acceptTrade(secondOffer), true);
	await game.useJailCard(Context.encodeCardId('deck-beta', 1));
	assert.deepStrictEqual(p2.heldCards, []);
	assert.ok(firstSetup.cardDecks['deck-beta'].order.includes(1));
	assert.deepStrictEqual(secondSetup.cardDecks['deck alpha:extra'].order, [0, 1, 2]);
	assert.deepStrictEqual(secondSetup.cardDecks['deck-beta'].order, [0, 1]);

	// Invalid or duplicate source identities are rejected before trade mutation.
	p1.heldCards.push(Context.encodeCardId('deck alpha:extra', 0));
	var invalid = new StateTypes.Trade(p1.playerId, p2.playerId, 0, [], [], [
		{ cardId: p1.heldCards[0], direction: 1 }, { cardId: p1.heldCards[0], direction: 1 }
	]);
	assert.strictEqual(game.acceptTrade(invalid), false);
	assert.deepStrictEqual(p1.heldCards, [Context.encodeCardId('deck alpha:extra', 0)]);
	p1.heldCards = [Context.encodeCardId('deck alpha:extra', 2)];
	firstSetup.cardDecks['deck alpha:extra'].order.splice(firstSetup.cardDecks['deck alpha:extra'].order.indexOf(2), 1);
	p1.money = -1; p1.creditor = Context.BANK_ID; state.turn = 1;
	await game.bankruptcy();
	assert.ok(firstSetup.cardDecks['deck alpha:extra'].order.includes(2), 'bankruptcy should return a held card to its source deck');
	console.log('Generic card deck isolation, draw, trade, and return behavior pass.');
}

run().catch(function(error) { console.error(error); process.exitCode = 1; });
