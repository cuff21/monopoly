// Headless matches use the same Game and per-Game turn flow as browser play.
(function(global) {
	'use strict';

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
		if (typeof global.buy === 'undefined') require('../game/property-actions');
		require('../game/auction');
		require('../game/trade');
		require('../game/bankruptcy');
		require('../game/turn-flow-explicit');
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
		var squares = player.game.state.square;
		for (var i = 0; i < squares.length; i++) {
			var square = squares[i];
			if (square.owner !== player.index) continue;
			if (square.mortgage) worth += Math.round(square.price * 0.5);
			else worth += square.price + (square.house || 0) * (square.houseprice || 0);
		}
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

			var state = global.GameStateContext.createState({
				player: [],
				square: edition.buildSquares(edition.buildGroups()),
				communityChestCards: edition.buildCommunityChestCards(),
				chanceCards: edition.buildChanceCards(),
				playersGame: [],
				pcount: playerCount,
				turn: 0,
				doublecount: 0,
				pendingAuction: -1,
				auctionEnabled: true,
				freeParkingTaxes: true,
				freeParkingPot: 0
			});
			var groupMembers = {};
			state.square.forEach(function(square, index) {
				square.index = index;
				if (square.groupNumber > 0) {
					groupMembers[square.groupNumber] = groupMembers[square.groupNumber] || [];
					groupMembers[square.groupNumber].push(index);
				}
			});
			state.square.forEach(function(square) {
				if (square.groupNumber > 0) square.group = groupMembers[square.groupNumber];
			});
			var game = new global.Game(new HeadlessUI(), state);
			var bankruptPlayers = [];
			var completed = false;
			state.player.length = playerCount + 1;
			state.player[0] = new global.Player('the bank', '', game);
			state.player[0].index = 0;
			for (var seat = 1; seat <= playerCount; seat++) {
				var player = new global.Player('Bot ' + seat, COLORS[(seat - 1) % COLORS.length], game);
				player.index = seat;
				player.originalIndex = seat - 1;
				player.human = false;
				var contestant = simulation.contestants[seat - 1];
				player.AI = contestant ? SimulationAdapters.createPlayerAI(contestant, player) : createInactiveAI();
				state.player[seat] = player;
			}

			function shuffle(deck) {
				deck.index = 0;
				deck.deck = Array.from({ length: deck.length }, function(_, index) { return index; });
				deck.deck.sort(function() { return Math.random() - 0.5; });
			}
			shuffle(state.communityChestCards);
			shuffle(state.chanceCards);
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
