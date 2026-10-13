// Headless matches use the same Game and per-Game turn flow as browser play.
(function(global) {
	'use strict';
	var GameRandom = (typeof module !== 'undefined' && module.exports) ? require('../core/random') : global.GameRandom;

	var SimulationAdapters = global.SimulationAdapters ||
		(typeof module !== 'undefined' && module.exports ? require('./ai-adapter-registry') : null);

	if (typeof module !== 'undefined' && module.exports) {
		if (typeof global.GameStorage === 'undefined') require('../core/storage');
		if (typeof global.Square === 'undefined') require('../core/board');
		if (typeof global.Player === 'undefined') require('../core/state');
		if (typeof global.UIBridge === 'undefined') require('../core/ui-bridge');
		if (typeof global.Monopoly === 'undefined' || !global.Monopoly.Editions) require('../editions/edition-registry');
		if (!global.Monopoly.Editions.get('Classic')) require('../editions/classic');
		if (!global.Monopoly.Editions.get('NYC')) require('../editions/newyorkcity');
		if (typeof global.Game === 'undefined') require('../game/game-core');
		if (!global.PropertyActions || typeof global.Game.prototype.buy !== 'function') require('../game/property-actions');
		require('../game/auction');
		require('../game/trade');
		require('../game/bankruptcy');
		require('../game/turn-flow');
	}

	var HeadlessUI = global.UIBridge.HeadlessUI;
	var COLORS = ['yellow', 'blue', 'red', 'green', 'purple', 'orange', 'aqua', 'lime'];

	function SimBoard(contestants, maxTurns, options) {
		this.contestants = contestants || [];
		this.maxTurns = maxTurns || 120;
		this.options = options || {};
	}

	function calculateNetWorth(player) {
		if (!player || player.money < 0) return 0;
		var worth = player.money;
		var state = player.game.state;
		Object.keys(state.board.squaresById).forEach(function(squareId) {
			var squareState = global.GameStateContext.getSquareState(state, squareId);
			if (squareState.ownerId !== player.playerId) return;
			var rules = global.getSquare(state.board, squareId).rules;
			worth += squareState.mortgage ? rules.mortgageValue : rules.purchasePrice;
			worth += squareState.house * rules.houseCost;
		});
		return worth;
	}

	function createInactiveAI() {
		return {
			buyProperty: function() { return false; },
			beforeTurn: function() { return false; },
			onLand: function() { return false; },
			postBail: function() { return false; },
			payDebt: function() {},
			bid: function() { return -1; },
			acceptTrade: function() { return false; }
		};
	}

	function runExplicitMatch(simulation) {
		return new Promise(function(resolve, reject) {
			var registry = global.Monopoly.Editions;
			var editionName = simulation.options.edition || registry.getActiveName();
			var edition = registry.get(editionName);
			if (!edition) {
				reject(new Error('Unknown Monopoly edition: ' + editionName));
				return;
			}
			var playerCount = simulation.options.playerCount || simulation.contestants.length || 4;
			if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
				reject(new Error('Headless games require between 2 and 8 players.'));
				return;
			}

			var editionSetup = registry.buildGameSetup(editionName, simulation.options.boardRuleOverrides);
			var structuredBoard = editionSetup.board;
			if (Object.keys(structuredBoard.squaresById).length !== 40 && simulation.contestants.some(function(contestant) {
				return contestant && SimulationAdapters.getKind(contestant) === 'gen6';
			})) {
				reject(new RangeError('Gen6 supports exactly 40 board squares; edition ' + editionName + ' has ' + Object.keys(structuredBoard.squaresById).length + '.'));
				return;
			}
			var state = global.GameStateContext.createState({
				player: [],
				editionId: editionName,
				cardDecks: editionSetup.cardDecks,
				playersGame: [],
				pcount: playerCount,
				turn: 0,
				doublecount: 0,
				pendingAuction: null,
				auctionEnabled: true,
				freeParkingTaxes: true,
				freeParkingPot: 0
			});
			global.GameStateContext.initializeBoardState(state, structuredBoard, editionName);
			state.setup = Object.freeze({
				editionId: editionName,
				boardRuleOverrides: Object.assign({}, simulation.options.boardRuleOverrides || {}),
				roster: Array.isArray(simulation.options.roster) ? simulation.options.roster.slice() : null,
				seed: Number.isInteger(simulation.options.seed) ? simulation.options.seed >>> 0 : GameRandom.freshSeed()
			});
			state.random = GameRandom.create(state.setup.seed);
			var game = new global.Game(new HeadlessUI(), state);
			var bankruptPlayers = [];
			var completed = false;
			state.player.length = playerCount + 1;
			state.player[0] = new global.Player('the bank', '', game);
			state.player[0].index = 0;
			for (var seat = 1; seat <= playerCount; seat++) {
				var player = new global.Player('Bot ' + seat, COLORS[(seat - 1) % COLORS.length], game);
				player.index = seat;
				global.GameStateContext.assignPlayerId(player, seat);
				player.originalIndex = seat - 1;
				player.human = false;
				var contestant = simulation.contestants[seat - 1];
				player.AI = contestant ? SimulationAdapters.createPlayerAI(contestant, player) : createInactiveAI();
				state.player[seat] = player;
                game.registerController(player.playerId, new global.PlayerControllers.AIController(player.AI, game.ui));
			}

			Object.keys(state.cardDecks).forEach(function(deckId) {
				state.cardDecks[deckId].index = 0;
				for (var i = state.cardDecks[deckId].order.length - 1; i > 0; i--) {
					var j = Math.floor(state.random() * (i + 1));
					var swap = state.cardDecks[deckId].order[i];
					state.cardDecks[deckId].order[i] = state.cardDecks[deckId].order[j];
					state.cardDecks[deckId].order[j] = swap;
				}
			});
			game.maxTurns = simulation.maxTurns;
			game.turnCount = 0;
			game.isOver = false;
			game.ui.onPlayerBankrupt = function(player) {
				if (player && player.originalIndex !== undefined) bankruptPlayers.push(player.originalIndex);
			};

			game.onGameCompleted = function() {
				if (completed) return;
				completed = true;
				game.isOver = true;
				var results = [];
				var recorded = new Set();
				for (var activeSeat = 1; activeSeat <= state.pcount; activeSeat++) {
					var survivor = state.player[activeSeat];
					if (!survivor || recorded.has(survivor.originalIndex)) continue;
					recorded.add(survivor.originalIndex);
					results.push({ playerIndex: survivor.originalIndex, netWorth: calculateNetWorth(survivor), bankrupt: false, money: survivor.money });
				}
				bankruptPlayers.forEach(function(originalIndex) {
					if (recorded.has(originalIndex)) return;
					recorded.add(originalIndex);
					results.push({ playerIndex: originalIndex, netWorth: 0, bankrupt: true, money: 0 });
				});
				for (var originalIndex = 0; originalIndex < playerCount; originalIndex++) {
					if (!recorded.has(originalIndex)) results.push({ playerIndex: originalIndex, netWorth: 0, bankrupt: true, money: 0 });
				}
				results.sort(function(a, b) {
					if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
					return b.netWorth - a.netWorth;
				});
				results.forEach(function(result) { result.turns = Math.min(game.turnCount || 0, simulation.maxTurns); });
				resolve(results);
			};

			try {
				game.play().catch(reject);
			} catch (error) {
				reject(error);
			}
		});
	}

	SimBoard.prototype.run = function() {
		return runExplicitMatch(this);
	};

	var SimModule = { SimBoard: SimBoard, HeadlessGameRunner: SimBoard };
	global.SimBoard = SimBoard;
	global.HeadlessGameRunner = SimBoard;
	global.SimModule = SimModule;
	if (typeof module !== 'undefined' && module.exports) module.exports = SimModule;
})(typeof window !== 'undefined' ? window : globalThis);
