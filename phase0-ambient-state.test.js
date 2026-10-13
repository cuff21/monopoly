const assert = require('assert');

const matchGlobals = [
	'game', 'player', 'square', 'communityChestCards', 'chanceCards', 'playersGame',
	'pcount', 'turn', 'auctionEnabled', 'pendingAuction', 'freeParkingTaxes',
	'freeParkingPot', 'doublecount'
];
matchGlobals.forEach(name => { delete global[name]; });

const { Player } = require('./js/core/state');
const GameStateContext = require('./js/core/game-state-context');
const { Game } = require('./js/game/game-core');

assert.strictEqual(GameStateContext.createState().freeParkingTaxes, true,
	'new match state must preserve the prior Free Parking tax default');

matchGlobals.forEach(name => {
	assert.strictEqual(Object.prototype.hasOwnProperty.call(global, name), false,
		'loading core state must not create ambient match state: ' + name);
});

const uiUpdates = [0, 0];
function createGame(index) {
	const state = GameStateContext.createState({
		player: [],
		turn: 1
	});
	const game = new Game({ updateMoney() { uiUpdates[index]++; } }, state);
	state.player[1] = new Player('Player ' + index, 'red', game);
	return game;
}

const firstGame = createGame(0);
const secondGame = createGame(1);
firstGame.state.player[1].pay(100, GameStateContext.BANK_ID);
secondGame.state.player[1].pay(200, GameStateContext.BANK_ID);

assert.notStrictEqual(firstGame.state, secondGame.state);
assert.notStrictEqual(firstGame.state.player, secondGame.state.player);
assert.strictEqual(firstGame.state.player[1].money, 1400);
assert.strictEqual(secondGame.state.player[1].money, 1300);
assert.deepStrictEqual(uiUpdates, [1, 1]);
assert.strictEqual(Object.prototype.hasOwnProperty.call(global, 'game'), false,
	'constructing Games must not publish a singleton');
assert.strictEqual(GameStateContext.run, undefined);
assert.strictEqual(GameStateContext.install, undefined);

console.log('Phase 0 ambient-state isolation tests passed.');