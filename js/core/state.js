// Player/Trade data types and accessors for the active Game state.

function Player(name, color, game) {
	this.name = name;
	this.color = color;
	this.game = game || null;
	this.squareId = 'go';
	this.money = 1500;
	this.creditor = null;
	this.jail = false;
	this.jailroll = 0;
	this.heldCards = [];
	this.bidding = true;
	this.human = true;
	// this.AI = null;

	this.pay = function (amount, creditor) {
		if (creditor !== GameStateContext.BANK_ID) {
			if (!this.game) throw new TypeError('Player payments require their owning Game.');
			GameStateContext.getPlayerById(this.game.state, creditor);
		}
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
// Offers use stable participant IDs and explicit square ID transfer lists.
function Trade(initiatorId, recipientId, money, offeredSquareIds, requestedSquareIds, heldCards) {
	this.initiatorId = initiatorId;
	this.recipientId = recipientId;
	this.offeredSquareIds = (offeredSquareIds || []).slice();
	this.requestedSquareIds = (requestedSquareIds || []).slice();
	this.heldCards = (heldCards || []).map(function(card) { return Object.assign({}, card); });
	money = Math.round(money || 0);

	this.getInitiator = function() {
		return initiatorId;
	};

	this.getRecipient = function() {
		return recipientId;
	};

	this.getOfferedSquareIds = function() { return this.offeredSquareIds.slice(); };
	this.getRequestedSquareIds = function() { return this.requestedSquareIds.slice(); };

	this.getMoney = function() {
		return money;
	};

	this.getHeldCards = function() { return this.heldCards.map(function(card) { return Object.assign({}, card); }); };
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
