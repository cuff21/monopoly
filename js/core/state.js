// Player/Trade data types and accessors for the active Game state.

function Player(name, color, game) {
	this.name = name;
	this.color = color;
	this.game = game || null;
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

			if (this.game && this.game.ui && typeof this.game.ui.updateMoney === 'function') {
				this.game.ui.updateMoney();
			}

			return true;
		} else {
			this.money -= amount;
			this.creditor = creditor;

			if (this.game && this.game.ui && typeof this.game.ui.updateMoney === 'function') {
				this.game.ui.updateMoney();
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

_global.Player = Player;
_global.Trade = Trade;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		Player: Player,
		Trade: Trade,
		GameStateContext: GameStateContext
	};
}
