// Gen5 AI: dice-roll and board-landing probability engine.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    AIGen5.getGameState = function(subject) {
        if (subject && subject.game && subject.game.state) return subject.game.state;
        if (subject && subject.state) return subject.state;
        return subject && subject.board && subject.squareStateById ? subject : null;
    };
    AIGen5.getDecisionView = function(subject) {
        if (subject && typeof subject.getSquare === 'function' && typeof subject.getSquareState === 'function') return subject;
        if (subject && subject.game && subject.game.decisionView) return subject.game.decisionView;
        if (subject && subject.decisionView) return subject.decisionView;
        var state = AIGen5.getGameState(subject);
        return global.GameStateContext.getDecisionView(state);
    };
    AIGen5.getPlayers = function(subject) {
        return AIGen5.getDecisionView(subject).getPlayers();
    };
    AIGen5.groupIds = function(view, definition) {
        return definition.groupId ? view.getGroupSquareIds(definition.groupId) : [];
    };
    AIGen5.tradeProperty = function(trade, squareId) {
        return trade.getOfferedSquareIds().includes(squareId) ? 1 : trade.getRequestedSquareIds().includes(squareId) ? -1 : 0;
    };
    AIGen5.counterTrade = function(trade, money, property) {
        var ids = Object.keys(property);
        return new global.Trade(trade.getInitiator(), trade.getRecipient(), Math.round(money),
            ids.filter(function(id) { return property[id] > 0; }),
            ids.filter(function(id) { return property[id] < 0; }), trade.getHeldCards());
    };

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
        return !!p && (p.money >= 0 || p.creditor === null);
    }

    function getActivePlayers(subject) {
        var players = AIGen5.getPlayers(subject);
        var active = [];
        for (var i = 0; i < players.length; i++) {
            if (isPlayerActive(players[i])) {
                active.push(players[i]);
            }
        }
        return active;
    }

    // Probability of landing exactly on targetSquareId at least once within `rolls` single dice rolls from fromSquareId.
    function landingProbability(fromSquareId, targetSquareId, rolls, subject) {
        if (fromSquareId === undefined || targetSquareId === undefined) {
            return 0;
        }
        rolls = Math.max(1, Math.round(rolls || 1));

        var board = AIGen5.getDecisionView(subject).board;
        global.getSquare(board, fromSquareId);
        global.getSquare(board, targetSquareId);
        var dist = Object.create(null);
        dist[fromSquareId] = 1;
        var landedProbability = 0;

        for (var r = 0; r < rolls; r++) {
            var nextDist = Object.create(null);
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
                    var newPos = global.walk(board, pos, sum);
                    var moved = mass * weight;
                    if (newPos === targetSquareId) {
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

    // Sums landing probability across all active opponents (or all active players if excludePlayerId is omitted).
    function aggregateBoardThreat(targetSquareId, excludePlayerId, turnsAhead, subject) {
        var rolls = turnsToRolls(turnsAhead);
        var total = 0;
        var players = getActivePlayers(subject);
        for (var i = 0; i < players.length; i++) {
            var opponent = players[i];
            if (opponent.playerId === excludePlayerId || opponent.squareId === undefined || opponent.jail) {
                continue;
            }
            total += landingProbability(opponent.squareId, targetSquareId, rolls, subject);
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
