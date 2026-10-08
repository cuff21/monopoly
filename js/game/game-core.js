// The Game singleton's dice/turn-advance nucleus. Auction, trade, and bankruptcy behavior are
// mixed in as Game.prototype methods by auction.js, trade.js, and bankruptcy.js (loaded after this
// file); property-actions.js and turn-flow.js are free functions Game methods call into.
function Game(ui) {
	var self = this;
	var die1;
	var die2;
	var areDiceRolled = false;

	this.ui = ui || ((typeof UIBridge !== 'undefined') ? UIBridge.createDefaultUI() : null);
	this.auctionState = {
		queue: [],
		highestBidder: 0,
		highestBid: 0,
		currentBidder: 1,
		property: -1,
		history: []
	};
	this.tradeState = { initiator: null, recipient: null };

	var _g = typeof window !== 'undefined' ? window : globalThis;
	this.state = typeof GameStateContext !== 'undefined' && GameStateContext
		? GameStateContext.getCurrentState()
		: null;
	_g.game = this;

	this.rollDice = function() {
		die1 = Math.floor(Math.random() * 6) + 1;
		die2 = Math.floor(Math.random() * 6) + 1;
		areDiceRolled = true;
	};

	this.resetDice = function() {
		areDiceRolled = false;
	};

	this.next = async function() {
		if (self.isOver) {
			if (typeof self.onGameCompleted === 'function') {
				self.onGameCompleted();
			}
			return;
		}
		if (self.ui && typeof self.ui.waitForPopupClose === 'function') {
			await self.ui.waitForPopupClose();
		}
		var p = player[turn];
		if (pendingAuction !== -1 && auctionEnabled) {
			self.addPropertyToAuctionQueue(pendingAuction);
			pendingAuction = -1;
		}
		if (self.auction()) {
			return;
		}
		if (!p.human && p.money < 0) {
			p.AI.payDebt();

			if (p.money < 0) {
				if (self.ui && self.ui.isHeadless) {
					self.bankruptcy();
				} else if (self.ui && typeof self.ui.showMessage === 'function') {
					self.ui.showMessage(p.name + " is bankrupt. All of its assets will be turned over to " + player[p.creditor].name + ".", self.bankruptcy);
				} else {
					self.bankruptcy();
				}
			} else if (areDiceRolled && doublecount === 0) {
				play();
			} else {
				roll();
			}
		} else if (areDiceRolled && doublecount === 0) {
			play();
		} else {
			roll();
		}
	};

	this.getDie = function(die) {
		if (die === 1) {

			return die1;
		} else {

			return die2;
		}

	};

	if (typeof this._initTradeInputHandlers === 'function' && (!this.ui || !this.ui.isHeadless)) {
		this._initTradeInputHandlers();
	}
}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Game = Game;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { Game: Game };
}
