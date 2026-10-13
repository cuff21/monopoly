/**
 * Held-out policy evaluation against fixed Gen5 and Strategic AI baselines.
 */
(function(global) {
    'use strict';

    var SimModule = (typeof module !== 'undefined' && module.exports) ? require('../../../simulation/match-runner') : global.SimModule;
    if (typeof module !== 'undefined' && module.exports) require('../../simulation-adapters');
    var SimBoard = SimModule.SimBoard;
    var GameRandom = (typeof module !== 'undefined' && module.exports) ? require('../../../core/random') : global.GameRandom;
    var Genotype = (typeof module !== 'undefined' && module.exports)
        ? require('../neat/genotype').Genotype
        : global.NEATGenotype.Genotype;

    var DEFAULT_BASELINES = [
        { kind: 'baseline', ai: 'gen5', profile: 'Tactician' },
        { kind: 'baseline', ai: 'strategic', profile: 'Balanced' },
        { kind: 'baseline', ai: 'strategic', profile: 'Aggressive' },
        { kind: 'baseline', ai: 'strategic', profile: 'Defensive' }
    ];

    function average(values) {
        return values.reduce(function(total, value) { return total + value; }, 0) / values.length;
    }

    function confidenceInterval(values) {
        if (values.length < 2) return 0;
        var mean = average(values);
        var variance = values.reduce(function(total, value) {
            return total + Math.pow(value - mean, 2);
        }, 0) / (values.length - 1);
        return 1.96 * Math.sqrt(variance / values.length);
    }

    function PolicyEvaluator(options) {
        options = options || {};
        this.games = options.games || 32;
        this.turnsPerGame = options.turnsPerGame || 100;
        this.editions = options.editions || null;
        this.playerCounts = options.playerCounts || [4, 5, 6, 7, 8];
        this.baselines = options.baselines || DEFAULT_BASELINES;
        this.requiredImprovement = options.requiredImprovement === undefined ? 5 : options.requiredImprovement;
        this.matchRunner = options.matchRunner || null;
        this.seed = Number.isInteger(options.seed) ? options.seed >>> 0 : null;
        this.random = options.random || GameRandom.create(this.seed === null ? GameRandom.freshSeed() : this.seed);
        this.cancelled = false;
    }

    PolicyEvaluator.prototype.cancel = function() {
        this.cancelled = true;
    };

    PolicyEvaluator.prototype.evaluate = async function(genome, progressCallback) {
        if (!genome || !Array.isArray(genome.vertices) || !Array.isArray(genome.edges)) {
            throw new TypeError('Policy evaluation requires a Gen6 genotype.');
        }
        if (!Number.isInteger(this.games) || this.games < 2) {
            throw new RangeError('Policy evaluation requires at least two held-out games.');
        }

        var availableEditions = this.editions || (global.Monopoly && global.Monopoly.Editions
            ? global.Monopoly.Editions.getNames()
            : ['Classic']);
        if (!availableEditions.length || !this.playerCounts.length || !this.baselines.length) {
            throw new Error('Policy evaluation requires editions, player counts, and baseline policies.');
        }

        var gameDeltas = [];
        var candidateScores = [];
        var baselineScores = [];
        var baselineWins = 0;
        var seed = this.seed === null ? GameRandom.freshSeed() : this.seed;
        var seeds = new Set();

        for (var gameIndex = 0; gameIndex < this.games; gameIndex++) {
            if (this.cancelled) throw new Error('Policy evaluation cancelled.');
            var playerCount = this.playerCounts[Math.floor(this.random() * this.playerCounts.length)];
            var edition = availableEditions[Math.floor(this.random() * availableEditions.length)];
            var candidateSeat = Math.floor(this.random() * playerCount);
            var lineup = [];
            var baselineSeats = [];

            for (var seat = 0; seat < playerCount; seat++) {
                if (seat === candidateSeat) {
                    lineup.push({ kind: 'gen6', genotype: genome });
                } else {
                    var baseline = this.baselines[baselineSeats.length % this.baselines.length];
                    baselineSeats.push(seat);
                    lineup.push(baseline);
                }
            }

            var matchSeed = GameRandom.deriveSeed(seed, gameIndex + 1, 'validation');
            while (seeds.has(matchSeed)) matchSeed = GameRandom.domainSeed(matchSeed + 1, 'validation');
            seeds.add(matchSeed);
            var setup = { edition: edition, playerCount: playerCount, seed: matchSeed };
            var results = this.matchRunner
                ? await this.matchRunner(lineup, this.turnsPerGame, setup)
                : await new SimBoard(lineup, this.turnsPerGame, setup).run();
            var rankByPlayer = new Map();
            results.forEach(function(result, rank) {
                rankByPlayer.set(result.playerIndex, rank);
            });

            var candidateRank = rankByPlayer.get(candidateSeat);
            if (candidateRank === undefined) {
                throw new Error('Held-out match omitted the Gen6 candidate result.');
            }

            function scoreForRank(rank) {
                return playerCount <= 1 ? 1 : (playerCount - 1 - rank) / (playerCount - 1);
            }

            var candidateScore = scoreForRank(candidateRank);
            var gameBaselineScores = [];
            rankByPlayer.forEach(function(rank, playerIndex) {
                if (playerIndex !== candidateSeat && playerIndex < playerCount) {
                    gameBaselineScores.push(scoreForRank(rank));
                }
            });
            if (gameBaselineScores.length === 0) {
                throw new Error('Held-out match did not include any baseline results.');
            }

            var baselineScore = average(gameBaselineScores);
            candidateScores.push(candidateScore);
            baselineScores.push(baselineScore);
            gameDeltas.push(candidateScore - baselineScore);
            if (candidateScore > baselineScore) baselineWins++;

            if (progressCallback) {
                progressCallback({
                    gamesCompleted: gameIndex + 1,
                    gamesRequested: this.games,
                    edition: edition,
                    playerCount: playerCount
                });
            }
        }

        var meanImprovement = average(gameDeltas) * 100;
        var confidenceMargin = confidenceInterval(gameDeltas) * 100;
        var lowerConfidenceBound = meanImprovement - confidenceMargin;

        return {
            games: this.games,
            turnsPerGame: this.turnsPerGame,
            meanCandidateRankScore: average(candidateScores),
            meanBaselineRankScore: average(baselineScores),
            improvementPercentagePoints: meanImprovement,
            lower95ConfidenceBound: lowerConfidenceBound,
            candidateOutperformedBaselineGames: baselineWins,
            requiredImprovement: this.requiredImprovement,
            passed: lowerConfidenceBound >= this.requiredImprovement
        };
    };

    PolicyEvaluator.DEFAULT_BASELINES = DEFAULT_BASELINES;

    if (typeof module !== 'undefined' && module.exports) module.exports = PolicyEvaluator;
    global.Gen6PolicyEvaluator = PolicyEvaluator;
})(typeof window !== 'undefined' ? window : globalThis);
