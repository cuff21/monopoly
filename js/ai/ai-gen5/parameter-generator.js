// Gen5 AI: evolves numeric decision thresholds via the same win/loss history mechanism as ai-genetic.js,
// but keeps its own localStorage-tagged pool (type: 'gen5') so the two schemas never mix.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function localNormal(m, sd) {
        var u = 0, v = 0;
        while (u === 0) { u = Math.random(); }
        while (v === 0) { v = Math.random(); }
        var val = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return val * (sd || 1) + (m || 0);
    }

    function gaussian(m, sd) {
        return typeof global.normal === 'function' ? global.normal(m, sd) : localNormal(m, sd);
    }

    var PARAM_SPEC = {
        reserveSafetyMargin: { mean: 1.15, sd: 0.15, min: 1.0, max: 2.0 },
        batchBuildMinROI: { mean: 0.22, sd: 0.06, min: 0.05, max: 0.6 },
        unmortgageROIThreshold: { mean: 0.12, sd: 0.04, min: 0.02, max: 0.4 },
        tradeReofferWealthDeltaPct: { mean: 0.2, sd: 0.05, min: 0.05, max: 0.6 },
        tradeReofferTurnGap: { mean: 8, sd: 2, min: 2, max: 20, integer: true },
        auctionBlockPremium: { mean: 1.3, sd: 0.2, min: 1.0, max: 2.0 }
    };

    function clampParam(value, spec) {
        var clamped = Math.max(spec.min, Math.min(spec.max, value));
        return spec.integer ? Math.round(clamped) : clamped;
    }

    function generate() {
        var params = {};
        for (var name in PARAM_SPEC) {
            params[name] = gaussian(PARAM_SPEC[name].mean, PARAM_SPEC[name].sd);
        }

        var gameHistory = global.GameStorage.getHistory();
        var winningPlayers = [];
        for (var g = 0; g < gameHistory.length; g++) {
            var gamePlayers = gameHistory[g];
            if (!Array.isArray(gamePlayers)) {
                continue;
            }
            for (var i = 0; i < gamePlayers.length; i++) {
                if (gamePlayers[i] && gamePlayers[i].params && gamePlayers[i].result === 'win' && gamePlayers[i].type === 'gen5') {
                    winningPlayers.push(gamePlayers[i].params);
                }
            }
        }

        if (Math.random() < 0.8 && winningPlayers.length > 1) {
            var means = {};
            var sds = {};
            for (var name1 in PARAM_SPEC) {
                means[name1] = 0;
                sds[name1] = 0;
            }
            for (var w = 0; w < winningPlayers.length; w++) {
                for (var name2 in PARAM_SPEC) {
                    if (winningPlayers[w][name2] !== undefined) {
                        means[name2] += winningPlayers[w][name2] / winningPlayers.length;
                    }
                }
            }
            for (var w2 = 0; w2 < winningPlayers.length; w2++) {
                for (var name3 in PARAM_SPEC) {
                    if (winningPlayers[w2][name3] !== undefined) {
                        sds[name3] += Math.pow(winningPlayers[w2][name3] - means[name3], 2) / winningPlayers.length;
                    }
                }
            }
            for (var name4 in PARAM_SPEC) {
                params[name4] = gaussian(means[name4], Math.sqrt(sds[name4]) || PARAM_SPEC[name4].sd);
            }
        }

        for (var name5 in PARAM_SPEC) {
            params[name5] = clampParam(params[name5], PARAM_SPEC[name5]);
        }

        return params;
    }

    AIGen5.ParameterGenerator = {
        generate: generate,
        PARAM_SPEC: PARAM_SPEC
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.ParameterGenerator;
    }
})(typeof window !== 'undefined' ? window : globalThis);
