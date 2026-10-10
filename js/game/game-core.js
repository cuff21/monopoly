if (typeof module !== 'undefined' && module.exports) require('../application/player-controllers');
// The Game instance's dice/turn-advance nucleus. Auction, trade, and bankruptcy behavior are
// mixed in as Game.prototype methods by auction.js, trade.js, and bankruptcy.js (loaded after this
// file); property-actions.js and the Game-scoped turn flow supply the remaining methods.
function Game(ui, state) {
	var self = this;
	PlayerControllers.init(this);
	var die1;
	var die2;

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
	this.decisionView = this.state.board && GameStateContext
		? GameStateContext.getDecisionView(this.state)
		: null;

	this.rollDice = function() {
		var random = typeof self.state.random === 'function' ? self.state.random : Math.random;
		die1 = Math.floor(random() * 6) + 1;
		die2 = Math.floor(random() * 6) + 1;
	};

	this.resetDice = function() {
		die1 = undefined; die2 = undefined;
	};

	this.next = function() { return self.submitPlayerAction({ type: 'next' }); };

	this.getDie = function(die) {
		if (die === 1) {

			return die1;
		} else {

			return die2;
		}

	};


}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Game = Game;
PlayerControllers.install(Game);

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { Game: Game };
}
