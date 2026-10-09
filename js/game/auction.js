// Per-Game auctions identify properties by stable square ID.
(function() {
	'use strict';
	var MAX_AI_BIDS_PER_AUCTION = 200;
	function player(game, seat) { return game.state.player[seat]; }
	function square(game, squareId) { return getSquare(game.state.board, squareId); }
	function squareState(game, squareId) { return GameStateContext.getSquareState(game.state, squareId); }
	function history(game, text) { game.auctionState.history.push(text); if (game.ui && game.ui.onAuctionHistory) game.ui.onAuctionHistory(text); }
	function advance(game, isBid) {
		var a = game.auctionState, s = game.state;
		if (!isBid && player(game, a.currentBidder).bidding) {
			player(game, a.currentBidder).bidding = false; history(game, player(game, a.currentBidder).name + ' passed.');
		}
		if (a.highestBidder === 0) a.highestBidder = a.currentBidder;
		while (true) {
			a.currentBidder = a.currentBidder % s.pcount + 1;
			if (a.currentBidder === a.highestBidder) { finalize(game); return; }
			var bidder = player(game, a.currentBidder);
			if (!bidder.bidding) continue;
			if (bidder.human) break;
			if (a.aiBidCount++ >= MAX_AI_BIDS_PER_AUCTION) { a.currentBidder = a.highestBidder; finalize(game); return; }
			var bid = bidder.AI && bidder.AI.bid(a.property, a.highestBid);
			if (bid === -1 || bid > bidder.money || bid === 0 || !Number.isInteger(bid) || bid <= a.highestBid) {
				bidder.bidding = false; history(game, bidder.name + ' passed.'); continue;
			}
			game.auctionBid(bid);
			advance(game, true);
			return;
		}
		if (game.ui && game.ui.updateAuctionTurn) game.ui.updateAuctionTurn(player(game, a.currentBidder).name, true);
	}
	function finalize(game) {
		var a = game.auctionState, s = game.state, sq = square(game, a.property);
		if (a.highestBid > 0) {
			var winner = player(game, a.highestBidder);
			winner.pay(a.highestBid, GameStateContext.BANK_ID);
			GameStateContext.setSquareOwner(s, a.property, winner.playerId);
			history(game, winner.name + ' won for $' + a.highestBid + '.');
		} else history(game, 'No player bought ' + sq.presentation.label + '.');
		if (game.ui && game.ui.closeAuction) game.ui.closeAuction();
		for (var i = 1; i <= s.pcount; i++) player(game, i).bidding = true;
		if (!game.auction() && !player(game, s.turn).human && typeof game.play === 'function') game.play();
	}
	function startBid(game) {
		var a = game.auctionState, bidder = player(game, a.currentBidder);
		if (bidder.human) return;
		var bid = bidder.AI && bidder.AI.bid ? bidder.AI.bid(a.property, a.highestBid) : 0;
		if (Number.isInteger(bid) && bid > a.highestBid && bid > 0 && bid <= bidder.money) {
			game.auctionBid(bid); advance(game, true);
		} else { bidder.bidding = false; advance(game, false); }
	}
	Game.prototype.addPropertyToAuctionQueue = function(squareId) {
		square(this, squareId);
		this.auctionState.queue.push(squareId);
	};
	Game.prototype.auction = function() {
		var a = this.auctionState, s = this.state;
		while (a.queue.length) {
			var id = a.queue.shift(), sq = square(this, id), ss = squareState(this, id);
			if (sq.rules.purchasePrice <= 0 || ss.ownerId !== null) continue;
			a.property = id; a.highestBidder = 0; a.highestBid = 0; a.aiBidCount = 0; a.history = [];
			a.currentBidder = s.turn >= 1 && s.turn <= s.pcount ? s.turn : s.turn % s.pcount + 1;
			for (var i = 1; i <= s.pcount; i++) player(this, i).bidding = true;
			if (this.ui && this.ui.openAuction && !this.ui.isHeadless) this.ui.openAuction(id, sq, player(this, a.currentBidder));
			if (this.ui && this.ui.isHeadless) startBid(this);
			else if (!player(this, a.currentBidder).human) startBid(this);
			return true;
		}
		return false;
	};
	Game.prototype.auctionPass = function(isBid) { advance(this, !!isBid); };
	Game.prototype.auctionBid = function(bid) {
		var a = this.auctionState, bidder = player(this, a.currentBidder);
		if (bid === undefined) bid = this.ui && this.ui.readAuctionBid ? this.ui.readAuctionBid() : 0;
		bid = Number(bid);
		var validAuction = typeof a.property === 'string' && !!this.state.board.squaresById[a.property] && squareState(this, a.property).ownerId === null && square(this, a.property).rules.purchasePrice > 0;
		if (!validAuction || !bidder || !bidder.bidding || !Number.isInteger(bid) || bid <= a.highestBid || bid <= 0 || bid > bidder.money) {
			if (this.ui && this.ui.setAuctionBidError) this.ui.setAuctionBidError('Bid must be a positive whole amount above the current bid and within available cash.');
			return false;
		}
		a.highestBid = bid; a.highestBidder = a.currentBidder;
		if (this.ui && this.ui.updateAuctionBid) this.ui.updateAuctionBid(bid, bidder.name);
		history(this, bidder.name + ' bid $' + bid + '.');
		if (bidder.human) advance(this, true);
		return true;
	};
	Game.prototype.auctionExit = function() {
		var bidder = player(this, this.auctionState.currentBidder); bidder.bidding = false;
		history(this, bidder.name + ' exited.'); advance(this, false);
	};
})();
