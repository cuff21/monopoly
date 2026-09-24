// Gen5 AI: opponent strength ranking and monopoly-risk analytics.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isPlayerActive(p) {
        return !!p && (p.money >= 0 || p.creditor === -1);
    }

    function getActivePlayers() {
        if (typeof globalThis.player === 'undefined') {
            return [];
        }
        var active = [];
        for (var i = 1; i < globalThis.player.length; i++) {
            if (isPlayerActive(globalThis.player[i])) {
                active.push(globalThis.player[i]);
            }
        }
        return active;
    }

    function getPlayerByIndex(index) {
        if (typeof globalThis.player === 'undefined') {
            return null;
        }
        return globalThis.player[index] || null;
    }

    // Approximate liquidation value of cash + properties + houses, used only for relative ranking between players.
    function netWorth(p) {
        if (!p) {
            return 0;
        }
        var total = p.money || 0;
        if (typeof globalThis.square === 'undefined') {
            return total;
        }
        for (var i = 0; i < 40; i++) {
            var s = globalThis.square[i];
            if (!s || s.owner !== p.index) {
                continue;
            }
            total += (s.price || 0) * (s.mortgage ? 0.5 : 1) * 0.6;
            var houseCount = s.hotel ? 5 : (s.house || 0);
            total += houseCount * (s.houseprice || 0) * 0.5;
        }
        return total;
    }

    // Classifies a player's relative position among active players: 'Leader', 'Contender', 'Weak', or 'NearBankrupt'.
    function strengthRank(p) {
        var players = getActivePlayers();
        if (!p || players.length === 0) {
            return 'Contender';
        }

        var worths = players.map(netWorth);
        var target = netWorth(p);
        var max = Math.max.apply(null, worths);
        var sum = worths.reduce(function(a, b) { return a + b; }, 0);
        var avg = sum / worths.length;

        if ((p.money || 0) < 100 && target <= avg * 0.4) {
            return 'NearBankrupt';
        }
        if (max > 0 && target >= max * 0.85) {
            return 'Leader';
        }
        if (target <= avg * 0.5) {
            return 'Weak';
        }
        return 'Contender';
    }

    // Estimates how dangerous it would be for `forPlayerIndex` to complete the color group containing `squareIndex`,
    // combining their ability to afford houses with how often opponents are likely to land on that group.
    function monopolyRisk(squareIndex, forPlayerIndex) {
        if (typeof globalThis.square === 'undefined') {
            return 0;
        }
        var s = globalThis.square[squareIndex];
        if (!s || !s.group || s.group.length === 0) {
            return 0;
        }

        var forPlayer = getPlayerByIndex(forPlayerIndex);
        var houseBudget = (s.houseprice || 100) * 6;
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility() : 1;
        var affordability = forPlayer ? clamp((forPlayer.money || 0) / houseBudget, 0, 1.5) * buildFeasibility : 0.5;

        var traffic = 0;
        if (AIGen5.Probability) {
            for (var i = 0; i < s.group.length; i++) {
                traffic += AIGen5.Probability.aggregateBoardThreat(s.group[i], forPlayerIndex, 2);
            }
            traffic = traffic / s.group.length;
        }

        return affordability * (0.5 + traffic);
    }

    AIGen5.Analytics = {
        netWorth: netWorth,
        strengthRank: strengthRank,
        monopolyRisk: monopolyRisk,
        getActivePlayers: getActivePlayers,
        getPlayerByIndex: getPlayerByIndex
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Analytics;
    }
})(typeof window !== 'undefined' ? window : globalThis);
