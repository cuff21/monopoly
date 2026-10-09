// ID-based trade settlement. Trade UI adapters are migrated in Phase 5.
(function() {
	'use strict';
	function players(game, offer) {
		var context = GameStateContext;
		var initiator = context.getPlayerById(game.state, offer.getInitiator());
		var recipient = context.getPlayerById(game.state, offer.getRecipient());
		return { initiator: initiator, recipient: recipient };
	}
	function reverse(offer) {
		return new Trade(offer.getRecipient(), offer.getInitiator(), -offer.getMoney(), offer.getRequestedSquareIds(), offer.getOfferedSquareIds(), offer.getHeldCards().map(function(card) { card.direction *= -1; return card; }));
	}
	function validate(game, offer) {
		if (!(offer instanceof Trade)) throw new TypeError('Expected a Trade offer.');
		var parties = players(game, offer), s = game.state;
		if (parties.initiator === parties.recipient) throw new RangeError('Trade participants must differ.');
		var amount = offer.getMoney();
		if (!Number.isInteger(amount)) throw new RangeError('Trade money must be an integer.');
		if (amount > parties.initiator.money || -amount > parties.recipient.money) return null;
		var seen = Object.create(null);
		[[offer.getOfferedSquareIds(), parties.initiator.playerId], [offer.getRequestedSquareIds(), parties.recipient.playerId]].forEach(function(group) {
			group[0].forEach(function(id) {
				getSquare(s.board, id);
				if (seen[id]) throw new RangeError('A square may appear only once in a trade: ' + id);
				seen[id] = true;
				if (GameStateContext.getSquareState(s, id).ownerId !== group[1]) throw new RangeError('Trade participant does not own square ' + id);
			});
		});
		var heldCards = offer.getHeldCards();
		var heldCardIds = Object.create(null);
		for (var cardIndex = 0; cardIndex < heldCards.length; cardIndex++) {
			var transfer = heldCards[cardIndex];
			if ((transfer.direction !== 1 && transfer.direction !== -1) || heldCardIds[transfer.cardId]) return null;
			heldCardIds[transfer.cardId] = true;
			var from = transfer.direction === 1 ? parties.initiator : parties.recipient;
			if (!from.heldCards.includes(transfer.cardId)) return null;
			var identity;
			try { identity = GameStateContext.parseCardId(transfer.cardId); } catch (error) { return null; }
			var deck = Object.prototype.hasOwnProperty.call(s.cardDecks, identity.deckId) ? s.cardDecks[identity.deckId] : null;
			if (!deck || !deck.cards[identity.cardIndex] || !deck.cards[identity.cardIndex].keepable || !Array.isArray(deck.order) || deck.order.indexOf(identity.cardIndex) !== -1) return null;
		}
		if (!offer.getOfferedSquareIds().length && !offer.getRequestedSquareIds().length && !offer.getMoney() && !heldCards.length) return null;
		return parties;
	}
	Game.prototype.acceptTrade = function(offer) {
		var parties = validate(this, offer);
		if (!parties) return false;
		var a = parties.initiator, b = parties.recipient, amount = offer.getMoney(), state = this.state;
		// Validation is complete before the first mutation.
		offer.getOfferedSquareIds().forEach(function(id) { GameStateContext.setSquareOwner(state, id, b.playerId); });
		offer.getRequestedSquareIds().forEach(function(id) { GameStateContext.setSquareOwner(state, id, a.playerId); });
		if (amount > 0) { a.pay(amount, b.playerId); b.money += amount; }
		else if (amount < 0) { b.pay(-amount, a.playerId); a.money -= amount; }
		offer.getHeldCards().forEach(function(transfer) {
			var from = transfer.direction === 1 ? a : b;
			var to = transfer.direction === 1 ? b : a;
			from.heldCards.splice(from.heldCards.indexOf(transfer.cardId), 1);
			to.heldCards.push(transfer.cardId);
		});
		if (this.ui && this.ui.updateOwned) this.ui.updateOwned(); if (this.ui && this.ui.updateMoney) this.ui.updateMoney();
		return true;
	};
	Game.prototype.proposeBotTrade = function(offer) {
		var parties = validate(this, offer); if (!parties) return false;
		var reply = parties.recipient.AI && parties.recipient.AI.acceptTrade(offer);
		if (reply === true) return this.acceptTrade(offer);
		if (reply instanceof Trade) return this.acceptTrade(reply);
		return false;
	};
	Game.prototype.trade = function(offer) {
		if (!(offer instanceof Trade)) throw new TypeError('Trade requires an ID-based Trade offer.');
		return this.proposeBotTrade(offer);
	};
	Game.prototype.cancelTrade = function() { return false; };
	Game.prototype.proposeTrade = function(offer) { return this.proposeBotTrade(offer); };
	Game.prototype.reverseTrade = reverse;
})();
