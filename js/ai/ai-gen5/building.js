// Gen5 AI: house/hotel purchase planning, gated by the dynamic liquidity reserve.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Finds the single best-ROI house purchase across all of the player's completed groups, skipping any
    // tile that would need a house/hotel the shared bank (32 houses, 12 hotels) doesn't have left.
    function findBestCandidate(p, profile, completedGroupTiles, supply) {
        var square = globalThis.square;
        var bestCandidate = null;
        var bestROI = -Infinity;

        // Risk-tolerant profiles (gamblers) hold off on low-threat builds (low patience baseline) but
        // weight incoming threat much more heavily, so they go "all in" once a payoff looks likely.
        var riskTolerance = profile.riskTolerance || 0.6;
        var patience = clamp(1 - riskTolerance, 0.15, 0.6);
        var threatMultiplier = 1 + riskTolerance;

        for (var g = 0; g < completedGroupTiles.length; g++) {
            var groupTiles = completedGroupTiles[g];
            var minHouseLevel = 5;
            for (var t = 0; t < groupTiles.length; t++) {
                var levelTile = square[groupTiles[t]];
                if (levelTile && levelTile.house < minHouseLevel) {
                    minHouseLevel = levelTile.house;
                }
            }

            for (var j = 0; j < groupTiles.length; j++) {
                var tile = square[groupTiles[j]];
                if (!tile || tile.owner !== p.index || tile.house !== minHouseLevel || tile.house >= 5 || tile.hotel === 1 || tile.houseprice <= 0) {
                    continue;
                }
                if (supply && ((tile.house < 4 && supply.housesAvailable <= 0) || (tile.house === 4 && supply.hotelsAvailable <= 0))) {
                    continue;
                }
                var currentRent = tile.house === 0 ? tile.baserent : tile['rent' + tile.house];
                var nextRent = tile.house === 4 ? tile.rent5 : tile['rent' + (tile.house + 1)];
                var rentGain = Math.max(0, (nextRent || currentRent || 0) - (currentRent || 0));
                var threat = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupTiles[j], p.index, 2) : 0;
                var roi = (rentGain / tile.houseprice) * (patience + threat * threatMultiplier) * (profile.houseBias || 1);
                if (roi > bestROI) {
                    bestROI = roi;
                    bestCandidate = tile;
                }
            }
        }

        return { candidate: bestCandidate, roi: bestROI };
    }

    // Buys houses across completed groups while marginal ROI stays worthwhile and the reserve stays safe.
    // Each step re-evaluates ROI across ALL completed groups (not just board order) so the highest-threat
    // group is always funded first, then re-scans after every purchase to chain into a multi-house buy.
    function plan(p, profile, params) {
        params = params || {};
        var minROI = params.batchBuildMinROI || 0.2;
        var safetyMargin = params.reserveSafetyMargin || 1.15;
        var square = globalThis.square;
        var groups = AIGen5.Valuation ? AIGen5.Valuation.groupOwnershipSummary(p.index) : [];
        var purchased = [];

        var seenGroupStarts = {};
        var completedGroupTiles = [];
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            if (group.owned !== group.size || group.size < 2) {
                continue;
            }
            var groupTiles = square[group.index].group || [];
            var groupKey = groupTiles.slice().sort().join(',');
            if (seenGroupStarts[groupKey]) {
                continue;
            }
            seenGroupStarts[groupKey] = true;
            completedGroupTiles.push(groupTiles);
        }

        var guard = 0;
        while (guard++ < 40) {
            var supply = typeof getHouseHotelSupply === 'function' ? getHouseHotelSupply() : null;
            var best = findBestCandidate(p, profile, completedGroupTiles, supply);
            if (!best.candidate || best.roi < minROI) {
                break;
            }

            var reserve = (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120) * safetyMargin;
            if (p.money - best.candidate.houseprice < reserve) {
                break;
            }

            // buyHouse re-checks the bank itself; treat a false/undefined result as "can't build" and stop
            // instead of re-selecting the same denied candidate on every remaining guard iteration.
            if (typeof buyHouse === 'function') {
                if (buyHouse(best.candidate.index) === false) {
                    break;
                }
            }
            purchased.push(best.candidate.index);
        }

        return purchased;
    }

    AIGen5.Building = {
        plan: plan
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Building;
    }
})(typeof window !== 'undefined' ? window : globalThis);
