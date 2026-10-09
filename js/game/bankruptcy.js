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
		if (this.ui && this.ui.removePlayerToken) this.ui.removePlayerToken(seat);
		p.active = false; p.eliminated = true;
		for (var i = seat; i < s.pcount; i++) {
			s.player[i] = s.player[i + 1]; s.player[i].index = i;
			s.playerOverlays[i] = s.playerOverlays[i + 1];
			s.lastKnownPosition[i] = s.lastKnownPosition[i + 1]; s.lastKnownJail[i] = s.lastKnownJail[i + 1];
		}
		s.player.length = s.pcount + 1; s.playerOverlays.length = s.pcount; s.lastKnownPosition.length = s.pcount; s.lastKnownJail.length = s.pcount;
		s.pcount--; s.turn = Math.max(0, s.turn - 1);
		if (this.ui && this.ui.onPlayerCountChanged) this.ui.onPlayerCountChanged(s.pcount);
		if (s.pcount === 1) {
			this.isOver = true; if (this.onGameCompleted) this.onGameCompleted();
			if (this.ui && this.ui.onGameOver) this.ui.onGameOver(s.player[1].name);
		} else if (typeof this.play === 'function') this.play();
	};
	Game.prototype.bankruptcyUnmortgage = function() {
		var s = this.state, p = s.player[s.turn], creditor = activeCreditor(this, p.creditor);
		if (!creditor) return this.eliminatePlayer();
		var pending = props(this, creditor.playerId).filter(function(id) { return GameStateContext.getSquareState(s, id).mortgage; }).map(function(id) {
			var sq = getSquare(s.board, id);
			return { squareId: id, name: sq.presentation.label, color: sq.presentation.color, price: Math.round(sq.rules.purchasePrice * 0.5) };
		});
		if (!pending.length || !this.ui || !this.ui.showBankruptcyUnmortgage) return this.eliminatePlayer();
		this.ui.showBankruptcyUnmortgage(creditor.name, pending, function(squareId) { return this.confirmBankruptcyUnmortgage(squareId); }.bind(this), this.eliminatePlayer.bind(this));
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
	Game.prototype.botBankruptcyUnmortgage = function(bankruptPlayer, creditor) {
		var s = this.state, liquidityFloor = creditor.AI && creditor.AI.getLiquidityFloor ? creditor.AI.getLiquidityFloor() : Math.max(100, creditor.money * 0.25);
		var defensive = creditor.AI && creditor.AI.profile && creditor.AI.profile.name === 'Defensive';
		props(this, bankruptPlayer.playerId).forEach(function(id) {
			var ss = GameStateContext.getSquareState(s, id); if (!ss.mortgage) return;
			GameStateContext.setSquareOwner(s, id, creditor.playerId);
			var cost = Math.round(getSquare(s.board, id).rules.purchasePrice * 0.5);
			if (!defensive && creditor.money - cost >= liquidityFloor) { creditor.pay(cost, GameStateContext.BANK_ID); ss.mortgage = false; }
		});
	};
	Game.prototype.resign = function() { this.ui.confirm('Are you sure you want to resign?', this.bankruptcy.bind(this)); };
	Game.prototype.bankruptcy = function() {
		var s = this.state, p = s.player[s.turn], creditor = activeCreditor(this, p.creditor), creditorId = creditor ? creditor.playerId : GameStateContext.BANK_ID;
		if (p.money >= 0) return false;
		if (this.ui && this.ui.alert) this.ui.alert(p.name + ' is bankrupt.');
		if (this.ui && this.ui.onPlayerBankrupt) this.ui.onPlayerBankrupt(p, creditor);
		if (creditor) creditor.money += p.money;
		var fee = 0;
		props(this, p.playerId).forEach(function(id) {
			var ss = GameStateContext.getSquareState(s, id), sq = getSquare(s.board, id);
			if (ss.mortgage && creditor) fee += Math.round(sq.rules.purchasePrice * 0.1);
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
		if (!creditor || fee === 0) return this.eliminatePlayer();
		var continueBankruptcy = function() {
			creditor.pay(fee, GameStateContext.BANK_ID);
			if (creditor.human) this.bankruptcyUnmortgage();
			else { this.botBankruptcyUnmortgage(p, creditor); this.eliminatePlayer(); }
		}.bind(this);
		if (creditor.human && this.ui && this.ui.showMessage) this.ui.showMessage(creditor.name + ' must pay $' + fee + ' interest on mortgaged property received from ' + p.name + '.', continueBankruptcy, undefined, 0);
		else continueBankruptcy();
	};
})();
