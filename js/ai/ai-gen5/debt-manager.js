// Gen5 AI: raising cash to cover debt with minimum collateral damage, and disciplined unmortgaging.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function buildDebtCandidates(p) {
        var square = globalThis.square;
        var candidates = [];

        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (!s || s.owner !== p.index) {
                continue;
            }

            if (!s.mortgage && s.house === 0 && s.hotel !== 1) {
                var mortgageCash = Math.max(1, Math.round((s.price || 0) * 0.5));
                var mortgageDamage = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.index, null, 2) : (s.baserent || 0);
                candidates.push({ type: 'mortgage', index: i, cash: mortgageCash, damage: mortgageDamage });
            }

            if ((s.house > 0 || s.hotel === 1) && typeof canSellHouse === 'function' && canSellHouse(i)) {
                var saleCash = Math.max(1, Math.round((s.houseprice || 0) * 0.5));
                var saleDamage = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.index, null, 1) : (s.baserent || 0);
                candidates.push({ type: 'sellHouse', index: i, cash: saleCash, damage: saleDamage });
            }
        }

        return candidates;
    }

    // Repeatedly performs whichever available action (mortgage or house sale) loses the least
    // probability-weighted rent value per dollar raised, instead of always selling houses first.
    function resolveDebt(p) {
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
                if (candidate.type === 'mortgage' && typeof mortgage === 'function') {
                    success = mortgage(candidate.index);
                } else if (candidate.type === 'sellHouse' && typeof sellHouse === 'function') {
                    success = sellHouse(candidate.index);
                }
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
    function planUnmortgage(p, profile, params) {
        params = params || {};
        var roiThreshold = params.unmortgageROIThreshold || 0.12;
        var safetyMargin = params.reserveSafetyMargin || 1.15;
        var square = globalThis.square;
        var candidates = [];

        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (!s || s.owner !== p.index || !s.mortgage) {
                continue;
            }
            var cost = Math.round((s.price || 0) * 0.55);
            var value = AIGen5.Valuation ? AIGen5.Valuation.expectedRentValue(i, p.index, null, 2) : (s.baserent || 0);
            candidates.push({ index: i, cost: Math.max(1, cost), roi: value / Math.max(1, cost) });
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
            if (typeof unmortgage === 'function' && unmortgage(candidate.index)) {
                executed.push(candidate.index);
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
