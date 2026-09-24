(function(global) {
    var PROFILE_LIBRARY = [
        { name: 'Aggressive', riskTolerance: 0.85, liquidityFloor: 0.08, endgameBias: 1.45, auctionBias: 1.35, tradeBias: 1.25, houseBias: 1.3 },
        { name: 'Balanced', riskTolerance: 0.6, liquidityFloor: 0.12, endgameBias: 1.15, auctionBias: 1.1, tradeBias: 1.0, houseBias: 1.0 },
        { name: 'Defensive', riskTolerance: 0.35, liquidityFloor: 0.18, endgameBias: 0.95, auctionBias: 0.8, tradeBias: 0.8, houseBias: 0.8 },
        { name: 'Opportunist', riskTolerance: 0.72, liquidityFloor: 0.1, endgameBias: 1.2, auctionBias: 1.2, tradeBias: 1.1, houseBias: 1.15 }
    ];

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function pickProfile(profile) {
        if (profile && profile.name) {
            var match = PROFILE_LIBRARY.filter(function(item) {
                return item.name.toLowerCase() === profile.name.toLowerCase();
            })[0];
            if (match) {
                return Object.assign({}, match, profile);
            }
            return Object.assign({}, PROFILE_LIBRARY[1], profile);
        }

        return Object.assign({}, PROFILE_LIBRARY[Math.floor(Math.random() * PROFILE_LIBRARY.length)]);
    }

    StrategicAI.getRandomProfile = function() {
        return Object.assign({}, PROFILE_LIBRARY[Math.floor(Math.random() * PROFILE_LIBRARY.length)]);
    };

    function propertyOwner(index, ownership) {
        if (ownership && ownership[index] !== undefined) {
            return ownership[index];
        }
        return square[index].owner;
    }

    function propertyGroupScore(index, ownerIndex, ownership) {
        var s = square[index];
        if (!s || typeof s.group === 'undefined' || !s.group || s.group.length === 0) {
            return 0;
        }

        var owned = 0;
        var open = 0;
        var total = s.group.length;

        for (var i = 0; i < total; i++) {
            var g = square[s.group[i]];
            if (propertyOwner(s.group[i], ownership) === ownerIndex) {
                owned++;
            } else if (propertyOwner(s.group[i], ownership) === 0) {
                open++;
            }
        }

        if (owned === total) {
            return 80;
        }
        if (owned === total - 1) {
            return 45;
        }
        if (owned > 0) {
            return 12 * owned + 8 * open;
        }

        var avgPrice = 0;
        for (var j = 0; j < total; j++) {
            avgPrice += square[s.group[j]].price;
        }
        avgPrice /= total;
        return Math.min(35, Math.max(10, avgPrice * 0.12));
    }

    function propertyAssetValue(index, ownerIndex, ownership) {
        var s = square[index];
        if (!s) {
            return 0;
        }

        var value = s.price * (s.mortgage ? 0.5 : 1) * 0.65;
        value += (s.baserent || 0) * 3;
        value += (s.houseprice || 0) * 0.5;
        value += propertyGroupScore(index, ownerIndex, ownership) * 2;

        if (s.group && s.group.length > 0 && propertyGroupScore(index, ownerIndex, ownership) >= 80) {
            value += s.houseprice * 2;
        }

        return value;
    }

    function expectedRent(index, ownerIndex, ownership) {
        var s = square[index];
        if (!s || s.price === 0) {
            return 0;
        }

        if (index === 5 || index === 15 || index === 25 || index === 35) {
            var railroadCount = 0;
            for (var railroad = 0; railroad < 4; railroad++) {
                if (propertyOwner([5, 15, 25, 35][railroad], ownership) === ownerIndex) {
                    railroadCount++;
                }
            }
            return [0, 25, 50, 100, 200][railroadCount];
        }

        if (index === 12 || index === 28) {
            var utilityCount = (propertyOwner(12, ownership) === ownerIndex ? 1 : 0) + (propertyOwner(28, ownership) === ownerIndex ? 1 : 0);
            return (s.baserent || 4) * (utilityCount === 2 ? 2.5 : utilityCount === 1 ? 1 : 0);
        }

        var rent = s.house > 0 ? s['rent' + Math.min(s.house, 5)] : s.baserent || 0;
        if (s.group && s.group.length > 0 && propertyGroupScore(index, ownerIndex, ownership) >= 80 && s.house === 0) {
            rent *= 2;
        }
        return rent;
    }

    function expectedRentValue(index, ownerIndex, ownership) {
        var activePlayers = estimateRemainingPlayers();
        var landingWeight = 0.8 + activePlayers * 0.05;
        var occupants = typeof globalThis.player === 'undefined' ? [] : globalThis.player;

        for (var i = 1; i < occupants.length; i++) {
            var opponent = occupants[i];
            if (opponent && opponent.index !== ownerIndex && opponent.position !== undefined && !opponent.jail) {
                var distance = (index - opponent.position + 40) % 40;
                if (distance >= 2 && distance <= 12) {
                    landingWeight += (13 - distance) * 0.01;
                }
            }
        }

        return expectedRent(index, ownerIndex, ownership) * landingWeight;
    }

    function opponentThreatScore(index, ownerIndex) {
        var s = square[index];
        if (!s || !s.group || s.group.length < 2) {
            return 0;
        }

        var strongestThreat = 0;
        var owners = {};
        for (var i = 0; i < s.group.length; i++) {
            var owner = square[s.group[i]].owner;
            if (owner !== 0 && owner !== ownerIndex) {
                owners[owner] = (owners[owner] || 0) + 1;
            }
        }

        for (var ownerKey in owners) {
            var owned = owners[ownerKey];
            var opponent = typeof globalThis.player === 'undefined' ? null : globalThis.player[ownerKey];
            var cashMultiplier = opponent && opponent.money !== undefined ? clamp(0.8 + opponent.money / 3000, 0.8, 1.2) : 1;
            if (owned === s.group.length - 1 && s.owner === 0) {
                strongestThreat = Math.max(strongestThreat, (70 + s.price * 0.12) * cashMultiplier);
            } else if (owned > 0) {
                strongestThreat = Math.max(strongestThreat, owned * 12 * cashMultiplier);
            }
        }

        return strongestThreat;
    }

    function evaluateProperty(index, ownerIndex, cashOnHand, profile, endgamePressure) {
        var s = square[index];
        if (!s || s.price === 0 || s.owner !== 0) {
            return -Infinity;
        }

        var score = 0;
        score += s.price * 0.18;
        score += (s.baserent || 0) * 1.1;
        score += (s.houseprice || 0) * 0.12;

        if (typeof s.group !== 'undefined' && s.group && s.group.length > 0) {
            var ownedInGroup = 0;
            var openInGroup = 0;
            for (var g = 0; g < s.group.length; g++) {
                var groupTile = square[s.group[g]];
                if (groupTile.owner === ownerIndex) {
                    ownedInGroup++;
                } else if (groupTile.owner === 0) {
                    openInGroup++;
                }
            }

            if (ownedInGroup > 0) {
                score += 25 + ownedInGroup * 18;
            }
            if (ownedInGroup === s.group.length - 1) {
                score += 35;
            }
            if (openInGroup > 0) {
                score += 8 + openInGroup * 5;
            }
        }

        if (index === 5 || index === 15 || index === 25 || index === 35) {
            score += 65;
        }

        if (index === 12 || index === 28) {
            score += 60;
        }

        score += propertyGroupScore(index, ownerIndex);
        score += expectedRentValue(index, ownerIndex) * 0.8;
        score += opponentThreatScore(index, ownerIndex) * profile.endgameBias;
        score *= profile.riskTolerance > 0.7 ? 1.08 : 1;
        score += endgamePressure * 12 * profile.endgameBias;

        if (cashOnHand < s.price + 250) {
            score -= 10 * (1 / Math.max(0.25, profile.riskTolerance));
        }

        if (cashOnHand < s.price + 100) {
            score -= 25 * (1.2 - profile.riskTolerance);
        }

        return score;
    }

    function groupOwnershipSummary(ownerIndex) {
        var summary = [];
        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (s && typeof s.group !== 'undefined' && s.group && s.group.length > 0) {
                var owned = 0;
                var total = s.group.length;
                for (var j = 0; j < total; j++) {
                    if (square[s.group[j]] && square[s.group[j]].owner === ownerIndex) {
                        owned++;
                    }
                }
                summary.push({
                    index: i,
                    size: total,
                    owned: owned,
                    score: owned / total
                });
            }
        }
        return summary;
    }

    function estimateRemainingPlayers() {
        if (typeof globalThis.player === 'undefined') {
            return 3;
        }
        var active = 0;
        for (var i = 1; i <= globalThis.player.length; i++) {
            if (globalThis.player[i] && (globalThis.player[i].money >= 0 || globalThis.player[i].creditor === -1)) {
                active++;
            }
        }
        return active || 3;
    }

    function StrategicAI(p, profile) {
        this.alertList = "";
        this.profile = pickProfile(profile || {});
        this.tradeMemory = {};
        this.portfolioPlan = { targetGroup: null, confidence: 0.0 };

        if (!this.constructor.count) {
            this.constructor.count = 0;
        }
        this.constructor.count++;

        p.name = "Strategic AI Player " + this.constructor.count;
        this.personality = this.profile.name;

        this.recordTrade = function(opponent, direction, value) {
            var key = opponent && opponent.index !== undefined ? opponent.index : Number(opponent) || 'unknown';
            if (!this.tradeMemory[key]) {
                this.tradeMemory[key] = { count: 0, totalValue: 0, accepted: 0, rejected: 0, lastDirection: null };
            }
            var memory = this.tradeMemory[key];
            memory.count++;
            memory.totalValue += value || 0;
            if (direction === 'accepted') {
                memory.accepted++;
            } else if (direction === 'rejected') {
                memory.rejected++;
            }
            memory.lastDirection = direction;
        };

        this.getTradeBias = function(opponent) {
            var key = opponent && opponent.index !== undefined ? opponent.index : Number(opponent) || 'unknown';
            var memory = this.tradeMemory[key] || { count: 0, totalValue: 0, accepted: 0, rejected: 0 };
            var bias = 1;
            if (memory.count > 0) {
                bias += (memory.accepted - memory.rejected) * 0.08;
                bias += clamp(memory.totalValue / 500, -0.2, 0.4);
            }
            return clamp(bias, 0.7, 1.6);
        };

        this.getLiquidityFloor = function() {
            return Math.max(120, p.money * this.profile.liquidityFloor);
        };

        this.planPortfolio = function() {
            var groups = groupOwnershipSummary(p.index);
            var target = null;
            var bestScore = -Infinity;

            for (var i = 0; i < groups.length; i++) {
                var group = groups[i];
                var value = group.owned * 20 + (group.size - group.owned) * 14 + group.score * 40;

                if (value > bestScore) {
                    bestScore = value;
                    target = group;
                }
            }

            this.portfolioPlan = {
                targetGroup: target,
                confidence: clamp((bestScore || 0) / 100, 0, 1)
            };

            return this.portfolioPlan;
        };

        this.buyProperty = function(index) {
            var s = square[index];
            if (!s || s.price === 0 || s.owner !== 0) {
                return false;
            }

            var liquidityFloor = this.getLiquidityFloor();
            if (p.money < s.price + liquidityFloor) {
                return false;
            }

            var endgamePressure = Math.max(0, (estimateRemainingPlayers() - 2) * 0.25);
            var score = evaluateProperty(index, p.index, p.money, this.profile, endgamePressure);
            var groupBonus = 0;
            if (typeof s.group !== 'undefined' && s.group && s.group.length > 0) {
                var groupOwned = 0;
                var groupOpen = 0;
                for (var g = 0; g < s.group.length; g++) {
                    if (square[s.group[g]].owner === p.index) {
                        groupOwned++;
                    } else if (square[s.group[g]].owner === 0) {
                        groupOpen++;
                    }
                }
                groupBonus = groupOwned * 15 + groupOpen * 8;
            }

            var profileThreshold = this.profile.name === 'Defensive' ? 68 : this.profile.name === 'Aggressive' ? 52 : 58;
            if ((index === 5 || index === 15 || index === 25 || index === 35 || index === 12 || index === 28) && score >= 55) {
                return true;
            }

            if (score >= profileThreshold + (this.profile.name === 'Aggressive' ? 8 : 0)) {
                return true;
            }

            if (score + groupBonus >= 45 && (s.price <= 220 || this.profile.name === 'Aggressive')) {
                return true;
            }

            if (this.profile.name === 'Opportunist' && s.price <= 180 && score >= 36) {
                return true;
            }

            return false;
        };

        this.acceptTrade = function(tradeObj) {
            var money = tradeObj.getMoney();
            var initiator = tradeObj.getInitiator();
            var recipient = tradeObj.getRecipient();
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
                    incomingValue += propertyAssetValue(j, p.index, ownership);
                }
                if (property[j] < 0) {
                    outgoingValue += propertyAssetValue(j, p.index);
                }
            }

            var tradeValue = money + incomingValue - outgoingValue;
            tradeValue += 15 * tradeObj.getCommunityChestJailCard();
            tradeValue += 15 * tradeObj.getChanceJailCard();

            var opponentBias = this.getTradeBias(initiator);
            var threshold = 85 * (this.profile.tradeBias || 1) / opponentBias;
            var counterThreshold = -25 * (this.profile.riskTolerance || 1);

            if (tradeValue >= threshold) {
                this.recordTrade(initiator, 'accepted', tradeValue);
                return true;
            }

            var counterMoney = money + Math.ceil((threshold - tradeValue) * 0.6);
            // Bound by a generic buffer on the initiator's cash, not this AI's own floor or the initiator's internals.
            var maximumCounterMoney = Math.max(0, initiator.money - Math.max(120, initiator.money * 0.1));
            counterMoney = clamp(counterMoney, money, maximumCounterMoney);
            if (tradeValue >= counterThreshold && counterMoney > money && initiator.money >= counterMoney && typeof Trade !== 'undefined') {
                this.recordTrade(initiator, 'countered', tradeValue);
                return new Trade(initiator, recipient, counterMoney, property, tradeObj.getCommunityChestJailCard(), tradeObj.getChanceJailCard());
            }

            this.recordTrade(initiator, 'rejected', tradeValue);
            return false;
        };

        this.beforeTurn = function() {
            var s;
            var groups = groupOwnershipSummary(p.index);
            var bestHouseTarget = null;
            this.planPortfolio();

            for (var i = 0; i < groups.length; i++) {
                var group = groups[i];
                if (group.owned === group.size && group.size >= 2) {
                    var groupTiles = square[group.index].group || [];
                    var minimumHouseLevel = 5;
                    for (var levelIndex = 0; levelIndex < groupTiles.length; levelIndex++) {
                        var levelTile = square[groupTiles[levelIndex]];
                        if (levelTile && levelTile.house < minimumHouseLevel) {
                            minimumHouseLevel = levelTile.house;
                        }
                    }

                    for (var j = 0; j < groupTiles.length; j++) {
                        var tile = square[groupTiles[j]];
                        if (tile.owner !== p.index || tile.house !== minimumHouseLevel || tile.house >= 5 || tile.hotel === 1 || tile.houseprice <= 0) {
                            continue;
                        }

                        var currentRent = tile.house === 0 ? tile.baserent : tile['rent' + tile.house];
                        var nextRent = tile.house === 4 ? tile.rent5 : tile['rent' + (tile.house + 1)];
                        var rentGain = Math.max(0, (nextRent || currentRent) - (currentRent || 0));
                        var breakpointBonus = tile.house === 2 ? 1.35 : tile.house === 3 ? 1.1 : 1;
                        var developmentScore = rentGain / tile.houseprice * (this.profile.houseBias || 1) * breakpointBonus;
                        if (!bestHouseTarget || developmentScore > bestHouseTarget.developmentScore || (developmentScore === bestHouseTarget.developmentScore && tile.house < bestHouseTarget.tile.house)) {
                            bestHouseTarget = { index: groupTiles[j], tile: tile, developmentScore: developmentScore };
                        }
                    }
                }
            }

            if (bestHouseTarget && p.money > bestHouseTarget.tile.houseprice + this.getLiquidityFloor() * 0.6) {
                if (typeof buyHouse === 'function') {
                    buyHouse(bestHouseTarget.index);
                }
            }

            if (this.profile.name !== 'Defensive') {
                var unmortgageCandidates = [];
                for (var i = 0; i < 40; i++) {
                    s = square[i];
                    if (s && s.owner === p.index && s.mortgage) {
                        unmortgageCandidates.push({
                            index: i,
                            cost: Math.round(s.price * 0.55),
                            returnValue: expectedRentValue(i, p.index) + propertyGroupScore(i, p.index) * 2
                        });
                    }
                }

                unmortgageCandidates.sort(function(left, right) {
                    return right.returnValue / right.cost - left.returnValue / left.cost;
                });

                for (var candidate = 0; candidate < unmortgageCandidates.length; candidate++) {
                    var unmortgageCandidate = unmortgageCandidates[candidate];
                    if (p.money - unmortgageCandidate.cost < this.getLiquidityFloor()) {
                        continue;
                    }
                    if (typeof unmortgage === 'function') {
                        unmortgage(unmortgageCandidate.index);
                    }
                }
            }

            return false;
        };

        var utilityForRailroadFlag = true;

        this.onLand = function() {
            var proposedTrade;
            var property = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
            var railroadIndexes = [5, 15, 25, 35];
            var utilityIndexes = [12, 28];
            var requestedRailroad = null;
            var offeredUtility = null;

            for (var i = 0; i < 4; i++) {
                var railroad = square[railroadIndexes[i]];
                if (railroad && railroad.owner !== 0 && railroad.owner !== p.index) {
                    requestedRailroad = railroadIndexes[i];
                    break;
                }
            }

            for (var j = 0; j < 2; j++) {
                var utility = square[utilityIndexes[j]];
                if (utility && utility.owner === p.index && utility.owner !== 0) {
                    offeredUtility = utilityIndexes[j];
                    break;
                }
            }

            var bestOpportunity = null;
            var availableCash = Math.max(0, p.money - this.getLiquidityFloor());

            var getRecipientTradeMinimum = function(recipientIndex) {
                var recipient = typeof player === 'undefined' ? null : player[recipientIndex];
                var recipientAI = recipient && recipient.AI;
                var tradeBias = recipientAI && recipientAI.profile ? recipientAI.profile.tradeBias || 1 : 1;
                var opponentBias = recipientAI && typeof recipientAI.getTradeBias === 'function' ? recipientAI.getTradeBias(p) : 1;
                return 85 * tradeBias / opponentBias;
            };

            for (var targetIndex = 0; targetIndex < 40; targetIndex++) {
                var targetSquare = square[targetIndex];
                if (!targetSquare || !targetSquare.group || targetSquare.group.length < 2) {
                    continue;
                }

                var ownedInTarget = 0;
                var missingIndex = -1;
                var missingOwner = 0;
                var groupBlocked = false;
                for (var targetMember = 0; targetMember < targetSquare.group.length; targetMember++) {
                    var memberIndex = targetSquare.group[targetMember];
                    var member = square[memberIndex];
                    if (!member) {
                        groupBlocked = true;
                        break;
                    }
                    if (member.house > 0 || member.hotel > 0) {
                        groupBlocked = true;
                    }
                    if (member.owner === p.index) {
                        ownedInTarget++;
                    } else {
                        missingIndex = memberIndex;
                        missingOwner = member.owner;
                    }
                }

                if (groupBlocked || ownedInTarget !== targetSquare.group.length - 1 || missingOwner === 0 || missingOwner === p.index) {
                    continue;
                }

                var validOffers = [];
                for (var offerIndex = 0; offerIndex < 40; offerIndex++) {
                    var offerSquare = square[offerIndex];
                    if (!offerSquare || offerSquare.owner !== p.index || offerIndex === missingIndex || offerSquare.mortgage) {
                        continue;
                    }

                    var offerGroup = offerSquare.group || [];
                    var offerBlocked = offerSquare.house > 0 || offerSquare.hotel > 0;
                    for (var offerMember = 0; offerMember < offerGroup.length; offerMember++) {
                        if (!square[offerGroup[offerMember]] || square[offerGroup[offerMember]].house > 0 || square[offerGroup[offerMember]].hotel > 0) {
                            offerBlocked = true;
                        }
                    }
                    if (offerBlocked || targetSquare.group.indexOf(offerIndex) !== -1) {
                        continue;
                    }
                    if (propertyGroupScore(offerIndex, p.index) >= 80) {
                        continue;
                    }

                    validOffers.push(offerIndex);

                    var hypotheticalOwnership = {};
                    hypotheticalOwnership[missingIndex] = p.index;
                    hypotheticalOwnership[offerIndex] = missingOwner;
                    var receivedValue = propertyAssetValue(missingIndex, p.index, hypotheticalOwnership);
                    var offeredValue = propertyAssetValue(offerIndex, p.index);
                    var opponentTargetValue = propertyAssetValue(missingIndex, missingOwner);
                    var opponentOfferValue = propertyAssetValue(offerIndex, missingOwner, hypotheticalOwnership);
                    var recipientMinimum = getRecipientTradeMinimum(missingOwner);
                    var cashOffer = Math.max(0, Math.ceil(opponentTargetValue - opponentOfferValue + recipientMinimum));
                    var netGain = receivedValue - offeredValue - cashOffer;

                    if (cashOffer <= availableCash && netGain > 20 && (!bestOpportunity || netGain > bestOpportunity.netGain)) {
                        bestOpportunity = {
                            missingIndex: missingIndex,
                            offerIndex: offerIndex,
                            owner: missingOwner,
                            cash: cashOffer,
                            netGain: netGain
                        };
                    }
                }

                for (var firstOffer = 0; firstOffer < validOffers.length; firstOffer++) {
                    for (var secondOffer = firstOffer + 1; secondOffer < validOffers.length; secondOffer++) {
                        var firstOfferIndex = validOffers[firstOffer];
                        var secondOfferIndex = validOffers[secondOffer];
                        var multiOwnership = {};
                        multiOwnership[missingIndex] = p.index;
                        multiOwnership[firstOfferIndex] = missingOwner;
                        multiOwnership[secondOfferIndex] = missingOwner;
                        var multiReceivedValue = propertyAssetValue(missingIndex, p.index, multiOwnership);
                        var multiOfferedValue = propertyAssetValue(firstOfferIndex, p.index) + propertyAssetValue(secondOfferIndex, p.index);
                        var multiOpponentTargetValue = propertyAssetValue(missingIndex, missingOwner);
                        var multiOpponentOfferValue = propertyAssetValue(firstOfferIndex, missingOwner, multiOwnership) + propertyAssetValue(secondOfferIndex, missingOwner, multiOwnership);
                        var multiRecipientMinimum = getRecipientTradeMinimum(missingOwner);
                        var multiCashOffer = Math.max(0, Math.ceil(multiOpponentTargetValue - multiOpponentOfferValue + multiRecipientMinimum));
                        var multiNetGain = multiReceivedValue - multiOfferedValue - multiCashOffer;

                        if (multiCashOffer <= availableCash && multiNetGain > 20 && (!bestOpportunity || multiNetGain > bestOpportunity.netGain)) {
                            bestOpportunity = {
                                missingIndex: missingIndex,
                                offerIndex: firstOfferIndex,
                                additionalOfferIndex: secondOfferIndex,
                                owner: missingOwner,
                                cash: multiCashOffer,
                                netGain: multiNetGain
                            };
                        }
                    }
                }
            }

            if (bestOpportunity && typeof Trade !== 'undefined') {
                property[bestOpportunity.missingIndex] = -1;
                property[bestOpportunity.offerIndex] = 1;
                if (bestOpportunity.additionalOfferIndex !== undefined) {
                    property[bestOpportunity.additionalOfferIndex] = 1;
                }
                proposedTrade = new Trade(p, player[bestOpportunity.owner], bestOpportunity.cash, property, 0, 0);
                if (typeof game !== 'undefined' && game && typeof game.trade === 'function') {
                    game.trade(proposedTrade);
                    return true;
                }
            }

            if (utilityForRailroadFlag && requestedRailroad && offeredUtility && typeof Trade !== 'undefined') {
                var railroadOwnership = {};
                railroadOwnership[requestedRailroad] = p.index;
                railroadOwnership[offeredUtility] = square[requestedRailroad].owner;
                var railroadGain = propertyAssetValue(requestedRailroad, p.index, railroadOwnership) - propertyAssetValue(offeredUtility, p.index);
                if (railroadGain <= 10) {
                    return false;
                }

                utilityForRailroadFlag = false;
                property[requestedRailroad] = -1;
                property[offeredUtility] = 1;
                proposedTrade = new Trade(p, player[square[requestedRailroad].owner], 0, property, 0, 0);
                if (typeof game !== 'undefined' && game && typeof game.trade === 'function') {
                    game.trade(proposedTrade);
                    return true;
                }
            }

            return false;
        };

        this.postBail = function() {
            var developedDanger = 0;
            var opponents = typeof globalThis.player === 'undefined' ? [] : globalThis.player;

            for (var i = 0; i < 40; i++) {
                var property = square[i];
                if (property && property.owner !== 0 && property.owner !== p.index && (property.house > 0 || property.hotel === 1)) {
                    developedDanger = Math.max(developedDanger, expectedRentValue(i, property.owner));
                }
            }

            var hasFreeCard = p.communityChestJailCard || p.chanceJailCard;
            var reserveAfterFine = p.money - 50 >= this.getLiquidityFloor() * 0.75;
            var endgamePressure = Math.max(0, (estimateRemainingPlayers() - 2) * 0.25);

            if (p.jailroll === 2) {
                return true;
            }
            if (hasFreeCard && (developedDanger >= 70 || endgamePressure > 0.25)) {
                return true;
            }
            if (!reserveAfterFine) {
                return false;
            }
            if (developedDanger >= 100 && p.jailroll >= 1) {
                return true;
            }
            if (this.profile.name === 'Aggressive' && p.jailroll >= 1 && developedDanger >= 70) {
                return true;
            }
            return p.jailroll >= 1 && opponents.length <= 2 && developedDanger >= 80;
        };

        this.payDebt = function() {
            var mortgageCandidates = [];

            for (var i = 0; i < 40; i++) {
                var s = square[i];
                if (s.owner !== p.index) {
                    continue;
                }
                if (s.house === 0 && s.hotel !== 1 && !s.mortgage) {
                    mortgageCandidates.push({ index: i, value: propertyAssetValue(i, p.index) });
                }
            }

            // Houses must be sold evenly across a color-group, so re-scan for the
            // cheapest-to-lose eligible property (one with the most houses in its
            // group) after every sale, since selling can change which are eligible.
            var sold = true;
            while (p.money < 0 && sold) {
                sold = false;
                var houseCandidates = [];

                for (var j = 0; j < 40; j++) {
                    var candidate = square[j];
                    if (candidate.owner === p.index && (candidate.house > 0 || candidate.hotel === 1) && canSellHouse(j)) {
                        var saleValue = candidate.houseprice * 0.5;
                        var rentLoss = expectedRentValue(j, p.index) / Math.max(1, saleValue);
                        houseCandidates.push({ index: j, rentLoss: rentLoss });
                    }
                }

                if (houseCandidates.length === 0) {
                    break;
                }

                houseCandidates.sort(function(left, right) {
                    return left.rentLoss - right.rentLoss;
                });

                if (typeof sellHouse === 'function' && sellHouse(houseCandidates[0].index)) {
                    sold = true;
                }
            }

            mortgageCandidates.sort(function(left, right) {
                return left.value - right.value;
            });
            for (var mortgageCandidate = 0; mortgageCandidate < mortgageCandidates.length && p.money < 0; mortgageCandidate++) {
                if (typeof mortgage === 'function') {
                    mortgage(mortgageCandidates[mortgageCandidate].index);
                }
            }
        };

        this.bid = function(property, currentBid) {
            var s = square[property];
            if (!s || s.owner !== 0) {
                return -1;
            }

            var value = evaluateProperty(property, p.index, p.money, this.profile, Math.max(0, (estimateRemainingPlayers() - 2) * 0.25));
            var liquidityFloor = this.getLiquidityFloor();
            var minimumBid = currentBid + 1;
            var bidStep = 10;

            if (value < 65) {
                return currentBid > 0 ? -1 : 0;
            }

            var valuePremium = clamp((value - s.price * 0.18) / 100, 0, 1.25);
            var valueMultiplier = 0.7 + valuePremium * 0.45;
            var profileMultiplier = this.profile.auctionBias || 1;
            var maxBid = Math.round(s.price * valueMultiplier * profileMultiplier);
            var affordableBid = Math.floor(p.money - liquidityFloor);
            maxBid = Math.min(maxBid, affordableBid);

            if (maxBid < minimumBid) {
                return currentBid > 0 ? -1 : 0;
            }

            var nextBid = currentBid === 0 ? Math.min(bidStep, maxBid) : currentBid + bidStep;
            return Math.min(nextBid, maxBid);
        };
    }

    StrategicAI.PROFILE_LIBRARY = PROFILE_LIBRARY;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { StrategicAI: StrategicAI, PROFILE_LIBRARY: PROFILE_LIBRARY };
    }

    global.StrategicAI = StrategicAI;
})(typeof window !== 'undefined' ? window : globalThis);
