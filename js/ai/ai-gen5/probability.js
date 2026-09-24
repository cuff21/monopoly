// Gen5 AI: dice-roll and board-landing probability engine.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    var BOARD_SIZE = 40;
    // Doubles give an extra roll, but a 3rd consecutive double sends the player to jail instead of moving.
    var EXPECTED_ROLLS_PER_TURN = 1 + (1 / 6) + (1 / 36);
    var DOUBLE_PROBABILITY = 1 / 6;

    var SUM_WEIGHTS = {};
    for (var d1 = 1; d1 <= 6; d1++) {
        for (var d2 = 1; d2 <= 6; d2++) {
            var sum = d1 + d2;
            SUM_WEIGHTS[sum] = (SUM_WEIGHTS[sum] || 0) + 1;
        }
    }

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

    // Probability of landing exactly on targetIndex at least once within `rolls` single dice rolls from fromPosition.
    function landingProbability(fromPosition, targetIndex, rolls) {
        if (fromPosition === undefined || targetIndex === undefined) {
            return 0;
        }
        rolls = Math.max(1, Math.round(rolls || 1));

        var dist = {};
        dist[((fromPosition % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE] = 1;
        var landedProbability = 0;

        for (var r = 0; r < rolls; r++) {
            var nextDist = {};
            for (var pos in dist) {
                var mass = dist[pos];
                if (mass <= 0) {
                    continue;
                }
                for (var sum = 2; sum <= 12; sum++) {
                    var weight = SUM_WEIGHTS[sum] / 36;
                    if (!weight) {
                        continue;
                    }
                    var newPos = (Number(pos) + sum) % BOARD_SIZE;
                    var moved = mass * weight;
                    if (newPos === targetIndex) {
                        landedProbability += moved;
                    } else {
                        nextDist[newPos] = (nextDist[newPos] || 0) + moved;
                    }
                }
            }
            dist = nextDist;
        }

        return clamp(landedProbability, 0, 1);
    }

    // Converts a count of upcoming turns into an equivalent count of single dice rolls, approximating doubles chains.
    function turnsToRolls(turnsAhead) {
        return Math.max(1, Math.round((turnsAhead || 1) * EXPECTED_ROLLS_PER_TURN));
    }

    // Sums landing probability across all active opponents (or all active players if excludePlayerIndex is omitted).
    function aggregateBoardThreat(targetIndex, excludePlayerIndex, turnsAhead) {
        var rolls = turnsToRolls(turnsAhead);
        var total = 0;
        var players = getActivePlayers();
        for (var i = 0; i < players.length; i++) {
            var opponent = players[i];
            if (opponent.index === excludePlayerIndex || opponent.position === undefined || opponent.jail) {
                continue;
            }
            total += landingProbability(opponent.position, targetIndex, rolls);
        }
        return total;
    }

    function jailEscapeProbability() {
        return DOUBLE_PROBABILITY;
    }

    AIGen5.Probability = {
        landingProbability: landingProbability,
        aggregateBoardThreat: aggregateBoardThreat,
        turnsToRolls: turnsToRolls,
        jailEscapeProbability: jailEscapeProbability,
        getActivePlayers: getActivePlayers
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Probability;
    }
})(typeof window !== 'undefined' ? window : globalThis);
