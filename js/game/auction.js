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
		var bidder = gameInstance.state.player[state.currentBidder];
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
		var gameState = gameInstance.state;
		var p = gameState.player[state.highestBidder];
		var sq = gameState.square[state.property];

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

		for (var i = 1; i <= gameState.pcount; i++) {
			gameState.player[i].bidding = true;
			gameState.player[i].auctionStatus = "Bidding";
		}

		if (!gameInstance.auction()) {
			if (gameState.player[gameState.turn].human) {
				if (gameState.doublecount > 0) {
					if (gameInstance.ui) gameInstance.ui.updateButtonState("Roll again", "You threw doubles. Roll again.");
				} else {
					if (gameInstance.ui) gameInstance.ui.updateButtonState("End turn", "End turn and advance to the next player.");
				}
			} else {
				if (typeof gameInstance.play === 'function') gameInstance.play();
			}
		}
	};

	Game.prototype.addPropertyToAuctionQueue = function(propertyIndex) {
		this.auctionState.queue.push(propertyIndex);
	};

	Game.prototype.auction = function() {
		var state = this.auctionState;
		var gameState = this.state;
		if (state.queue.length === 0) {
			return false;
		}

		var index = state.queue.shift();

		var s = gameState.square[index];

		if (s.price === 0 || s.owner !== 0) {
			return this.auction();
		}

		state.property = index;
		state.highestBidder = 0;
		state.highestBid = 0;
		state.aiBidCount = 0;
		state.history = [];
		state.currentBidder = gameState.turn >= 1 && gameState.turn <= gameState.pcount ? gameState.turn : gameState.turn + 1;

		if (state.currentBidder > gameState.pcount) {
			state.currentBidder -= gameState.pcount;
		}

		for (var i = 1; i <= gameState.pcount; i++) {
			gameState.player[i].bidding = true;
			gameState.player[i].auctionStatus = "Bidding";
		}

		if (this.ui && this.ui.isHeadless) {
			startAIBid(this);
			return true;
		}

		if (this.ui) this.ui.openAuction(state.property, s, gameState.player[state.currentBidder]);

		if (!gameState.player[state.currentBidder].human) startAIBid(this);
		return true;
	};

	Game.prototype.auctionPass = function(isBid) {
		var state = this.auctionState;
		var gameState = this.state;
		if (!isBid && gameState.player[state.currentBidder].bidding) {
			gameState.player[state.currentBidder].bidding = false;
			gameState.player[state.currentBidder].auctionStatus = "Passing";
			updateAuctionHistory(this, gameState.player[state.currentBidder].name + " passed.");
			updateAuctionParticipants(this);
		}
		if (state.highestBidder === 0) {
			state.highestBidder = state.currentBidder;
		}

		while (true) {
			state.currentBidder++;

			if (state.currentBidder > gameState.pcount) {
				state.currentBidder -= gameState.pcount;
			}

			if (state.currentBidder == state.highestBidder) {
				finalizeAuction(this);
				return;
			} else if (gameState.player[state.currentBidder].bidding) {
				var p = gameState.player[state.currentBidder];

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

		if (this.ui) this.ui.updateAuctionTurn(gameState.player[state.currentBidder].name, true);
	};

	Game.prototype.auctionBid = function(bid) {
		var state = this.auctionState;
		var gameState = this.state;
		if (bid === undefined) bid = this.ui ? this.ui.readAuctionBid() : 0;

		if (bid === "" || bid === null) {
			if (this.ui) this.ui.setAuctionBidError("Please enter a bid.");
		} else if (isNaN(bid)) {
			if (this.ui) this.ui.setAuctionBidError("Your bid must be a number.");
		} else {

			if (bid > gameState.player[state.currentBidder].money) {
				if (this.ui) this.ui.setAuctionBidError("You don't have enough money to bid $" + bid + ".");
			} else if (bid > state.highestBid) {
				state.highestBid = bid;
				state.highestBidder = state.currentBidder;
				if (this.ui) this.ui.updateAuctionBid(parseInt(bid, 10), gameState.player[state.highestBidder].name);
				updateAuctionHistory(this, gameState.player[state.currentBidder].name + " bid $" + state.highestBid + ".");

				if (this.ui) this.ui.focusAuctionBid();

				if (gameState.player[state.currentBidder].human) {
					this.auctionPass(true);
				}
			} else {
				if (this.ui) this.ui.setAuctionBidError("Your bid must be greater than highest bid. ($" + state.highestBid + ")");
			}
		}
	};

	Game.prototype.auctionExit = function() {
		var state = this.auctionState;
		var bidder = this.state.player[state.currentBidder];
		bidder.bidding = false;
		bidder.auctionStatus = "Out";
		updateAuctionHistory(this, bidder.name + " exited.");
		updateAuctionParticipants(this);
		this.auctionPass();
	};
})();
