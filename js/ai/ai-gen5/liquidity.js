// Gen5 AI: dynamic cash reserve, recomputed every call from the AI's own near-term rent exposure.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    var AVERAGE_CARD_PAYMENT_BUFFER = 25;

    // Reserve is not cached: it reflects the current board state and player position every time it's asked for.
    function computeReserve(p, profile) {
        if (!p) {
            return 120;
        }

        var base = Math.max(120, (p.money || 0) * (profile && profile.liquidityFloor || 0.12));
        var ownExposure = 0;
        var square = globalThis.square;

        if (square && p.position !== undefined) {
            var rolls = AIGen5.Probability ? AIGen5.Probability.turnsToRolls(1) : 1;
            for (var i = 0; i < 40; i++) {
                var s = square[i];
                if (!s || s.owner === 0 || s.owner === p.index || s.mortgage) {
                    continue;
                }
                var landProbability = AIGen5.Probability ? AIGen5.Probability.landingProbability(p.position, i, rolls) : 0;
                if (landProbability <= 0) {
                    continue;
                }
                var rent = AIGen5.Valuation ? AIGen5.Valuation.expectedRent(i, s.owner, null) : (s.baserent || 0);
                ownExposure += landProbability * rent;
            }
        }

        // Doubles grant an extra roll, compounding this same rent exposure again with some probability.
        var doublesBuffer = ownExposure * (AIGen5.Probability ? AIGen5.Probability.jailEscapeProbability() : (1 / 6));

        return base + ownExposure + doublesBuffer + AVERAGE_CARD_PAYMENT_BUFFER;
    }

    AIGen5.Liquidity = {
        computeReserve: computeReserve
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Liquidity;
    }
})(typeof window !== 'undefined' ? window : globalThis);
