// Auction rules over stable square IDs. Controllers supply all bidder actions.
(function() {
    'use strict';
    function player(game, seat) { return game.state.player[seat]; }
    function history(game, text) {
        game.auctionState.history.push(text);
        if (game.ui && game.ui.onAuctionHistory) game.ui.onAuctionHistory(text);
    }
    function participants(game) {
        if (game.ui && game.ui.onAuctionParticipants) game.ui.onAuctionParticipants();
    }
    function nextBidder(game, afterSeat) {
        var a = game.auctionState, state = game.state;
        for (var offset = 1; offset <= state.pcount; offset++) {
            var seat = (afterSeat + offset - 1) % state.pcount + 1;
            // The declining player joins only after another player opens bidding.
            // Passes apply to the current price; exits apply to the entire auction.
            if (!a.highestBid && seat === a.initiator) continue;
            if (seat !== a.highestBidder && player(game, seat).bidding && !a.passed.has(seat)) return seat;
        }
        return 0;
    }
    Game.prototype.addPropertyToAuctionQueue = function(squareId) {
        getSquare(this.state.board, squareId);
        this.auctionState.queue.push(squareId);
    };
    Game.prototype.auctionBid = function(amount) {
        var a = this.auctionState, bidder = player(this, a.currentBidder);
        var square = this.state.board.squaresById[a.property];
        if (!a.active || !square || square.rules.purchasePrice <= 0 || GameStateContext.getSquareState(this.state, a.property).ownerId !== null || !bidder || !bidder.bidding || !Number.isFinite(bidder.money) || !Number.isInteger(amount) || amount <= a.highestBid || amount <= 0 || amount > bidder.money) return false;
        a.highestBid = amount; a.highestBidder = a.currentBidder;
        a.passed.clear();
        for (var seat = 1; seat <= this.state.pcount; seat++) {
            if (player(this, seat).bidding) player(this, seat).auctionStatus = 'Bidding';
        }
        if (this.ui && this.ui.updateAuctionBid) this.ui.updateAuctionBid(amount, bidder.name);
        history(this, bidder.name + ' bid $' + amount + '.');
        participants(this);
        return true;
    };
    Game.prototype.auctionPass = function() {
        var bidder = player(this, this.auctionState.currentBidder);
        if (!this.auctionState.active || !bidder || !bidder.bidding) return false;
        this.auctionState.passed.add(this.auctionState.currentBidder);
        bidder.auctionStatus = 'Passing';
        history(this, bidder.name + ' passed.'); participants(this); return true;
    };
    Game.prototype.auctionExit = function() {
        var bidder = player(this, this.auctionState.currentBidder);
        if (!this.auctionState.active || !bidder || !bidder.bidding) return false;
        bidder.bidding = false; bidder.auctionStatus = 'Out';
        history(this, bidder.name + ' exited.'); participants(this); return true;
    };
    Game.prototype.auction = async function() {
        var a = this.auctionState, state = this.state, processed = false;
        if (a.running) throw new Error('An auction is already running.');
        a.running = true;
        try {
            while (a.queue.length && !this.isOver) {
                var id = a.queue.shift(), square = getSquare(state.board, id);
                if (square.rules.purchasePrice <= 0 || GameStateContext.getSquareState(state, id).ownerId !== null) continue;
                processed = true;
                a.property = id; a.highestBidder = 0; a.highestBid = 0; a.history = []; a.active = true;
                a.initiator = state.turn >= 1 && state.turn <= state.pcount ? state.turn : 0;
                a.passed = new Set();
                for (var i = 1; i <= state.pcount; i++) {
                    player(this, i).bidding = true; player(this, i).auctionStatus = 'Bidding';
                }
                a.currentBidder = nextBidder(this, a.initiator);
                if (!a.currentBidder) a.active = false;
                if (a.active && this.ui && this.ui.openAuction) this.ui.openAuction(id, square, player(this, a.currentBidder));
                while (a.active && !this.isOver) {
                    var bidder = player(this, a.currentBidder);
                    var action = await this.requestDecision('auction', bidder.playerId, { squareId: id, currentBid: a.highestBid, name: bidder.name });
                    if (!action) break;
                    if (action.type === 'auctionBid') {
                        if (!this.auctionBid(action.amount)) throw new Error('Auction bid became invalid.');
                    } else this[action.type]();
                    var next = nextBidder(this, a.currentBidder);
                    if (next) a.currentBidder = next;
                    else a.active = false;
                }
                if (a.highestBid > 0) {
                    var winner = player(this, a.highestBidder);
                    winner.pay(a.highestBid, GameStateContext.BANK_ID);
                    GameStateContext.setSquareOwner(state, id, winner.playerId);
                    history(this, winner.name + ' won for $' + a.highestBid + '.');
                    if (this.ui && this.ui.alert) this.ui.alert(winner.name + ' bought ' + square.presentation.label + ' for $' + a.highestBid + '.', a.highestBidder);
                } else {
                    history(this, 'No player bought ' + square.presentation.label + '.');
                    if (this.ui && this.ui.alert) this.ui.alert(square.presentation.label + ' remains on the market because there were no buyers at the auction.');
                }
                if (this.ui && this.ui.closeAuction) this.ui.closeAuction();
                for (var seat = 1; seat <= state.pcount; seat++) {
                    player(this, seat).bidding = true; player(this, seat).auctionStatus = 'Bidding';
                }
            }
            return processed;
        } finally { a.active = false; a.running = false; }
    };
})();
