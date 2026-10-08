// Player/Trade data types and accessors for the active Game state.

function Player(name, color) {
	this.name = name;
	this.color = color;
	this.position = 0;
	this.money = 1500;
	this.creditor = -1;
	this.jail = false;
	this.jailroll = 0;
	this.communityChestJailCard = false;
	this.chanceJailCard = false;
	this.bidding = true;
	this.human = true;
	// this.AI = null;

	this.pay = function (amount, creditor) {
		if (amount <= this.money) {
			this.money -= amount;

			if (typeof game !== 'undefined' && game && game.ui && typeof game.ui.updateMoney === 'function') {
				game.ui.updateMoney();
			}

			return true;
		} else {
			this.money -= amount;
			this.creditor = creditor;

			if (typeof game !== 'undefined' && game && game.ui && typeof game.ui.updateMoney === 'function') {
				game.ui.updateMoney();
			}

			return false;
		}
	};
}

// paramaters:
// initiator: object Player
// recipient: object Player
// money: integer, positive for offered, negative for requested
// property: array of integers, length: 40
// communityChestJailCard: integer, 1 means offered, -1 means requested, 0 means neither
// chanceJailCard: integer, 1 means offered, -1 means requested, 0 means neither
function Trade(initiator, recipient, money, property, communityChestJailCard, chanceJailCard) {
	// For each property and get out of jail free cards, 1 means offered, -1 means requested, 0 means neither.
	money = Math.round(money);

	this.getInitiator = function() {
		return initiator;
	};

	this.getRecipient = function() {
		return recipient;
	};

	this.getProperty = function(index) {
		return property[index];
	};

	this.getMoney = function() {
		return money;
	};

	this.getCommunityChestJailCard = function() {
		return communityChestJailCard;
	};

	this.getChanceJailCard = function() {
		return chanceJailCard;
	};
}

var _global = typeof window !== 'undefined' ? window : globalThis;

var GameStateContext = _global.GameStateContext;
if (!GameStateContext && typeof module !== 'undefined' && module.exports) {
	GameStateContext = require('./game-state-context');
}
if (GameStateContext) {
	GameStateContext.install(_global, {
		game: _global.game,
		square: _global.square || [],
		communityChestCards: _global.communityChestCards || [],
		chanceCards: _global.chanceCards || [],
		player: _global.player || [],
		playersGame: _global.playersGame || [],
		pcount: typeof _global.pcount !== 'undefined' ? _global.pcount : 2,
		auctionEnabled: typeof _global.auctionEnabled !== 'undefined' ? _global.auctionEnabled : true,
		pendingAuction: typeof _global.pendingAuction !== 'undefined' ? _global.pendingAuction : -1,
		freeParkingTaxes: typeof _global.freeParkingTaxes !== 'undefined' ? _global.freeParkingTaxes : true,
		freeParkingPot: typeof _global.freeParkingPot !== 'undefined' ? _global.freeParkingPot : 0,
		turn: typeof _global.turn !== 'undefined' ? _global.turn : 0,
		doublecount: typeof _global.doublecount !== 'undefined' ? _global.doublecount : 0,
		lastGamePlayerCount: typeof _global.lastGamePlayerCount !== 'undefined' ? _global.lastGamePlayerCount : 2,
		lastKnownPosition: _global.lastKnownPosition || [],
		lastKnownJail: _global.lastKnownJail || [],
		playerOverlays: _global.playerOverlays || [],
		nextMoveDirection: typeof _global.nextMoveDirection !== 'undefined' ? _global.nextMoveDirection : 1,
		boardCorners: _global.boardCorners || [0, 10, 20, 30]
	});
}

// Rebuilds `square`, `communityChestCards`, and `chanceCards` from the currently active edition.
function redefineGame() {
	var edition = _global.Monopoly && _global.Monopoly.Editions ? _global.Monopoly.Editions.getActive() : null;

	if (edition) {
		var groups = edition.buildGroups();
		_global.square = edition.buildSquares(groups);
		_global.communityChestCards = edition.buildCommunityChestCards();
		_global.chanceCards = edition.buildChanceCards();
	}
}

_global.Player = Player;
_global.Trade = Trade;
_global.redefineGame = redefineGame;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		Player: Player,
		Trade: Trade,
		redefineGame: redefineGame,
		GameStateContext: GameStateContext
	};
}
