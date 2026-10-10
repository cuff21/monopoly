if (typeof module !== 'undefined' && module.exports) require('../application/player-controllers');
// Original StrategicAI strategy, using the owning Game's structured decision view.
(function(global) {
    'use strict';
    var PROFILE_LIBRARY = [
        { name: 'Aggressive', riskTolerance: 0.85, liquidityFloor: 0.08, endgameBias: 1.45, auctionBias: 1.35, tradeBias: 1.25, houseBias: 1.3 },
        { name: 'Balanced', riskTolerance: 0.6, liquidityFloor: 0.12, endgameBias: 1.15, auctionBias: 1.1, tradeBias: 1.0, houseBias: 1.0 },
        { name: 'Defensive', riskTolerance: 0.35, liquidityFloor: 0.18, endgameBias: 0.95, auctionBias: 0.8, tradeBias: 0.8, houseBias: 0.8 },
        { name: 'Opportunist', riskTolerance: 0.72, liquidityFloor: 0.1, endgameBias: 1.2, auctionBias: 1.2, tradeBias: 1.1, houseBias: 1.15 }
    ];

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function pickProfile(profile, random) {
        if (profile && profile.name) {
            var match = PROFILE_LIBRARY.filter(function(item) {
                return item.name.toLowerCase() === profile.name.toLowerCase();
            })[0];
            if (match) {
                return Object.assign({}, match, profile);
            }
            return Object.assign({}, PROFILE_LIBRARY[1], profile);
        }

        return Object.assign({}, PROFILE_LIBRARY[Math.floor((random || Math.random)() * PROFILE_LIBRARY.length)]);
    }

    StrategicAI.getRandomProfile = function(random) {
        return Object.assign({}, PROFILE_LIBRARY[Math.floor((random || Math.random)() * PROFILE_LIBRARY.length)]);
    };

    function squareAt(view, squareId) {
        var definition = view.getSquare(squareId);
        return Object.assign({}, definition, view.getSquareState(squareId), {
            groupSquareIds: definition.groupId ? view.getGroupSquareIds(definition.groupId) : [],
            groupRules: definition.groupId ? view.getGroup(definition.groupId).rules : {}
        });
    }

    function propertyOwner(squareId, ownership, view) {
        if (ownership && ownership[squareId] !== undefined) {
            return ownership[squareId];
        }
        return view.getSquareOwner(squareId);
    }

    function propertyGroupScore(squareId, playerId, ownership, view) {
        var s = squareAt(view, squareId);
        if (!s || typeof s.groupSquareIds === 'undefined' || !s.groupSquareIds || s.groupSquareIds.length === 0) {
            return 0;
        }

        var owned = 0;
        var open = 0;
        var total = s.groupSquareIds.length;

        for (var i = 0; i < total; i++) {
            if (propertyOwner(s.groupSquareIds[i], ownership, view) === playerId) {
                owned++;
            } else if (propertyOwner(s.groupSquareIds[i], ownership, view) === null) {
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
            avgPrice += squareAt(view, s.groupSquareIds[j]).rules.purchasePrice;
        }
        avgPrice /= total;
        return Math.min(35, Math.max(10, avgPrice * 0.12));
    }

    function propertyAssetValue(squareId, playerId, ownership, view) {
        var s = squareAt(view, squareId);
        if (!s) {
            return 0;
        }

        var value = s.rules.purchasePrice * (s.mortgage ? 0.5 : 1) * 0.65;
        value += (s.rules.baseRent || 0) * 3;
        value += (s.rules.houseCost || 0) * 0.5;
        value += propertyGroupScore(squareId, playerId, ownership, view) * 2;

        if (s.groupSquareIds && s.groupSquareIds.length > 0 && propertyGroupScore(squareId, playerId, ownership, view) >= 80) {
            value += s.rules.houseCost * 2;
        }

        return value;
    }

    function expectedRent(squareId, playerId, ownership, view) {
        var s = squareAt(view, squareId);
        if (!s || s.rules.purchasePrice === 0) {
            return 0;
        }

        if (s.kind && s.kind === 'railroad') {
            var railroadCount = s.groupSquareIds.reduce(function(count, memberId) {
                return count + (propertyOwner(memberId, ownership, view) === playerId ? 1 : 0);
            }, 0);
            return railroadCount ? s.groupRules.rentTiers[Math.min(railroadCount, s.groupRules.rentTiers.length) - 1] : 0;
        }

        if (s.kind && s.kind === 'utility') {
            var utilityCount = s.groupSquareIds.reduce(function(count, memberId) {
                return count + (propertyOwner(memberId, ownership, view) === playerId ? 1 : 0);
            }, 0);
            return utilityCount ? s.groupRules.rentTiers[Math.min(utilityCount, s.groupRules.rentTiers.length) - 1] : 0;
        }

        var rent = s.house > 0 ? s.rules.rentTiers[Math.min(s.house, 5) - 1] : s.rules.baseRent || 0;
        if (s.groupSquareIds && s.groupSquareIds.length > 0 && propertyGroupScore(squareId, playerId, ownership, view) >= 80 && s.house === 0) {
            rent *= s.groupRules.monopolyMultiplier;
        }
        return rent;
    }

    function expectedRentValue(squareId, playerId, ownership, view) {
        var squareIds = view.getSquareIds();
        var activePlayers = estimateRemainingPlayers(view);
        var landingWeight = 0.8 + activePlayers * 0.05;
        var occupants = view.getPlayers();

        for (var i = 0; i < occupants.length; i++) {
            var opponent = occupants[i];
            if (opponent && opponent.playerId !== playerId && opponent.squareId !== undefined && !opponent.jail) {
                var distance = (squareIds.indexOf(squareId) - squareIds.indexOf(opponent.squareId) + squareIds.length) % squareIds.length;
                if (distance >= 2 && distance <= 12) {
                    landingWeight += (13 - distance) * 0.01;
                }
            }
        }

        return expectedRent(squareId, playerId, ownership, view) * landingWeight;
    }

    function opponentThreatScore(squareId, playerId, view) {
        var s = squareAt(view, squareId);
        if (!s || !s.groupSquareIds || s.groupSquareIds.length < 2) {
            return 0;
        }

        var strongestThreat = 0;
        var owners = {};
        for (var i = 0; i < s.groupSquareIds.length; i++) {
            var owner = squareAt(view, s.groupSquareIds[i]).ownerId;
            if (owner !== null && owner !== playerId) {
                owners[owner] = (owners[owner] || 0) + 1;
            }
        }

        for (var ownerKey in owners) {
            var owned = owners[ownerKey];
            var opponent = view.getPlayer(ownerKey);
            var cashMultiplier = opponent && opponent.money !== undefined ? clamp(0.8 + opponent.money / 3000, 0.8, 1.2) : 1;
            if (owned === s.groupSquareIds.length - 1 && s.ownerId === null) {
                strongestThreat = Math.max(strongestThreat, (70 + s.rules.purchasePrice * 0.12) * cashMultiplier);
            } else if (owned > 0) {
                strongestThreat = Math.max(strongestThreat, owned * 12 * cashMultiplier);
            }
        }

        return strongestThreat;
    }

    function evaluateProperty(squareId, playerId, cashOnHand, profile, endgamePressure, view) {
        var s = squareAt(view, squareId);
        if (!s || s.rules.purchasePrice === 0 || s.ownerId !== null) {
            return -Infinity;
        }

        var score = 0;
        score += s.rules.purchasePrice * 0.18;
        score += (s.rules.baseRent || 0) * 1.1;
        score += (s.rules.houseCost || 0) * 0.12;

        if (typeof s.groupSquareIds !== 'undefined' && s.groupSquareIds && s.groupSquareIds.length > 0) {
            var ownedInGroup = 0;
            var openInGroup = 0;
            for (var g = 0; g < s.groupSquareIds.length; g++) {
                var groupTile = squareAt(view, s.groupSquareIds[g]);
                if (groupTile.ownerId === playerId) {
                    ownedInGroup++;
                } else if (groupTile.ownerId === null) {
                    openInGroup++;
                }
            }

            if (ownedInGroup > 0) {
                score += 25 + ownedInGroup * 18;
            }
            if (ownedInGroup === s.groupSquareIds.length - 1) {
                score += 35;
            }
            if (openInGroup > 0) {
                score += 8 + openInGroup * 5;
            }
        }

        if (s.kind === 'railroad') {
            score += 65;
        }

        if (s.kind === 'utility') {
            score += 60;
        }

        score += propertyGroupScore(squareId, playerId, null, view);
        score += expectedRentValue(squareId, playerId, null, view) * 0.8;
        score += opponentThreatScore(squareId, playerId, view) * profile.endgameBias;
        score *= profile.riskTolerance > 0.7 ? 1.08 : 1;
        score += endgamePressure * 12 * profile.endgameBias;

        if (cashOnHand < s.rules.purchasePrice + 250) {
            score -= 10 * (1 / Math.max(0.25, profile.riskTolerance));
        }

        if (cashOnHand < s.rules.purchasePrice + 100) {
            score -= 25 * (1.2 - profile.riskTolerance);
        }

        return score;
    }

    function groupOwnershipSummary(playerId, view) {
        var squareIds = view.getSquareIds();
        var summary = [];
        for (var iOrdinal = 0; iOrdinal < squareIds.length; iOrdinal++) {
            var i = squareIds[iOrdinal];
            var s = squareAt(view, i);
            if (s && typeof s.groupSquareIds !== 'undefined' && s.groupSquareIds && s.groupSquareIds.length > 0) {
                var owned = 0;
                var total = s.groupSquareIds.length;
                for (var j = 0; j < total; j++) {
                    if (squareAt(view, s.groupSquareIds[j]) && squareAt(view, s.groupSquareIds[j]).ownerId === playerId) {
                        owned++;
                    }
                }
                summary.push({
                    squareId: i,
                    groupId: s.groupId,
                    size: total,
                    owned: owned,
                    score: owned / total
                });
            }
        }
        return summary;
    }

    function estimateRemainingPlayers(view) {
        var players = view.getPlayers();
        var active = 0;
        for (var i = 0; i < players.length; i++) {
            if (players[i] && (players[i].money >= 0 || players[i].creditor === -1)) {
                active++;
            }
        }
        return active || 3;
    }

    function StrategicAI(p, profile) {
        var game = p && p.game;
        if (!game || !game.decisionView) throw new TypeError('StrategicAI requires the owning Game decision view.');
        var view = game.decisionView;
        var random = typeof game.state.random === 'function' ? game.state.random : Math.random;
        this.turnNumber = 0;
        this.alertList = "";
        this.profile = pickProfile(profile || {}, random);
        this.tradeMemory = Object.create(null);
        this.portfolioPlan = { targetGroup: null, confidence: 0.0 };

        if (!this.constructor.count) {
            this.constructor.count = 0;
        }
        this.constructor.count++;

        p.name = "Strategic AI Player " + this.constructor.count;
        p = PlayerControllers.policyPlayer(p);
        PlayerControllers.bindPolicy(this, p);
        game = p.game;
        view = game.decisionView;
        this.decisionView = view;
        this.personality = this.profile.name;

        var squareIds = view.getSquareIds();

        this.recordTrade = function(opponent, direction, value) {
            var key = typeof opponent === 'string' ? opponent : opponent && opponent.playerId || 'unknown';
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
            var key = typeof opponent === 'string' ? opponent : opponent && opponent.playerId || 'unknown';
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
            var groups = groupOwnershipSummary(p.playerId, view);
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

        this.buyProperty = function(squareId) {
            var s = squareAt(view, squareId);
            if (!s || s.rules.purchasePrice === 0 || s.ownerId !== null) {
                return false;
            }

            var liquidityFloor = this.getLiquidityFloor();
            if (p.money < s.rules.purchasePrice + liquidityFloor) {
                return false;
            }

            var endgamePressure = Math.max(0, (estimateRemainingPlayers(view) - 2) * 0.25);
            var score = evaluateProperty(squareId, p.playerId, p.money, this.profile, endgamePressure, view);
            var groupBonus = 0;
            if (typeof s.groupSquareIds !== 'undefined' && s.groupSquareIds && s.groupSquareIds.length > 0) {
                var groupOwned = 0;
                var groupOpen = 0;
                for (var g = 0; g < s.groupSquareIds.length; g++) {
                    if (squareAt(view, s.groupSquareIds[g]).ownerId === p.playerId) {
                        groupOwned++;
                    } else if (squareAt(view, s.groupSquareIds[g]).ownerId === null) {
                        groupOpen++;
                    }
                }
                groupBonus = groupOwned * 15 + groupOpen * 8;
            }

            var profileThreshold = this.profile.name === 'Defensive' ? 68 : this.profile.name === 'Aggressive' ? 52 : 58;
            if ((s.kind === 'railroad' || s.kind === 'utility') && score >= 55) {
                return true;
            }

            if (score >= profileThreshold + (this.profile.name === 'Aggressive' ? 8 : 0)) {
                return true;
            }

            if (score + groupBonus >= 45 && (s.rules.purchasePrice <= 220 || this.profile.name === 'Aggressive')) {
                return true;
            }

            if (this.profile.name === 'Opportunist' && s.rules.purchasePrice <= 180 && score >= 36) {
                return true;
            }

            return false;
        };

        this.acceptTrade = function(tradeObj) {
            var money = tradeObj.getMoney();
            var initiator = view.getPlayer(tradeObj.getInitiator());
            var recipient = view.getPlayer(tradeObj.getRecipient());
            var offeredSquareIds = tradeObj.getOfferedSquareIds();
            var requestedSquareIds = tradeObj.getRequestedSquareIds();
            var ownership = Object.create(null);
            var incomingValue = 0;
            var outgoingValue = 0;

            offeredSquareIds.forEach(function(id) { ownership[id] = p.playerId; });
            requestedSquareIds.forEach(function(id) { ownership[id] = initiator.playerId; });
            offeredSquareIds.forEach(function(id) { incomingValue += propertyAssetValue(id, p.playerId, ownership, view); });
            requestedSquareIds.forEach(function(id) { outgoingValue += propertyAssetValue(id, p.playerId, null, view); });

            var tradeValue = money + incomingValue - outgoingValue;
            tradeValue += tradeObj.getHeldCards().reduce(function(value, card) { return value + 15 * card.direction; }, 0);

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
            if (tradeValue >= counterThreshold && counterMoney > money && initiator.money >= counterMoney && typeof global.Trade === 'function') {
                this.recordTrade(initiator, 'countered', tradeValue);
                return new global.Trade(initiator.playerId, recipient.playerId, counterMoney, offeredSquareIds, requestedSquareIds, tradeObj.getHeldCards());
            }

            this.recordTrade(initiator, 'rejected', tradeValue);
            return false;
        };

        this.beforeTurn = function*() {
            this.turnNumber++;
            var s;
            var groups = groupOwnershipSummary(p.playerId, view);
            var bestHouseTarget = null;
            this.planPortfolio();

            for (var i = 0; i < groups.length; i++) {
                var group = groups[i];
                if (group.owned === group.size && group.size >= 2) {
                    var groupTiles = squareAt(view, group.squareId).groupSquareIds || [];
                    var minimumHouseLevel = 5;
                    for (var levelIndex = 0; levelIndex < groupTiles.length; levelIndex++) {
                        var levelTile = squareAt(view, groupTiles[levelIndex]);
                        if (levelTile && levelTile.house < minimumHouseLevel) {
                            minimumHouseLevel = levelTile.house;
                        }
                    }

                    for (var j = 0; j < groupTiles.length; j++) {
                        var tile = squareAt(view, groupTiles[j]);
                        if (tile.ownerId !== p.playerId || tile.house !== minimumHouseLevel || tile.house >= 5 || tile.hotel === 1 || tile.rules.houseCost <= 0) {
                            continue;
                        }

                        var currentRent = tile.house === 0 ? tile.rules.baseRent : tile.rules.rentTiers[tile.house - 1];
                        var nextRent = tile.house === 4 ? tile.rules.rentTiers[4] : tile.rules.rentTiers[tile.house];
                        var rentGain = Math.max(0, (nextRent || currentRent) - (currentRent || 0));
                        var breakpointBonus = tile.house === 2 ? 1.35 : tile.house === 3 ? 1.1 : 1;
                        var developmentScore = rentGain / tile.rules.houseCost * (this.profile.houseBias || 1) * breakpointBonus;
                        if (!bestHouseTarget || developmentScore > bestHouseTarget.developmentScore || (developmentScore === bestHouseTarget.developmentScore && tile.house < bestHouseTarget.tile.house)) {
                            bestHouseTarget = { squareId: groupTiles[j], tile: tile, developmentScore: developmentScore };
                        }
                    }
                }
            }

            if (bestHouseTarget && p.money > bestHouseTarget.tile.rules.houseCost + this.getLiquidityFloor() * 0.6) {
                if (p.game) {
                    yield [{ type: 'buyHouse', squareId: bestHouseTarget.squareId }];
                }
            }

            if (this.profile.name !== 'Defensive') {
                var unmortgageCandidates = [];
                for (var iOrdinal = 0; iOrdinal < squareIds.length; iOrdinal++) {
                    var i = squareIds[iOrdinal];
                    s = squareAt(view, i);
                    if (s && s.ownerId === p.playerId && s.mortgage) {
                        unmortgageCandidates.push({
                            squareId: i,
                            cost: Math.round(s.rules.purchasePrice * 0.55),
                            returnValue: expectedRentValue(i, p.playerId, null, view) + propertyGroupScore(i, p.playerId, null, view) * 2
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
                    if (p.game) {
                        yield [{ type: 'unmortgage', squareId: unmortgageCandidate.squareId }];
                    }
                }
            }

            return false;
        };

        var utilityForRailroadFlag = true;

        this.onLand = function*() {
            var proposedTrade;
            var railroadIds = squareIds.filter(function(id) { return view.getSquare(id).kind === 'railroad'; });
            var utilityIds = squareIds.filter(function(id) { return view.getSquare(id).kind === 'utility'; });
            var requestedRailroad = null;
            var offeredUtility = null;

            for (var i = 0; i < railroadIds.length; i++) {
                var railroad = squareAt(view, railroadIds[i]);
                if (railroad && railroad.ownerId !== null && railroad.ownerId !== p.playerId) {
                    requestedRailroad = railroadIds[i];
                    break;
                }
            }

            for (var j = 0; j < utilityIds.length; j++) {
                var utility = squareAt(view, utilityIds[j]);
                if (utility && utility.ownerId === p.playerId && utility.ownerId !== null) {
                    offeredUtility = utilityIds[j];
                    break;
                }
            }

            var bestOpportunity = null;
            var availableCash = Math.max(0, p.money - this.getLiquidityFloor());

            var getRecipientTradeMinimum = function(recipientId) {
                var recipient = view.getPlayer(recipientId);
                var recipientAI = recipient && recipient.policyMetadata;
                var tradeBias = recipientAI && recipientAI.profile ? recipientAI.profile.tradeBias || 1 : 1;
                var opponentBias = recipientAI && recipientAI.tradeBiases ? recipientAI.tradeBiases[p.playerId] || 1 : 1;
                return 85 * tradeBias / opponentBias;
            };

            for (var targetOrdinal = 0; targetOrdinal < squareIds.length; targetOrdinal++) {
                var targetId = squareIds[targetOrdinal];
                var targetSquare = squareAt(view, targetId);
                if (!targetSquare || !targetSquare.groupSquareIds || targetSquare.groupSquareIds.length < 2) {
                    continue;
                }

                var ownedInTarget = 0;
                var missingId = null;
                var missingOwner = null;
                var groupBlocked = false;
                for (var targetMember = 0; targetMember < targetSquare.groupSquareIds.length; targetMember++) {
                    var memberId = targetSquare.groupSquareIds[targetMember];
                    var member = squareAt(view, memberId);
                    if (!member) {
                        groupBlocked = true;
                        break;
                    }
                    if (member.house > 0 || member.hotel > 0) {
                        groupBlocked = true;
                    }
                    if (member.ownerId === p.playerId) {
                        ownedInTarget++;
                    } else {
                        missingId = memberId;
                        missingOwner = member.ownerId;
                    }
                }

                if (groupBlocked || ownedInTarget !== targetSquare.groupSquareIds.length - 1 || missingOwner === null || missingOwner === p.playerId) {
                    continue;
                }

                var validOffers = [];
                for (var offerOrdinal = 0; offerOrdinal < squareIds.length; offerOrdinal++) {
                    var offerId = squareIds[offerOrdinal];
                    var offerSquare = squareAt(view, offerId);
                    if (!offerSquare || offerSquare.ownerId !== p.playerId || offerId === missingId || offerSquare.mortgage) {
                        continue;
                    }

                    var offerGroup = offerSquare.groupSquareIds || [];
                    var offerBlocked = offerSquare.house > 0 || offerSquare.hotel > 0;
                    for (var offerMember = 0; offerMember < offerGroup.length; offerMember++) {
                        if (!squareAt(view, offerGroup[offerMember]) || squareAt(view, offerGroup[offerMember]).house > 0 || squareAt(view, offerGroup[offerMember]).hotel > 0) {
                            offerBlocked = true;
                        }
                    }
                    if (offerBlocked || targetSquare.groupSquareIds.indexOf(offerId) !== -1) {
                        continue;
                    }
                    if (propertyGroupScore(offerId, p.playerId, null, view) >= 80) {
                        continue;
                    }

                    validOffers.push(offerId);

                    var hypotheticalOwnership = {};
                    hypotheticalOwnership[missingId] = p.playerId;
                    hypotheticalOwnership[offerId] = missingOwner;
                    var receivedValue = propertyAssetValue(missingId, p.playerId, hypotheticalOwnership, view);
                    var offeredValue = propertyAssetValue(offerId, p.playerId, null, view);
                    var opponentTargetValue = propertyAssetValue(missingId, missingOwner, null, view);
                    var opponentOfferValue = propertyAssetValue(offerId, missingOwner, hypotheticalOwnership, view);
                    var recipientMinimum = getRecipientTradeMinimum(missingOwner);
                    var cashOffer = Math.max(0, Math.ceil(opponentTargetValue - opponentOfferValue + recipientMinimum));
                    var netGain = receivedValue - offeredValue - cashOffer;

                    if (cashOffer <= availableCash && netGain > 20 && (!bestOpportunity || netGain > bestOpportunity.netGain)) {
                        bestOpportunity = {
                            missingId: missingId,
                            offerId: offerId,
                            owner: missingOwner,
                            cash: cashOffer,
                            netGain: netGain
                        };
                    }
                }

                for (var firstOffer = 0; firstOffer < validOffers.length; firstOffer++) {
                    for (var secondOffer = firstOffer + 1; secondOffer < validOffers.length; secondOffer++) {
                        var firstOfferId = validOffers[firstOffer];
                        var secondOfferId = validOffers[secondOffer];
                        var multiOwnership = {};
                        multiOwnership[missingId] = p.playerId;
                        multiOwnership[firstOfferId] = missingOwner;
                        multiOwnership[secondOfferId] = missingOwner;
                        var multiReceivedValue = propertyAssetValue(missingId, p.playerId, multiOwnership, view);
                        var multiOfferedValue = propertyAssetValue(firstOfferId, p.playerId, null, view) + propertyAssetValue(secondOfferId, p.playerId, null, view);
                        var multiOpponentTargetValue = propertyAssetValue(missingId, missingOwner, null, view);
                        var multiOpponentOfferValue = propertyAssetValue(firstOfferId, missingOwner, multiOwnership, view) + propertyAssetValue(secondOfferId, missingOwner, multiOwnership, view);
                        var multiRecipientMinimum = getRecipientTradeMinimum(missingOwner);
                        var multiCashOffer = Math.max(0, Math.ceil(multiOpponentTargetValue - multiOpponentOfferValue + multiRecipientMinimum));
                        var multiNetGain = multiReceivedValue - multiOfferedValue - multiCashOffer;

                        if (multiCashOffer <= availableCash && multiNetGain > 20 && (!bestOpportunity || multiNetGain > bestOpportunity.netGain)) {
                            bestOpportunity = {
                                missingId: missingId,
                                offerId: firstOfferId,
                                additionalOfferId: secondOfferId,
                                owner: missingOwner,
                                cash: multiCashOffer,
                                netGain: multiNetGain
                            };
                        }
                    }
                }
            }

            if (bestOpportunity && typeof global.Trade === 'function') {
                var offeredSquareIds = [bestOpportunity.offerId];
                if (bestOpportunity.additionalOfferId !== undefined) {
                    offeredSquareIds.push(bestOpportunity.additionalOfferId);
                }
                proposedTrade = new global.Trade(p.playerId, bestOpportunity.owner, bestOpportunity.cash, offeredSquareIds, [bestOpportunity.missingId], []);
                if (p.game) {
                    yield [{ type: 'proposeTrade', offer: proposedTrade }];
                    // The controller awaits negotiation before resuming this phase.
                    return false;
                }
            }

            if (utilityForRailroadFlag && requestedRailroad && offeredUtility && typeof global.Trade === 'function') {
                var railroadOwnership = {};
                railroadOwnership[requestedRailroad] = p.playerId;
                railroadOwnership[offeredUtility] = squareAt(view, requestedRailroad).ownerId;
                var railroadGain = propertyAssetValue(requestedRailroad, p.playerId, railroadOwnership, view) - propertyAssetValue(offeredUtility, p.playerId, null, view);
                if (railroadGain <= 10) {
                    return false;
                }

                utilityForRailroadFlag = false;
                proposedTrade = new global.Trade(p.playerId, squareAt(view, requestedRailroad).ownerId, 0, [offeredUtility], [requestedRailroad], []);
                if (p.game) {
                    yield [{ type: 'proposeTrade', offer: proposedTrade }];
                    return false;
                }
            }

            return false;
        };

        this.postBail = function() {
            var developedDanger = 0;
            var opponents = view.getPlayers();

            for (var iOrdinal = 0; iOrdinal < squareIds.length; iOrdinal++) {
                var i = squareIds[iOrdinal];
                var property = squareAt(view, i);
                if (property && property.ownerId !== null && property.ownerId !== p.playerId && (property.house > 0 || property.hotel === 1)) {
                    developedDanger = Math.max(developedDanger, expectedRentValue(i, property.ownerId, null, view));
                }
            }

            var hasFreeCard = p.heldCards && p.heldCards.length > 0;
            var reserveAfterFine = p.money - view.board.rules.bailAmount >= this.getLiquidityFloor() * 0.75;
            var endgamePressure = Math.max(0, (estimateRemainingPlayers(view) - 2) * 0.25);

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
            return p.jailroll >= 1 && opponents.length <= 1 && developedDanger >= 80;
        };

        this.payDebt = function*() {
            // Houses must be sold evenly across a color-group, so re-scan for the
            // cheapest-to-lose eligible property (one with the most houses in its
            // group) after every sale, since selling can change which are eligible.
            var sold = true;
            while (p.money < 0 && sold) {
                sold = false;
                var houseCandidates = [];

                for (var jOrdinal = 0; jOrdinal < squareIds.length; jOrdinal++) {
                    var j = squareIds[jOrdinal];
                    var candidate = squareAt(view, j);
                    if (candidate.ownerId === p.playerId && (candidate.house > 0 || candidate.hotel === 1) && p.game && p.game.canSellHouse(j)) {
                        var saleValue = candidate.rules.houseCost * 0.5;
                        var rentLoss = expectedRentValue(j, p.playerId, null, view) / Math.max(1, saleValue);
                        houseCandidates.push({ squareId: j, rentLoss: rentLoss });
                    }
                }

                if (houseCandidates.length === 0) {
                    break;
                }

                houseCandidates.sort(function(left, right) {
                    return left.rentLoss - right.rentLoss;
                });

                if (yield [{ type: 'sellHouse', squareId: houseCandidates[0].squareId }]) {
                    sold = true;
                }
            }

            // Selling the last houses can make additional properties mortgageable.
            var mortgageCandidates = [];
            squareIds.forEach(function(id) {
                var s = squareAt(view, id);
                if (s.ownerId === p.playerId && !s.house && !s.hotel && !s.mortgage && !s.groupSquareIds.some(function(memberId) {
                    var member = view.getSquareState(memberId);
                    return member.house || member.hotel;
                })) {
                    mortgageCandidates.push({ squareId: id, value: propertyAssetValue(id, p.playerId, null, view) });
                }
            });

            mortgageCandidates.sort(function(left, right) {
                return left.value - right.value;
            });
            for (var mortgageCandidate = 0; mortgageCandidate < mortgageCandidates.length && p.money < 0; mortgageCandidate++) {
                if (p.game) {
                    yield [{ type: 'mortgage', squareId: mortgageCandidates[mortgageCandidate].squareId }];
                }
            }
        };

        this.inherit = function(squareIds) {
            if (this.profile.name === 'Defensive') return [];
            var floor = this.getLiquidityFloor();
            var view = p.game.decisionView;
            var id = squareIds.find(function(id) {
                return view.getSquareState(id).mortgage && p.money - Math.round(view.getSquare(id).rules.purchasePrice * 0.5) >= floor;
            });
            return id ? [{ type: 'inheritUnmortgage', squareId: id }] : [];
        };

        this.bid = function(property, currentBid) {
            if (!Number.isFinite(p.money) || !Number.isInteger(currentBid) || currentBid < 0 || !view.board.squaresById[property]) return -1;
            var s = squareAt(view, property);
            if (!s || s.ownerId !== null) {
                return -1;
            }

            var value = evaluateProperty(property, p.playerId, p.money, this.profile, Math.max(0, (estimateRemainingPlayers(view) - 2) * 0.25), view);
            var liquidityFloor = this.getLiquidityFloor();
            var minimumBid = currentBid + 1;
            var bidStep = 10;

            if (value < 65) {
                return currentBid > 0 ? -1 : 0;
            }

            var valuePremium = clamp((value - s.rules.purchasePrice * 0.18) / 100, 0, 1.25);
            var valueMultiplier = 0.7 + valuePremium * 0.45;
            var profileMultiplier = this.profile.auctionBias || 1;
            var maxBid = Math.round(s.rules.purchasePrice * valueMultiplier * profileMultiplier);
            var affordableBid = Math.floor(p.money - liquidityFloor);
            if (!Number.isFinite(maxBid) || !Number.isFinite(affordableBid)) return -1;
            maxBid = Math.min(maxBid, affordableBid, Math.floor(p.money));
            if (!Number.isFinite(maxBid)) return -1;

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
    if (global.AISetupRegistry) global.AISetupRegistry.register({
        id: '4', label: 'Strategic AI', selectable: true, trackResults: true,
        profiles: function() { return PROFILE_LIBRARY.map(function(profile) { return profile.name; }); },
        createPlayer: function(player, selection, random) {
            var chosen = selection && selection.profile;
            var profile = typeof chosen === 'string'
                ? chosen === 'Random' ? StrategicAI.getRandomProfile(random) : { name: chosen }
                : chosen || StrategicAI.getRandomProfile(random);
            return new StrategicAI(player, profile);
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
