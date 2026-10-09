// Player/Trade data types and accessors for the active Game state.

function Player(name, color, game) {
	this.name = name;
	this.color = color;
	this.game = game || null;
	this.squareId = 'go';
	this._position = 0;
	Object.defineProperty(this, 'position', {
		enumerable: false,
		configurable: false,
		get: function() {
			var board = this.game && this.game.state && this.game.state.board;
			if (!board) return this._position;
			var currentId = board.startSquareId;
			for (var index = 0; index < Object.keys(board.squaresById).length; index++) {
				if (currentId === this.squareId) { this._position = index; return index; }
				currentId = board.squaresById[currentId].nextId;
			}
			return this._position;
		},
		set: function(value) {
			if (!Number.isInteger(value)) throw new RangeError('Position must be a board index.');
			var board = this.game && this.game.state && this.game.state.board;
			if (!board) { this._position = value; return; }
			var count = Object.keys(board.squaresById).length;
			var target = ((value % count) + count) % count;
			var currentId = board.startSquareId;
			for (var index = 0; index < target; index++) currentId = board.squaresById[currentId].nextId;
			this.squareId = currentId;
			this._position = target;
		}
	});
	this.money = 1500;
	this.creditor = -1;
	this.jail = false;
	this.jailroll = 0;
	this.heldCards = [];
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
			if (creditor === 0 || creditor === 'bank' || creditor === undefined || creditor === null) this.creditor = 'bank';
			else if (typeof creditor === 'number' && this.game && this.game.state.player[creditor]) this.creditor = this.game.state.player[creditor].playerId;
			else this.creditor = creditor;

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
