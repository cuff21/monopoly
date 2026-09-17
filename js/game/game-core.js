// The Game singleton's dice/turn-advance nucleus. Auction, trade, and bankruptcy behavior are
// mixed in as Game.prototype methods by auction.js, trade.js, and bankruptcy.js (loaded after this
// file); property-actions.js and turn-flow.js are free functions Game methods call into.
function Game() {
	var die1;
	var die2;
	var areDiceRolled = false;

	this.rollDice = function() {
		die1 = Math.floor(Math.random() * 6) + 1;
		die2 = Math.floor(Math.random() * 6) + 1;
		areDiceRolled = true;
	};

	this.resetDice = function() {
		areDiceRolled = false;
	};

	this.next = async function() {
		while (!$("#popupwrap").is(":hidden")) {
			await sleep(10);
		}
		var p = player[turn];
		if (pendingAuction !== -1 && auctionEnabled) {
			game.addPropertyToAuctionQueue(pendingAuction);
			pendingAuction = -1;
		}
		if (game.auction()) {
			return;
		}
		if (!p.human && p.money < 0) {
			p.AI.payDebt();

			if (p.money < 0) {
				popup("<p>" + p.name + " is bankrupt. All of its assets will be turned over to " + player[p.creditor].name + ".</p>", game.bankruptcy);
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

	this._initTradeInputHandlers();
}

var game;
