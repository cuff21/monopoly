// Gen5 AI: property and group valuation, replacing static distance heuristics with real landing probability.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function propertyOwner(squareId, ownership, subject) {
        if (ownership && Object.prototype.hasOwnProperty.call(ownership, squareId) && ownership[squareId] !== undefined) {
            return ownership[squareId];
        }
        var view = AIGen5.getDecisionView(subject);
        return view.getSquareOwner(squareId);
    }

    function groupScore(squareId, ownerId, ownership, subject) {
        var view = AIGen5.getDecisionView(subject);
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || sGroupIds.length === 0) {
            return 0;
        }

        var owned = 0;
        var open = 0;
        var total = sGroupIds.length;

        for (var i = 0; i < total; i++) {
            var owner = propertyOwner(sGroupIds[i], ownership, subject);
            if (owner === ownerId) {
                owned++;
            } else if (owner === null) {
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
            avgPrice += view.getSquare(sGroupIds[j]).rules.purchasePrice;
        }
        avgPrice /= total;
        return Math.min(35, Math.max(10, avgPrice * 0.12));
    }

    // Discounts future house-building value as the shared 32-house bank runs dry, since a completed
    // monopoly is worth less if there's little chance of actually developing it any time soon.
    function houseBuildFeasibility(subject) {
        var game = subject && subject.game;
        if (game && typeof game.getHouseHotelSupply === 'function') {
            return clamp(game.getHouseHotelSupply().housesAvailable / 10, 0.2, 1);
        }
        var view = AIGen5.getDecisionView(subject);
        var used = view.getSquareIds().reduce(function(total, id) {
            var state = view.getSquareState(id);
            return total + (state.hotel ? 0 : state.house);
        }, 0);
        return clamp((view.board.rules.houseTotal - used) / 10, 0.2, 1);
    }

    function assetValue(squareId, ownerId, ownership, subject) {
        var view = AIGen5.getDecisionView(subject);
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s) {
            return 0;
        }

        var buildFeasibility = houseBuildFeasibility(subject);
        var value = s.rules.purchasePrice * (view.getSquareState(s.id).mortgage ? 0.5 : 1) * 0.65;
        value += (s.rules.baseRent || 0) * 3;
        value += (s.rules.houseCost || 0) * 0.5 * buildFeasibility;
        value += groupScore(squareId, ownerId, ownership, subject) * 2;

        if (sGroupIds.length > 0 && groupScore(squareId, ownerId, ownership, subject) >= 80) {
            value += s.rules.houseCost * 2 * buildFeasibility;
        }

        return value;
    }

    function baseRent(squareId, ownerId, ownership, subject) {
        var view = AIGen5.getDecisionView(subject);
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || s.rules.purchasePrice === 0) {
            return 0;
        }

        if (s.kind === 'railroad' || s.kind === 'utility') {
            var ownedCount = sGroupIds.filter(function(id) {
                return propertyOwner(id, ownership, subject) === ownerId;
            }).length;
            // Utilities retain the original multiplier heuristic rather than dollar rent.
            return ownedCount ? s.rules.rentTiers[Math.min(ownedCount, s.rules.rentTiers.length) - 1] : 0;
        }

        var squareState = view.getSquareState(squareId);
        var level = squareState.hotel ? 5 : squareState.house;
        var rent = level > 0 ? s.rules.rentTiers[level - 1] : s.rules.baseRent;
        if (sGroupIds.length > 0 && groupScore(squareId, ownerId, ownership, subject) >= 80 && level === 0) {
            rent *= view.getGroup(s.groupId).rules.monopolyMultiplier;
        }
        return Number.isFinite(rent) ? rent : 0;
    }

    // Rent weighted by the real probability that any active opponent lands on this square within `turnsAhead` turns.
    function expectedRentValue(squareId, ownerId, ownership, turnsAhead, subject) {
        var rent = baseRent(squareId, ownerId, ownership, subject);
        if (rent <= 0) {
            return 0;
        }
        if (!AIGen5.Probability) {
            return rent;
        }
        var threat = AIGen5.Probability.aggregateBoardThreat(squareId, ownerId, turnsAhead || 2, subject);
        return rent * (0.5 + threat);
    }

    function opponentThreatScore(squareId, ownerId, subject) {
        var view = AIGen5.getDecisionView(subject);
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || sGroupIds.length < 2) {
            return 0;
        }

        var strongestThreat = 0;
        var owners = Object.create(null);
        for (var i = 0; i < sGroupIds.length; i++) {
            var owner = view.getSquareState(sGroupIds[i]).ownerId;
            if (owner !== null && owner !== ownerId) {
                owners[owner] = (owners[owner] || 0) + 1;
            }
        }

        for (var ownerKey in owners) {
            var owned = owners[ownerKey];
            var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerById(ownerKey, subject) : null;
            var cashMultiplier = opponent && opponent.money !== undefined ? clamp(0.8 + opponent.money / 3000, 0.8, 1.2) : 1;
            var rank = opponent && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponent) : 'Contender';
            var rankMultiplier = rank === 'Leader' ? 1.3 : rank === 'Weak' || rank === 'NearBankrupt' ? 0.6 : 1;

            if (owned === sGroupIds.length - 1 && view.getSquareState(s.id).ownerId === null) {
                strongestThreat = Math.max(strongestThreat, (70 + s.rules.purchasePrice * 0.12) * cashMultiplier * rankMultiplier);
            } else if (owned > 0) {
                strongestThreat = Math.max(strongestThreat, owned * 12 * cashMultiplier * rankMultiplier);
            }
        }

        return strongestThreat;
    }

    function evaluateProperty(squareId, ownerId, cashOnHand, profile, endgamePressure, subject) {
        var view = AIGen5.getDecisionView(subject);
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || s.rules.purchasePrice === 0 || view.getSquareState(s.id).ownerId !== null) {
            return -Infinity;
        }

        var score = 0;
        score += s.rules.purchasePrice * 0.18;
        score += (s.rules.baseRent || 0) * 1.1;
        score += (s.rules.houseCost || 0) * 0.12 * houseBuildFeasibility(subject);

        if (sGroupIds.length > 0) {
            var ownedInGroup = 0;
            var openInGroup = 0;
            for (var g = 0; g < sGroupIds.length; g++) {
                var groupTile = view.getSquare(sGroupIds[g]);
                if (view.getSquareState(groupTile.id).ownerId === ownerId) {
                    ownedInGroup++;
                } else if (view.getSquareState(groupTile.id).ownerId === null) {
                    openInGroup++;
                }
            }

            if (ownedInGroup > 0) {
                score += 25 + ownedInGroup * 18;
            }
            if (ownedInGroup === sGroupIds.length - 1) {
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

        score += groupScore(squareId, ownerId, null, subject);
        score += expectedRentValue(squareId, ownerId, null, 2, subject) * 0.8;
        score += opponentThreatScore(squareId, ownerId, subject) * (profile.endgameBias || 1);
        score *= (profile.riskTolerance || 0.6) > 0.7 ? 1.08 : 1;
        score += (endgamePressure || 0) * 12 * (profile.endgameBias || 1);

        if (cashOnHand < s.rules.purchasePrice + 250) {
            score -= 10 * (1 / Math.max(0.25, profile.riskTolerance || 0.6));
        }
        if (cashOnHand < s.rules.purchasePrice + 100) {
            score -= 25 * (1.2 - (profile.riskTolerance || 0.6));
        }

        return score;
    }

    function groupOwnershipSummary(ownerId, subject) {
        var view = AIGen5.getDecisionView(subject);
        var squareIds = view.getSquareIds();
        var summary = [];
        for (var i of squareIds) {
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (s && sGroupIds.length > 0) {
                var owned = 0;
                var total = sGroupIds.length;
                for (var j = 0; j < total; j++) {
                    if (view.getSquare(sGroupIds[j]) && view.getSquareState(sGroupIds[j]).ownerId === ownerId) {
                        owned++;
                    }
                }
                summary.push({ squareId: i, size: total, owned: owned, score: owned / total });
            }
        }
        return summary;
    }

    // Evaluates strategic blocking leverage of a square:
    // blocks color monopoly completion, railroad clusters (3rd/4th railroad), or utility pairs.
    function strategicBlockingValue(squareId, forPlayerId, againstPlayerId, subject) {
        var view = AIGen5.getDecisionView(subject);
        if (!view) {
            return 0;
        }
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || !sGroupIds) {
            return 0;
        }
        var blockingScore = 0;

        // 1. Color group monopoly blocking:
        if (s.rules.houseCost > 0 && sGroupIds.length >= 2) {
            var againstOwned = 0;
            for (var i = 0; i < sGroupIds.length; i++) {
                var member = view.getSquare(sGroupIds[i]);
                if (member && view.getSquareState(member.id).ownerId === againstPlayerId) {
                    againstOwned++;
                }
            }
            if (againstOwned === sGroupIds.length - 1) {
                var oppPlayer = AIGen5.Analytics ? AIGen5.Analytics.getPlayerById(againstPlayerId, subject) : null;
                var rank = oppPlayer && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(oppPlayer) : 'Contender';
                var rankMult = rank === 'Leader' ? 2.0 : (rank === 'NearBankrupt' ? 0.7 : 1.2);
                blockingScore += ((s.rules.purchasePrice || 0) * 0.8 + (s.rules.houseCost || 100) * 1.5) * rankMult;
            } else if (againstOwned > 0) {
                blockingScore += againstOwned * 20;
            }
        }

        // 2. Railroad lane blocking:
        if (s.kind === 'railroad') {
            var rrOwned = 0;
            sGroupIds.forEach(function(rr) {
                if (view.getSquareState(rr).ownerId === againstPlayerId) {
                    rrOwned++;
                }
            });
            if (rrOwned >= 2) {
                blockingScore += (rrOwned === 3 ? 90 : 50);
            }
        }

        // 3. Utility blocking:
        if (s.kind === 'utility') {
            if (sGroupIds.some(function(id) {
                return id !== squareId && view.getSquareOwner(id) === againstPlayerId;
            })) {
                blockingScore += 45;
            }
        }

        return blockingScore;
    }

    // Evaluates tempo: speed of achieving developed monopolies (especially 3 houses) relative to opponents.
    function tempoScore(p, ownership) {
        if (!p) {
            return 0;
        }
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var maxTempo = 0;
        var seenGroups = Object.create(null);

        for (var i of squareIds) {
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (!s || sGroupIds.length < 2 || !s.rules.houseCost || s.rules.houseCost <= 0) {
                continue;
            }
            var gKey = sGroupIds.join(',');
            if (seenGroups[gKey]) {
                continue;
            }
            seenGroups[gKey] = true;

            var ownedCount = 0;
            for (var g = 0; g < sGroupIds.length; g++) {
                var owner = propertyOwner(sGroupIds[g], ownership, p);
                if (owner === p.playerId) {
                    ownedCount++;
                }
            }

            if (ownedCount === sGroupIds.length) {
                var minHouses = 5;
                for (var h = 0; h < sGroupIds.length; h++) {
                    minHouses = Math.min(minHouses, view.getSquareState(sGroupIds[h]).house || 0);
                }
                var tempoBase = minHouses >= 3 ? 80 : (minHouses * 25 + 20);
                maxTempo = Math.max(maxTempo, tempoBase);
            } else if (ownedCount === sGroupIds.length - 1) {
                maxTempo = Math.max(maxTempo, 25);
            }
        }

        return maxTempo;
    }

    AIGen5.Valuation = {
        propertyOwner: propertyOwner,
        groupScore: groupScore,
        groupScoreById: groupScore,
        assetValue: assetValue,
        houseBuildFeasibility: houseBuildFeasibility,
        expectedRent: baseRent,
        rentById: baseRent,
        expectedRentValue: expectedRentValue,
        opponentThreatScore: opponentThreatScore,
        evaluateProperty: evaluateProperty,
        groupOwnershipSummary: groupOwnershipSummary,
        strategicBlockingValue: strategicBlockingValue,
        tempoScore: tempoScore
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Valuation;
    }
})(typeof window !== 'undefined' ? window : globalThis);
