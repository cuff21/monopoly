// Bankruptcy and elimination transfer structured assets before changing active seats.
(function() {
	'use strict';
	function props(game, ownerId) {
		var state = game.state;
		return Object.keys(state.board.squaresById).filter(function(id) {
			return GameStateContext.getSquareState(state, id).ownerId === ownerId;
		});
	}
	function activeCreditor(game, id) {
		if (id === GameStateContext.BANK_ID || id === 0 || id === null || id === undefined || id === -1) return null;
		return GameStateContext.getPlayerById(game.state, id);
	}
	Game.prototype.eliminatePlayer = function() {
		var s = this.state, p = s.player[s.turn], seat = p.index;
		if (this.ui && this.ui.removePlayerToken) this.ui.removePlayerToken(p.playerId);
		p.active = false; p.eliminated = true;
		for (var i = seat; i < s.pcount; i++) {
			s.player[i] = s.player[i + 1]; s.player[i].index = i;
		}
		s.pcount--; s.player.length = s.pcount + 1; s.turn = Math.max(0, s.turn - 1);
		if (this.ui && this.ui.onPlayerCountChanged) this.ui.onPlayerCountChanged(s.pcount);
		if (s.pcount === 1) {
			this.isOver = true; this.completeGame();
			if (this.ui && this.ui.onGameOver) this.ui.onGameOver(s.player[1].name);
		}
	};
	Game.prototype.bankruptcyUnmortgage = async function(inheritedIds) {
        var p = this.state.player[this.state.turn], creditor = activeCreditor(this, p.creditor);
        if (creditor) await this.requestDecision('inherit', creditor.playerId, { squareIds: inheritedIds, name: creditor.name });
        this.eliminatePlayer();
    };
	Game.prototype.confirmBankruptcyUnmortgage = function(squareId) {
		var s = this.state, ss = GameStateContext.getSquareState(s, squareId), creditor = activeCreditor(this, ss.ownerId);
		if (!creditor || !ss.mortgage) return false;
		var amount = Math.round(getSquare(s.board, squareId).rules.purchasePrice * 0.5);
		if (amount > creditor.money) return false;
		creditor.pay(amount, GameStateContext.BANK_ID); ss.mortgage = false;
		if (this.ui && this.ui.updateOwned) this.ui.updateOwned(); if (this.ui && this.ui.updateMoney) this.ui.updateMoney();
		return true;
	};
	Game.prototype.bankruptcy = async function() {
		var s = this.state, p = s.player[s.turn], creditor = activeCreditor(this, p.creditor), creditorId = creditor ? creditor.playerId : GameStateContext.BANK_ID;
		if (p.money >= 0) return false;
		if (this.ui && this.ui.alert) this.ui.alert(p.name + ' is bankrupt.');
		if (this.ui && this.ui.onPlayerBankrupt) this.ui.onPlayerBankrupt(p, creditor);
		if (creditor) creditor.money += p.money;
		var fee = 0, inheritedIds = [];
		props(this, p.playerId).forEach(function(id) {
			var ss = GameStateContext.getSquareState(s, id), sq = getSquare(s.board, id);
			if (ss.mortgage && creditor) { fee += Math.round(sq.rules.purchasePrice * 0.1); inheritedIds.push(id); }
			if (ss.house || ss.hotel) {
				if (creditor) creditor.money += sq.rules.houseCost * 0.5 * ss.house;
				ss.house = 0; ss.hotel = 0;
			}
			if (!creditor) { ss.mortgage = false; GameStateContext.setSquareOwner(s, id, null); this.addPropertyToAuctionQueue(id); }
			else GameStateContext.setSquareOwner(s, id, creditorId);
		}, this);
		p.heldCards.splice(0).forEach(function(cardId) {
			if (creditor) creditor.heldCards.push(cardId);
			else GameStateContext.returnHeldCard(s, cardId);
		});
		if (s.pcount === 2 || !creditor || fee === 0) return this.eliminatePlayer();
        await this.requestDecision('acknowledge', creditor.playerId, { message: creditor.name + ' must pay $' + fee + ' interest on inherited mortgaged property.' });
        creditor.pay(fee, GameStateContext.BANK_ID);
        await this.bankruptcyUnmortgage(inheritedIds);
    };
})();
