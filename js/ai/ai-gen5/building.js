// Gen5 AI: house/hotel purchase planning, gated by the dynamic liquidity reserve.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // Finds the single best-ROI house purchase across all of the player's completed groups, skipping any
    // tile that would need a house/hotel the shared bank (32 houses, 12 hotels) doesn't have left.
    function findBestCandidate(p, profile, completedGroupTiles, supply) {
        var view = AIGen5.getDecisionView(p);
        var gameState = AIGen5.getGameState(p);
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
                var levelTile = view.getSquare(groupTiles[t]);
                if (levelTile && view.getSquareState(levelTile.id).house < minHouseLevel) {
                    minHouseLevel = view.getSquareState(levelTile.id).house;
                }
            }

            for (var j = 0; j < groupTiles.length; j++) {
                var tile = view.getSquare(groupTiles[j]);
                var tileState = view.getSquareState(tile.id);
                if (tileState.ownerId !== p.playerId || tileState.house !== minHouseLevel || tileState.house >= 5 || tileState.hotel === 1 || tile.rules.houseCost <= 0) {
                    continue;
                }
                if (supply && ((tileState.house < 4 && supply.housesAvailable <= 0) || (tileState.house === 4 && supply.hotelsAvailable <= 0))) {
                    continue;
                }
                var currentRent = tileState.house === 0 ? tile.rules.baseRent : tile.rules.rentTiers[tileState.house - 1];
                var nextRent = tile.rules.rentTiers[tileState.house];
                var rentGain = Math.max(0, (nextRent || currentRent || 0) - (currentRent || 0));
                var threat = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupTiles[j], p.playerId, 2, gameState) : 0;
                var roi = (rentGain / tile.rules.houseCost) * (patience + threat * threatMultiplier) * (profile.houseBias || 1);
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
    function* plan(p, profile, params) {
        params = params || {};
        var minROI = params.batchBuildMinROI || 0.2;
        var safetyMargin = params.reserveSafetyMargin || 1.15;
        var view = AIGen5.getDecisionView(p);
        var groups = AIGen5.Valuation ? AIGen5.Valuation.groupOwnershipSummary(p.playerId, p) : [];
        var purchased = [];

        var seenGroupStarts = Object.create(null);
        var completedGroupTiles = [];
        for (var g = 0; g < groups.length; g++) {
            var group = groups[g];
            if (group.owned !== group.size || group.size < 2) {
                continue;
            }
            var groupTiles = AIGen5.groupIds(view, view.getSquare(group.squareId)) || [];
            var groupKey = groupTiles.slice().sort().join(',');
            if (seenGroupStarts[groupKey]) {
                continue;
            }
            seenGroupStarts[groupKey] = true;
            completedGroupTiles.push(groupTiles);
        }

        // Preserve the policy's per-turn purchase limit independently of board size.
        var guard = 0;
        while (guard++ < 40) {
            var supply = p.game && typeof p.game.getHouseHotelSupply === 'function' ? p.game.getHouseHotelSupply() : null;
            var best = findBestCandidate(p, profile, completedGroupTiles, supply);
            if (!best.candidate || best.roi < minROI) {
                break;
            }

            var reserve = (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120) * safetyMargin;
            if (p.money - best.candidate.rules.houseCost < reserve) {
                break;
            }

            // buyHouse re-checks the bank itself; treat a false/undefined result as "can't build" and stop
            // instead of re-selecting the same denied candidate on every remaining guard iteration.
            if ((yield [{ type: 'buyHouse', squareId: best.candidate.id }]) === false) break;
            purchased.push(best.candidate.id);
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
