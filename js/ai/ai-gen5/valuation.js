// Gen5 AI: property and group valuation, replacing static distance heuristics with real landing probability.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function propertyOwner(index, ownership) {
        if (ownership && ownership[index] !== undefined) {
            return ownership[index];
        }
        return globalThis.square[index].owner;
    }

    function groupScore(index, ownerIndex, ownership) {
        var square = globalThis.square;
        var s = square[index];
        if (!s || typeof s.group === 'undefined' || !s.group || s.group.length === 0) {
            return 0;
        }

        var owned = 0;
        var open = 0;
        var total = s.group.length;

        for (var i = 0; i < total; i++) {
            var owner = propertyOwner(s.group[i], ownership);
            if (owner === ownerIndex) {
                owned++;
            } else if (owner === 0) {
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

    // Discounts future house-building value as the shared 32-house bank runs dry, since a completed
    // monopoly is worth less if there's little chance of actually developing it any time soon.
    function houseBuildFeasibility() {
        if (typeof getHouseHotelSupply !== 'function') {
            return 1;
        }
        return clamp(getHouseHotelSupply().housesAvailable / 10, 0.2, 1);
    }

    function assetValue(index, ownerIndex, ownership) {
        var s = globalThis.square[index];
        if (!s) {
            return 0;
        }

        var buildFeasibility = houseBuildFeasibility();
        var value = s.price * (s.mortgage ? 0.5 : 1) * 0.65;
        value += (s.baserent || 0) * 3;
        value += (s.houseprice || 0) * 0.5 * buildFeasibility;
        value += groupScore(index, ownerIndex, ownership) * 2;

        if (s.group && s.group.length > 0 && groupScore(index, ownerIndex, ownership) >= 80) {
            value += s.houseprice * 2 * buildFeasibility;
        }

        return value;
    }

    function baseRent(index, ownerIndex, ownership) {
        var square = globalThis.square;
        var s = square[index];
        if (!s || s.price === 0) {
            return 0;
        }

        if (index === 5 || index === 15 || index === 25 || index === 35) {
            var railroadCount = 0;
            [5, 15, 25, 35].forEach(function(railroad) {
                if (propertyOwner(railroad, ownership) === ownerIndex) {
                    railroadCount++;
                }
            });
            return [0, 25, 50, 100, 200][railroadCount];
        }

        if (index === 12 || index === 28) {
            var utilityCount = (propertyOwner(12, ownership) === ownerIndex ? 1 : 0) + (propertyOwner(28, ownership) === ownerIndex ? 1 : 0);
            return (s.baserent || 4) * (utilityCount === 2 ? 2.5 : utilityCount === 1 ? 1 : 0);
        }

        var rent = s.house > 0 ? (s['rent' + Math.min(s.house, 5)] !== undefined ? s['rent' + Math.min(s.house, 5)] : (s.baserent || 10) * Math.pow(2, s.house)) : (s.baserent || 0);
        if (s.group && s.group.length > 0 && groupScore(index, ownerIndex, ownership) >= 80 && s.house === 0) {
            rent *= 2;
        }
        return Number.isFinite(rent) ? rent : 0;
    }

    // Rent weighted by the real probability that any active opponent lands on this square within `turnsAhead` turns.
    function expectedRentValue(index, ownerIndex, ownership, turnsAhead) {
        var rent = baseRent(index, ownerIndex, ownership);
        if (rent <= 0) {
            return 0;
        }
        if (!AIGen5.Probability) {
            return rent;
        }
        var threat = AIGen5.Probability.aggregateBoardThreat(index, ownerIndex, turnsAhead || 2);
        return rent * (0.5 + threat);
    }

    function opponentThreatScore(index, ownerIndex) {
        var square = globalThis.square;
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
            var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(Number(ownerKey)) : null;
            var cashMultiplier = opponent && opponent.money !== undefined ? clamp(0.8 + opponent.money / 3000, 0.8, 1.2) : 1;
            var rank = opponent && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponent) : 'Contender';
            var rankMultiplier = rank === 'Leader' ? 1.3 : rank === 'Weak' || rank === 'NearBankrupt' ? 0.6 : 1;

            if (owned === s.group.length - 1 && s.owner === 0) {
                strongestThreat = Math.max(strongestThreat, (70 + s.price * 0.12) * cashMultiplier * rankMultiplier);
            } else if (owned > 0) {
                strongestThreat = Math.max(strongestThreat, owned * 12 * cashMultiplier * rankMultiplier);
            }
        }

        return strongestThreat;
    }

    function evaluateProperty(index, ownerIndex, cashOnHand, profile, endgamePressure) {
        var square = globalThis.square;
        var s = square[index];
        if (!s || s.price === 0 || s.owner !== 0) {
            return -Infinity;
        }

        var score = 0;
        score += s.price * 0.18;
        score += (s.baserent || 0) * 1.1;
        score += (s.houseprice || 0) * 0.12 * houseBuildFeasibility();

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

        score += groupScore(index, ownerIndex);
        score += expectedRentValue(index, ownerIndex, null, 2) * 0.8;
        score += opponentThreatScore(index, ownerIndex) * (profile.endgameBias || 1);
        score *= (profile.riskTolerance || 0.6) > 0.7 ? 1.08 : 1;
        score += (endgamePressure || 0) * 12 * (profile.endgameBias || 1);

        if (cashOnHand < s.price + 250) {
            score -= 10 * (1 / Math.max(0.25, profile.riskTolerance || 0.6));
        }
        if (cashOnHand < s.price + 100) {
            score -= 25 * (1.2 - (profile.riskTolerance || 0.6));
        }

        return score;
    }

    function groupOwnershipSummary(ownerIndex) {
        var square = globalThis.square;
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
                summary.push({ index: i, size: total, owned: owned, score: owned / total });
            }
        }
        return summary;
    }

    // Evaluates strategic blocking leverage of a square:
    // blocks color monopoly completion, railroad clusters (3rd/4th railroad), or utility pairs.
    function strategicBlockingValue(index, forPlayerIndex, againstPlayerIndex) {
        var square = globalThis.square;
        if (!square) {
            return 0;
        }
        var s = square[index];
        if (!s || !s.group) {
            return 0;
        }
        var blockingScore = 0;

        // 1. Color group monopoly blocking:
        if (s.houseprice > 0 && s.group.length >= 2) {
            var againstOwned = 0;
            for (var i = 0; i < s.group.length; i++) {
                var member = square[s.group[i]];
                if (member && member.owner === againstPlayerIndex) {
                    againstOwned++;
                }
            }
            if (againstOwned === s.group.length - 1) {
                var oppPlayer = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(againstPlayerIndex) : null;
                var rank = oppPlayer && AIGen5.Analytics ? AIGen5.Analytics.strengthRank(oppPlayer) : 'Contender';
                var rankMult = rank === 'Leader' ? 2.0 : (rank === 'NearBankrupt' ? 0.7 : 1.2);
                blockingScore += ((s.price || 0) * 0.8 + (s.houseprice || 100) * 1.5) * rankMult;
            } else if (againstOwned > 0) {
                blockingScore += againstOwned * 20;
            }
        }

        // 2. Railroad lane blocking (5, 15, 25, 35):
        if (index === 5 || index === 15 || index === 25 || index === 35) {
            var rrOwned = 0;
            [5, 15, 25, 35].forEach(function(rr) {
                if (square[rr] && square[rr].owner === againstPlayerIndex) {
                    rrOwned++;
                }
            });
            if (rrOwned >= 2) {
                blockingScore += (rrOwned === 3 ? 90 : 50);
            }
        }

        // 3. Utility blocking (12, 28):
        if (index === 12 || index === 28) {
            var otherUtil = index === 12 ? 28 : 12;
            if (square[otherUtil] && square[otherUtil].owner === againstPlayerIndex) {
                blockingScore += 45;
            }
        }

        return blockingScore;
    }

    // Evaluates tempo: speed of achieving developed monopolies (especially 3 houses) relative to opponents.
    function tempoScore(p, ownership) {
        if (!p || typeof globalThis.square === 'undefined') {
            return 0;
        }
        var square = globalThis.square;
        var maxTempo = 0;
        var seenGroups = {};

        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (!s || !s.group || s.group.length < 2 || !s.houseprice || s.houseprice <= 0) {
                continue;
            }
            var gKey = s.group.join(',');
            if (seenGroups[gKey]) {
                continue;
            }
            seenGroups[gKey] = true;

            var ownedCount = 0;
            for (var g = 0; g < s.group.length; g++) {
                var owner = propertyOwner(s.group[g], ownership);
                if (owner === p.index) {
                    ownedCount++;
                }
            }

            if (ownedCount === s.group.length) {
                var minHouses = 5;
                for (var h = 0; h < s.group.length; h++) {
                    minHouses = Math.min(minHouses, square[s.group[h]].house || 0);
                }
                var tempoBase = minHouses >= 3 ? 80 : (minHouses * 25 + 20);
                maxTempo = Math.max(maxTempo, tempoBase);
            } else if (ownedCount === s.group.length - 1) {
                maxTempo = Math.max(maxTempo, 25);
            }
        }

        return maxTempo;
    }

    AIGen5.Valuation = {
        propertyOwner: propertyOwner,
        groupScore: groupScore,
        assetValue: assetValue,
        houseBuildFeasibility: houseBuildFeasibility,
        expectedRent: baseRent,
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
