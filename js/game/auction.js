// Auction flow, mixed onto Game.prototype. All auction progress belongs to its Game instance.
(function() {
	var MAX_AI_BIDS_PER_AUCTION = 200;

	var updateAuctionHistory = function(gameInstance, entry) {
		gameInstance.auctionState.history.push(entry);
		if (gameInstance.ui) gameInstance.ui.onAuctionHistory(entry);
	};

	var updateAuctionParticipants = function(gameInstance) {
		if (gameInstance.ui) gameInstance.ui.onAuctionParticipants();
	};

	var startAIBid = function(gameInstance) {
		var state = gameInstance.auctionState;
		var bidder = player[state.currentBidder];
		state.aiBidCount++;
		var bid = bidder.AI && typeof bidder.AI.bid === 'function'
			? bidder.AI.bid(state.property, state.highestBid)
			: 0;

		if (bid === -1 || bid > bidder.money) {
			bidder.bidding = false;
			bidder.auctionStatus = "Out";
			updateAuctionHistory(gameInstance, bidder.name + " exited.");
		} else if (bid === 0 || !Number.isInteger(bid) || bid <= state.highestBid) {
			bidder.bidding = false;
			bidder.auctionStatus = "Passing";
			updateAuctionHistory(gameInstance, bidder.name + " passed.");
		} else {
			gameInstance.auctionBid(bid);
		}

		gameInstance.auctionPass(true);
	};

	var finalizeAuction = function(gameInstance) {
		var state = gameInstance.auctionState;
		var p = player[state.highestBidder];
		var sq = square[state.property];

		if (state.highestBid > 0) {
			p.pay(state.highestBid, 0);
			sq.owner = state.highestBidder;
			if (gameInstance.ui) gameInstance.ui.alert(p.name + " bought " + sq.name + " for $" + state.highestBid + ".", state.highestBidder);
			updateAuctionHistory(gameInstance, p.name + " won for $" + state.highestBid + ".");
			if (gameInstance.ui) gameInstance.ui.updateOwned();
		} else {
			updateAuctionHistory(gameInstance, "No player bought " + sq.name + ".");
			if (gameInstance.ui) gameInstance.ui.alert(sq.name + " remains on the market because there were no buyers at the auction.");
		}
		if (gameInstance.ui) gameInstance.ui.closeAuction();

		for (var i = 1; i <= pcount; i++) {
			player[i].bidding = true;
			player[i].auctionStatus = "Bidding";
		}

		if (!gameInstance.auction()) {
			if (player[turn].human) {
				if (doublecount > 0) {
					if (gameInstance.ui) gameInstance.ui.updateButtonState("Roll again", "You threw doubles. Roll again.");
				} else {
					if (gameInstance.ui) gameInstance.ui.updateButtonState("End turn", "End turn and advance to the next player.");
				}
			} else {
				play();
			}
		}
	};

	Game.prototype.addPropertyToAuctionQueue = function(propertyIndex) {
		this.auctionState.queue.push(propertyIndex);
	};

	Game.prototype.auction = function() {
		var state = this.auctionState;
		if (state.queue.length === 0) {
			return false;
		}

		var index = state.queue.shift();

		var s = square[index];

		if (s.price === 0 || s.owner !== 0) {
			return this.auction();
		}

		state.property = index;
		state.highestBidder = 0;
		state.highestBid = 0;
		state.aiBidCount = 0;
		state.history = [];
		state.currentBidder = turn >= 1 && turn <= pcount ? turn : turn + 1;

		if (state.currentBidder > pcount) {
			state.currentBidder -= pcount;
		}

		for (var i = 1; i <= pcount; i++) {
			player[i].bidding = true;
			player[i].auctionStatus = "Bidding";
		}

		if (this.ui && this.ui.isHeadless) {
			startAIBid(this);
			return true;
		}

		if (this.ui) this.ui.openAuction(state.property, s, player[state.currentBidder]);

		if (!player[state.currentBidder].human) startAIBid(this);
		return true;
	};

	Game.prototype.auctionPass = function(isBid) {
		var state = this.auctionState;
		if (!isBid && player[state.currentBidder].bidding) {
			player[state.currentBidder].bidding = false;
			player[state.currentBidder].auctionStatus = "Passing";
			updateAuctionHistory(this, player[state.currentBidder].name + " passed.");
			updateAuctionParticipants(this);
		}
		if (state.highestBidder === 0) {
			state.highestBidder = state.currentBidder;
		}

		while (true) {
			state.currentBidder++;

			if (state.currentBidder > pcount) {
				state.currentBidder -= pcount;
			}

			if (state.currentBidder == state.highestBidder) {
				finalizeAuction(this);
				return;
			} else if (player[state.currentBidder].bidding) {
				var p = player[state.currentBidder];

				if (!p.human) {
					if (state.aiBidCount >= MAX_AI_BIDS_PER_AUCTION) {
						state.currentBidder = state.highestBidder;
						finalizeAuction(this);
						return;
					}
					state.aiBidCount++;
					var bid = p.AI.bid(state.property, state.highestBid);

					if (bid === -1 || bid > p.money) {
						p.bidding = false;
						p.auctionStatus = "Out";
						updateAuctionHistory(this, p.name + " exited.");
						updateAuctionParticipants(this);
						continue;

					} else if (bid === 0 || !Number.isInteger(bid) || bid <= state.highestBid) {
						p.bidding = false;
						p.auctionStatus = "Passing";
						updateAuctionHistory(this, p.name + " passed.");
						updateAuctionParticipants(this);
						continue;

					} else if (bid > 0) {
						this.auctionBid(bid);
						continue;
					}
					return;
				} else {
					break;
				}
			}

		}

		if (this.ui) this.ui.updateAuctionTurn(player[state.currentBidder].name, true);
	};

	Game.prototype.auctionBid = function(bid) {
		var state = this.auctionState;
		if (bid === undefined) bid = this.ui ? this.ui.readAuctionBid() : 0;

		if (bid === "" || bid === null) {
			if (this.ui) this.ui.setAuctionBidError("Please enter a bid.");
		} else if (isNaN(bid)) {
			if (this.ui) this.ui.setAuctionBidError("Your bid must be a number.");
		} else {

			if (bid > player[state.currentBidder].money) {
				if (this.ui) this.ui.setAuctionBidError("You don't have enough money to bid $" + bid + ".");
			} else if (bid > state.highestBid) {
				state.highestBid = bid;
				state.highestBidder = state.currentBidder;
				if (this.ui) this.ui.updateAuctionBid(parseInt(bid, 10), player[state.highestBidder].name);
				updateAuctionHistory(this, player[state.currentBidder].name + " bid $" + state.highestBid + ".");

				if (this.ui) this.ui.focusAuctionBid();

				if (player[state.currentBidder].human) {
					this.auctionPass(true);
				}
			} else {
				if (this.ui) this.ui.setAuctionBidError("Your bid must be greater than highest bid. ($" + state.highestBid + ")");
			}
		}
	};

	Game.prototype.auctionExit = function() {
		var state = this.auctionState;
		player[state.currentBidder].bidding = false;
		player[state.currentBidder].auctionStatus = "Out";
		updateAuctionHistory(this, player[state.currentBidder].name + " exited.");
		updateAuctionParticipants(this);
		this.auctionPass();
	};
})();
