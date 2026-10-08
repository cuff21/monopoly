// The Game instance's dice/turn-advance nucleus. Auction, trade, and bankruptcy behavior are
// mixed in as Game.prototype methods by auction.js, trade.js, and bankruptcy.js (loaded after this
// file); property-actions.js and the Game-scoped turn flow supply the remaining methods.
function Game(ui, state) {
	var self = this;
	var die1;
	var die2;
	var areDiceRolled = false;

	this.ui = ui || ((typeof UIBridge !== 'undefined') ? UIBridge.createDefaultUI() : null);
	if (this.ui) this.ui.game = this;
	this.auctionState = {
		queue: [],
		highestBidder: 0,
		highestBid: 0,
		currentBidder: 1,
		property: -1,
		history: []
	};
	this.tradeState = { initiator: null, recipient: null };

	this.state = state || (typeof GameStateContext !== 'undefined' && GameStateContext
		? GameStateContext.createState()
		: {});

	this.rollDice = function() {
		die1 = Math.floor(Math.random() * 6) + 1;
		die2 = Math.floor(Math.random() * 6) + 1;
		areDiceRolled = true;
	};

	this.resetDice = function() {
		areDiceRolled = false;
	};

	this.next = async function() {
		var state = self.state;
		if (self.isOver) {
			if (typeof self.onGameCompleted === 'function') {
				self.onGameCompleted();
			}
			return;
		}
		if (self.ui && typeof self.ui.waitForPopupClose === 'function') {
			await self.ui.waitForPopupClose();
		}
		var p = state.player[state.turn];
		if (state.pendingAuction !== -1 && state.auctionEnabled) {
			self.addPropertyToAuctionQueue(state.pendingAuction);
			state.pendingAuction = -1;
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
					self.ui.showMessage(p.name + " is bankrupt. All of its assets will be turned over to " + state.player[p.creditor].name + ".", self.bankruptcy.bind(self));
				} else {
					self.bankruptcy();
				}
			} else if (areDiceRolled && state.doublecount === 0) {
				if (typeof self.play === 'function') self.play();
			} else {
				if (typeof self.roll === 'function') self.roll();
			}
		} else if (areDiceRolled && state.doublecount === 0) {
			if (typeof self.play === 'function') self.play();
		} else {
			if (typeof self.roll === 'function') self.roll();
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
