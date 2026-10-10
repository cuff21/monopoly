// Trade validation and settlement are independent of the participants' controllers.
(function() {
    'use strict';
    function players(game, offer) {
        return { initiator: GameStateContext.getPlayerById(game.state, offer.getInitiator()), recipient: GameStateContext.getPlayerById(game.state, offer.getRecipient()) };
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
		var improved = false;
		[[offer.getOfferedSquareIds(), parties.initiator.playerId], [offer.getRequestedSquareIds(), parties.recipient.playerId]].forEach(function(group) {
			group[0].forEach(function(id) {
				var definition = getSquare(s.board, id);
				if (!definition.rules.purchasePrice) throw new RangeError('Only properties may be traded: ' + id);
				var members = definition.groupId ? getGroup(s.board, definition.groupId).squareIds : [id];
				if (members.some(function(memberId) { var item = GameStateContext.getSquareState(s, memberId); return item.house > 0 || item.hotel > 0; })) improved = true;
				if (seen[id]) throw new RangeError('A square may appear only once in a trade: ' + id);
				seen[id] = true;
				if (GameStateContext.getSquareState(s, id).ownerId !== group[1]) throw new RangeError('Trade participant does not own square ' + id);
			});
		});
		if (improved) return null;
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
    Game.prototype.validateTrade = function(offer) { return validate(this, offer); };
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
    Game.prototype.trade = async function(offer) {
        if (!(offer instanceof Trade)) throw new TypeError('Trade requires an explicit ID-based offer.');
        if (!validate(this, offer)) return false;
        if (this.tradeState.pending) throw new Error('A negotiation is already running.');
        this.tradeState.pending = true;
        var round = 0;
        try {
            while (!this.isOver) {
                var parties = validate(this, offer);
                if (!parties) return false;
                var action = await this.requestDecision('trade', parties.recipient.playerId, { offer: offer, round: round++ });
                if (action.type === 'acceptTrade') {
                    var accepted = this.acceptTrade(offer);
                    if (accepted && this.ui && this.ui.showTradeResult) await this.ui.showTradeResult(parties.initiator.name + ' traded with ' + parties.recipient.name, offer);
                    return accepted;
                }
                if (action.type !== 'counterTrade') return false;
                offer = reverse(action.offer);
            }
            return false;
        } finally {
            this.tradeState.pending = false;
            if (this.ui && this.ui.setTradePanelVisible) this.ui.setTradePanelVisible(false);
        }
    };
    Game.prototype.reverseTrade = reverse;
})();
