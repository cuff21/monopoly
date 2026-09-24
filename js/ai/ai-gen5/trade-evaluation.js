// Gen5 AI: trade acceptance/counter logic and proactive group-completion trade proposals.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    // Scores an incoming trade offer, adding a penalty for handing the initiator a dangerous monopoly
    // (scaled by how strong/threatening that opponent already is) and a bonus for the AI blocking/completing its own.
    function evaluate(tradeObj, p, profile) {
        var money = tradeObj.getMoney();
        var initiator = tradeObj.getInitiator();
        var property = [];
        var ownership = {};
        var incomingValue = 0;
        var outgoingValue = 0;

        for (var i = 0; i < 40; i++) {
            property[i] = tradeObj.getProperty(i) || 0;
            if (property[i] > 0) {
                ownership[i] = p.index;
            } else if (property[i] < 0) {
                ownership[i] = initiator.index;
            }
        }

        for (var j = 0; j < 40; j++) {
            if (property[j] > 0) {
                incomingValue += AIGen5.Valuation.assetValue(j, p.index, ownership);
            }
            if (property[j] < 0) {
                outgoingValue += AIGen5.Valuation.assetValue(j, p.index);
            }
        }

        var tradeValue = money + incomingValue - outgoingValue;
        tradeValue += 15 * tradeObj.getCommunityChestJailCard();
        tradeValue += 15 * tradeObj.getChanceJailCard();

        var monopolyEnablementRisk = 0;
        var blockingValue = 0;
        var groupsTouched = {};
        for (var k = 0; k < 40; k++) {
            var s = globalThis.square[k];
            if (!s || !s.group || property[k] === 0) {
                continue;
            }
            groupsTouched[s.group.join(',')] = true;
        }

        for (var groupKey in groupsTouched) {
            var groupIndices = groupKey.split(',').map(Number);
            var initiatorOwnsAll = groupIndices.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === initiator.index : globalThis.square[idx].owner === initiator.index;
            });
            var aiOwnsAll = groupIndices.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === p.index : globalThis.square[idx].owner === p.index;
            });

            if (initiatorOwnsAll) {
                var risk = AIGen5.Analytics ? AIGen5.Analytics.monopolyRisk(groupIndices[0], initiator.index) : 1;
                var rank = AIGen5.Analytics ? AIGen5.Analytics.strengthRank(initiator) : 'Contender';
                var rankMultiplier = rank === 'Leader' ? (profile.leaderPenaltyWeight || 1.6) : (rank === 'Weak' || rank === 'NearBankrupt') ? (profile.weakOpponentLeniency || 0.5) : 1;
                monopolyEnablementRisk += risk * 40 * rankMultiplier * (profile.monopolyBlockWeight || 1);
            }
            if (aiOwnsAll) {
                blockingValue += 40 * (profile.monopolyBlockWeight || 1);
            }
        }

        var netValue = tradeValue - monopolyEnablementRisk + blockingValue;
        return { tradeValue: tradeValue, monopolyEnablementRisk: monopolyEnablementRisk, blockingValue: blockingValue, netValue: netValue };
    }

    function acceptTrade(tradeObj, p, profile, tradeMemory, turnNumber) {
        var initiator = tradeObj.getInitiator();
        var recipient = tradeObj.getRecipient();
        var evaluation = evaluate(tradeObj, p, profile);

        var norm = AIGen5.TradeMemory.normalizeIncoming(tradeObj);
        var signature = AIGen5.TradeMemory.createSignature(norm.property, norm.money);
        var snapshot = AIGen5.TradeMemory.snapshotOf(initiator, turnNumber);

        var threshold = 85 * (profile.tradeBias || 1);
        var counterThreshold = -25 * (profile.riskTolerance || 1);

        if (evaluation.netValue >= threshold) {
            tradeMemory.recordOutcome(initiator.index, signature, 'accepted', snapshot);
            return true;
        }

        if (evaluation.netValue < counterThreshold) {
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        var money = tradeObj.getMoney();
        var property = [];
        for (var i = 0; i < 40; i++) {
            property[i] = tradeObj.getProperty(i) || 0;
        }

        var counterMoney = money + Math.ceil((threshold - evaluation.netValue) * 0.6);
        var maximumCounterMoney = Math.max(0, initiator.money - Math.max(120, initiator.money * 0.1));
        counterMoney = Math.min(Math.max(counterMoney, money), maximumCounterMoney);

        if (counterMoney <= money || initiator.money < counterMoney || typeof Trade === 'undefined') {
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        // counterMoney is in "AI receives" terms; flip sign to compare in the ledger's "AI gives" convention.
        if (tradeMemory.isWorseCounter(initiator.index, signature, -counterMoney)) {
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        tradeMemory.recordOutcome(initiator.index, signature, 'countered', snapshot, -counterMoney);
        return new Trade(initiator, recipient, counterMoney, property, tradeObj.getCommunityChestJailCard(), tradeObj.getChanceJailCard());
    }

    // Looks for a one-for-one property swap that would complete one of the AI's own groups.
    function findOpportunity(p, profile) {
        var square = globalThis.square;
        var best = null;
        var availableCash = Math.max(0, p.money - (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120));

        for (var targetIndex = 0; targetIndex < 40; targetIndex++) {
            var targetSquare = square[targetIndex];
            if (!targetSquare || !targetSquare.group || targetSquare.group.length < 2) {
                continue;
            }

            var ownedInTarget = 0;
            var missingIndex = -1;
            var missingOwner = 0;
            var blocked = false;
            for (var m = 0; m < targetSquare.group.length; m++) {
                var memberIndex = targetSquare.group[m];
                var member = square[memberIndex];
                if (!member) {
                    blocked = true;
                    break;
                }
                if (member.house > 0 || member.hotel > 0) {
                    blocked = true;
                }
                if (member.owner === p.index) {
                    ownedInTarget++;
                } else {
                    missingIndex = memberIndex;
                    missingOwner = member.owner;
                }
            }
            if (blocked || ownedInTarget !== targetSquare.group.length - 1 || missingOwner === 0 || missingOwner === p.index) {
                continue;
            }

            for (var offerIndex = 0; offerIndex < 40; offerIndex++) {
                var offerSquare = square[offerIndex];
                if (!offerSquare || offerSquare.owner !== p.index || offerIndex === missingIndex || offerSquare.mortgage) {
                    continue;
                }
                if (offerSquare.house > 0 || offerSquare.hotel > 0 || targetSquare.group.indexOf(offerIndex) !== -1) {
                    continue;
                }
                if (AIGen5.Valuation.groupScore(offerIndex, p.index) >= 80) {
                    continue;
                }

                var hypotheticalOwnership = {};
                hypotheticalOwnership[missingIndex] = p.index;
                hypotheticalOwnership[offerIndex] = missingOwner;
                var receivedValue = AIGen5.Valuation.assetValue(missingIndex, p.index, hypotheticalOwnership);
                var offeredValue = AIGen5.Valuation.assetValue(offerIndex, p.index);
                var opponentTargetValue = AIGen5.Valuation.assetValue(missingIndex, missingOwner);
                var opponentOfferValue = AIGen5.Valuation.assetValue(offerIndex, missingOwner, hypotheticalOwnership);
                var cashOffer = Math.max(0, Math.ceil(opponentTargetValue - opponentOfferValue + 85));
                var netGain = receivedValue - offeredValue - cashOffer;

                if (cashOffer <= availableCash && netGain > 20 && (!best || netGain > best.netGain)) {
                    best = { missingIndex: missingIndex, offerIndex: offerIndex, owner: missingOwner, cash: cashOffer, netGain: netGain };
                }
            }
        }

        return best;
    }

    function proposeOpportunity(p, profile, tradeMemory, params, turnNumber) {
        if (typeof Trade === 'undefined' || typeof game === 'undefined' || !game || typeof game.trade !== 'function') {
            return false;
        }

        var opportunity = findOpportunity(p, profile);
        if (!opportunity) {
            return false;
        }

        var property = [];
        for (var i = 0; i < 40; i++) {
            property[i] = 0;
        }
        property[opportunity.missingIndex] = -1;
        property[opportunity.offerIndex] = 1;

        var signature = AIGen5.TradeMemory.createSignature(property, opportunity.cash);
        var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(opportunity.owner) : (typeof globalThis.player !== 'undefined' ? globalThis.player[opportunity.owner] : null);
        var snapshot = AIGen5.TradeMemory.snapshotOf(opponent, turnNumber);

        if (!tradeMemory.shouldReoffer(opportunity.owner, signature, snapshot, params)) {
            return false;
        }

        var proposedTrade = new Trade(p, opponent, opportunity.cash, property, 0, 0);
        game.trade(proposedTrade);
        tradeMemory.recordOutcome(opportunity.owner, signature, 'proposed', snapshot);
        return true;
    }

    AIGen5.TradeEvaluation = {
        evaluate: evaluate,
        acceptTrade: acceptTrade,
        proposeOpportunity: proposeOpportunity
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.TradeEvaluation;
    }
})(typeof window !== 'undefined' ? window : globalThis);
