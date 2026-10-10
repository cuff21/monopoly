if (typeof module !== 'undefined' && module.exports) require('../application/player-controllers');
// Genetic AI's original policy, using its owning Game's structured decision view.
function AITest3(p, params) {
    'use strict';
    var game = p && p.game;
    if (!game || !game.decisionView) throw new TypeError('Genetic AI requires a structured Game decision view.');
    var view = game.decisionView, squareIds = view.getSquareIds();
    var random = typeof game.state.random === 'function' ? game.state.random : Math.random;
    var utilityForRailroadFlag = true, ai = this;
    this.params = params;
    this.aiType = 'genetic3';
    // Preserve the evolvable parameter schema and public controls.
    ['purchaseThreshold', 'housePurchaseThreshold', 'bidUp', 'tradeAcceptanceThreshold',
        'tradeRejectionThreshold', 'spotsBehind', 'spotsAhead', 'communityChestJailCardValue',
        'chanceJailCardValue', 'maxAmountOfRejections', 'firstBuildingOdds', 'lastBuildingOdds'
    ].forEach(function(key) { ai[key] = params[key]; });
    this.amountOfRejections = 0;
    this.alertList = '';
    this.currentTileTrade = []; // [requested square ID, offered square ID]
    this.doNotOfferThose = [];
    this.constructor.count = (this.constructor.count || 0) + 1;
    p.name = 'AI 3 Player ' + this.constructor.count;

    p = PlayerControllers.policyPlayer(p);
    PlayerControllers.bindPolicy(this, p);
    game = p.game; view = game.decisionView;

    function members(id) {
        var definition = view.getSquare(id);
        return definition.groupId ? view.getGroupSquareIds(definition.groupId) : [];
    }
    function ownedCount(ids) {
        return ids.filter(function(id) { return view.getSquareOwner(id) === p.playerId; }).length;
    }
    function undeveloped(id) {
        return members(id).every(function(memberId) {
            var state = view.getSquareState(memberId);
            return state.house === 0 && state.hotel === 0;
        });
    }
    function canOffer(id) {
        var definition = view.getSquare(id), state = view.getSquareState(id), group = members(id);
        return state.ownerId === p.playerId && !state.mortgage && definition.kind !== 'railroad'
            && group.length > 0 && ownedCount(group) < group.length - 1 && undeveloped(id);
    }
    function canRequest(id) {
        var state = view.getSquareState(id), group = members(id);
        return state.ownerId !== null && state.ownerId !== p.playerId && !state.mortgage
            && group.length > 0 && ownedCount(group) === group.length - 1 && undeveloped(id);
    }
    function clearNegotiation(success) {
        ai.amountOfRejections = 0;
        ai.currentTileTrade = [];
        if (success) ai.doNotOfferThose = [];
    }
    function* submit(requestedId, offeredId, money) {
        yield [{ type: 'proposeTrade', offer: new Trade(p.playerId, view.getSquareOwner(requestedId), money, [offeredId], [requestedId], []) }];
        // The controller resumes this planner only after negotiation completes.
        return false;
    }

    this.buyProperty = function(squareId) {
        var definition = view.getSquare(squareId);
        if (!definition.rules.purchasePrice || view.getSquareOwner(squareId) !== null
            || p.money <= definition.rules.purchasePrice + this.purchaseThreshold) return false;
        if (definition.kind === 'railroad' || definition.kind === 'utility') return true;
        // Traversal ordinal is used only for the original early/late purchase preference.
        var coefficient = squareIds.indexOf(squareId) / squareIds.length * (this.lastBuildingOdds - this.firstBuildingOdds);
        return this.firstBuildingOdds + coefficient >= Math.floor(random() * 100);
    };

    this.acceptTrade = function(offer) {
        var incoming = offer.getOfferedSquareIds(), outgoing = offer.getRequestedSquareIds();
        var heldCards = offer.getHeldCards(), money = offer.getMoney(), value = money;
        function assetValue(id) {
            return view.getSquare(id).rules.purchasePrice * (view.getSquareState(id).mortgage ? 0.5 : 1);
        }
        incoming.forEach(function(id) { value += assetValue(id); });
        outgoing.forEach(function(id) { value -= assetValue(id); });
        heldCards.forEach(function(card) {
            var deckId = GameStateContext.parseCardId(card.cardId).deckId;
            var cardValue = deckId === 'community-chest' ? ai.communityChestJailCardValue
                : deckId === 'chance' ? ai.chanceJailCardValue
                : (ai.communityChestJailCardValue + ai.chanceJailCardValue) / 2;
            value += cardValue * card.direction;
        });
        if (value >= this.tradeAcceptanceThreshold) return true;
        // Preserve the original bidUp target; trade cash must be whole dollars.
        var proposedMoney = this.bidUp - value + money, roundedMoney = Math.round(proposedMoney);
        var initiator = view.getPlayer(offer.getInitiator()), recipient = view.getPlayer(offer.getRecipient());
        if (value >= this.tradeRejectionThreshold && initiator.money > proposedMoney
            && initiator.money >= roundedMoney && recipient.money >= -roundedMoney) {
            return new Trade(offer.getInitiator(), offer.getRecipient(), roundedMoney, incoming, outgoing, heldCards);
        }
        return false;
    };

    this.beforeTurn = function*() {
        for (var id of squareIds) {
            var definition = view.getSquare(id), state = view.getSquareState(id);
            if (state.ownerId !== p.playerId || definition.kind !== 'street') continue;
            var group = members(id), leastId, leastHouses = 6;
            for (var j = group.length - 1; j >= 0; j--) {
                var member = view.getSquareState(group[j]);
                if (member.ownerId !== p.playerId) { leastId = null; break; }
                if (member.house < leastHouses) { leastId = group[j]; leastHouses = member.house; }
            }
            if (state.hotel === 0 && leastId && p.money > view.getSquare(leastId).rules.houseCost + ai.housePurchaseThreshold) {
                yield [{ type: 'buyHouse', squareId: leastId }];
            }
        }
        for (var i = squareIds.length - 1; i >= 0; i--) {
            var id = squareIds[i], state = view.getSquareState(id);
            if (state.ownerId === p.playerId && state.mortgage && p.money > view.getSquare(id).rules.purchasePrice) yield [{ type: 'unmortgage', squareId: id }];
        }
        return false;
    };

    this.onLand = function*() {
        var requestedId, offeredId;
        if (this.currentTileTrade.length) {
            requestedId = this.currentTileTrade[0];
            offeredId = this.currentTileTrade[1];
            if (view.getSquareOwner(requestedId) === p.playerId) clearNegotiation(true);
            else if (!canRequest(requestedId) || !canOffer(offeredId)) {
                clearNegotiation(false);
                return false;
            }
        }
        for (var i = 0; i < squareIds.length; i++) {
            var group = members(squareIds[i]);
            if (!group.length || ownedCount(group) !== group.length - 1) continue;
            requestedId = group.find(function(id) { return view.getSquareOwner(id) !== p.playerId; });
            if (!canRequest(requestedId) || this.doNotOfferThose.includes(requestedId)) continue;
            if (this.currentTileTrade.length && requestedId !== this.currentTileTrade[0]) continue;
            offeredId = this.currentTileTrade.length ? this.currentTileTrade[1] : null;
            // Clip an inclusive window once. Fractional evolved distances are valid.
            var start = Math.max(1, Math.ceil(i - this.spotsBehind));
            var end = Math.min(squareIds.length - 1, Math.floor(i + this.spotsAhead));
            for (var j = start; !offeredId && j <= end; j++) {
                if (!this.doNotOfferThose.includes(squareIds[j]) && canOffer(squareIds[j])) offeredId = squareIds[j];
            }
            if (!offeredId) continue;
            var money = Math.round(Math.max(view.getSquare(requestedId).rules.purchasePrice
                - view.getSquare(offeredId).rules.purchasePrice + this.bidUp * this.amountOfRejections, 0));
            if (this.amountOfRejections >= this.maxAmountOfRejections) {
                this.doNotOfferThose.push(requestedId);
                clearNegotiation(false);
                return false;
            }
            if (p.money < money + this.tradeAcceptanceThreshold || p.money < money) return false;
            this.currentTileTrade = [requestedId, offeredId];
            this.amountOfRejections++;
            var pending = yield* submit(requestedId, offeredId, money);
            if (view.getSquareOwner(requestedId) === p.playerId) clearNegotiation(true);
            else if (!pending && this.amountOfRejections >= this.maxAmountOfRejections) {
                this.doNotOfferThose.push(requestedId);
                clearNegotiation(false);
            }
            return pending;
        }
        var railroads = squareIds.filter(function(id) { return view.getSquare(id).kind === 'railroad'; });
        requestedId = railroads.find(function(id) {
            var owner = view.getSquareOwner(id);
            return owner !== null && owner !== p.playerId;
        });
        var utilities = squareIds.filter(function(id) { return view.getSquare(id).kind === 'utility'; });
        var ownedUtilities = utilities.filter(function(id) { return view.getSquareOwner(id) === p.playerId; });
        if (utilityForRailroadFlag && game.getDie(1) !== game.getDie(2) && requestedId
            && ownedUtilities.length === 1 && undeveloped(requestedId) && undeveloped(ownedUtilities[0])) {
            utilityForRailroadFlag = false;
            return yield* submit(requestedId, ownedUtilities[0], 0);
        }
        return false;
    };

    this.postBail = function() {
        return p.heldCards.length > 0 && p.jailroll === 2;
    };

    this.payDebt = function*() {
        // Re-scan after each sale to respect even building and hotel supply rules.
        var sold = true;
        while (p.money < 0 && sold) {
            sold = false;
            for (var i = squareIds.length - 1; i >= 0; i--) {
                var id = squareIds[i], state = view.getSquareState(id);
                if (state.ownerId === p.playerId && !state.mortgage && state.house > 0 && game.canSellHouse(id)) {
                    sold = yield [{ type: 'sellHouse', squareId: id }];
                    if (sold) break;
                }
            }
        }
        for (var j = squareIds.length - 1; p.money < 0 && j >= 0; j--) {
            var squareId = squareIds[j], squareState = view.getSquareState(squareId);
            if (squareState.ownerId === p.playerId && !squareState.mortgage && squareState.house === 0) yield [{ type: 'mortgage', squareId: squareId }];
        }
    };

    this.inherit = function(squareIds) {
        var floor = Math.max(100, p.money * 0.25);
        var view = p.game.decisionView;
        var id = squareIds.find(function(id) {
            return view.getSquareState(id).mortgage && p.money - Math.round(view.getSquare(id).rules.purchasePrice * 0.5) >= floor;
        });
        return id ? [{ type: 'inheritUnmortgage', squareId: id }] : [];
    };

    this.bid = function(squareId, currentBid) {
        if (!Number.isFinite(p.money) || !Number.isInteger(currentBid) || currentBid < 0 || !view.board.squaresById[squareId]) return -1;
        var definition = view.getSquare(squareId);
        var bid = currentBid + Math.round(random() * 20 + 10);
        return !definition.rules.purchasePrice || view.getSquareOwner(squareId) !== null
            || !Number.isInteger(bid) || !Number.isFinite(definition.rules.purchasePrice) || p.money < bid + 50 || bid > definition.rules.purchasePrice * 1.5 ? -1 : bid;
    };
}

if (typeof AISetupRegistry !== 'undefined') AISetupRegistry.register({
    id: '3',
    label: 'AI 3',
    trackResults: true,
    createPlayer: function(player, selection, random) { return new AITest3(player, generateParameters(random)); }
});

if (typeof module !== 'undefined' && module.exports) module.exports = AITest3;
