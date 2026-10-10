// Gen5 AI: raising cash to cover debt with minimum collateral damage, and disciplined unmortgaging.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function buildDebtCandidates(p) {
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var candidates = [];

        for (var i of squareIds) {
            var s = view.getSquare(i);
            if (!s || view.getSquareState(s.id).ownerId !== p.playerId) {
                continue;
            }

            if (!view.getSquareState(s.id).mortgage && view.getSquareState(s.id).house === 0 && view.getSquareState(s.id).hotel !== 1) {
                var mortgageCash = Math.max(1, s.rules.mortgageValue);
                var mortgageDamage = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.playerId, null, 2, p) : (s.rules.baseRent || 0);
                candidates.push({ type: 'mortgage', squareId: i, cash: mortgageCash, damage: mortgageDamage });
            }

            if ((view.getSquareState(s.id).house > 0 || view.getSquareState(s.id).hotel === 1) && p.game && typeof p.game.canSellHouse === 'function' && p.game.canSellHouse(i)) {
                var saleCash = Math.max(1, Math.round((s.rules.houseCost || 0) * 0.5));
                var saleDamage = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.playerId, null, 1, p) : (s.rules.baseRent || 0);
                candidates.push({ type: 'sellHouse', squareId: i, cash: saleCash, damage: saleDamage });
            }
        }

        return candidates;
    }

    // Repeatedly performs whichever available action (mortgage or house sale) loses the least
    // probability-weighted rent value per dollar raised, instead of always selling houses first.
    function* resolveDebt(p) {
        var executed = [];
        var guard = 0;

        while (p.money < 0 && guard++ < 200) {
            var candidates = buildDebtCandidates(p);
            if (candidates.length === 0) {
                break;
            }
            candidates.sort(function(a, b) { return (a.damage / a.cash) - (b.damage / b.cash); });

            var actedThisRound = false;
            for (var i = 0; i < candidates.length; i++) {
                var candidate = candidates[i];
                var success = false;
                success = yield [{ type: candidate.type, squareId: candidate.squareId }];
                if (success) {
                    executed.push(candidate);
                    actedThisRound = true;
                    break;
                }
            }

            if (!actedThisRound) {
                break;
            }
        }

        return executed;
    }

    // Unmortgages in ROI order, but only while cash stays above the (safety-margin scaled) dynamic reserve.
    function* planUnmortgage(p, profile, params) {
        params = params || {};
        var roiThreshold = params.unmortgageROIThreshold || 0.12;
        var safetyMargin = params.reserveSafetyMargin || 1.15;
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var candidates = [];

        for (var i of squareIds) {
            var s = view.getSquare(i);
            if (!s || view.getSquareState(s.id).ownerId !== p.playerId || !view.getSquareState(s.id).mortgage) {
                continue;
            }
            var cost = Math.round((s.rules.purchasePrice || 0) * 0.55);
            var value = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.playerId, null, 2, p) : (s.rules.baseRent || 0);
            candidates.push({ squareId: i, cost: Math.max(1, cost), roi: value / Math.max(1, cost) });
        }
        candidates.sort(function(a, b) { return b.roi - a.roi; });

        var executed = [];
        for (var j = 0; j < candidates.length; j++) {
            var candidate = candidates[j];
            if (candidate.roi < roiThreshold) {
                continue;
            }
            var reserve = (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120) * safetyMargin;
            if (p.money - candidate.cost < reserve) {
                continue;
            }
            if (yield [{ type: 'unmortgage', squareId: candidate.squareId }]) {
                executed.push(candidate.squareId);
            }
        }

        return executed;
    }

    AIGen5.DebtManager = {
        resolveDebt: resolveDebt,
        planUnmortgage: planUnmortgage
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.DebtManager;
    }
})(typeof window !== 'undefined' ? window : globalThis);
