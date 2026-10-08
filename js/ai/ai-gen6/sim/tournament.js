/**
 * Knockout Tournament for MonopolyNEAT Gen6 AI
 * Evaluates a 256-genome population in a 4-round bracket tournament.
 * 
 * Matches b2developer/MonopolyNEAT Tournament.cs:
 * - Round 1: 256 players in 64 matches -> 64 winners advance
 * - Round 2: 64 players in 16 matches -> 16 winners advance
 * - Round 3: 16 players in 4 matches -> 4 finalists advance
 * - Finals: 4 finalists in 1 match -> 1 Tournament Champion!
 * - Assigns fitness based on rounds survived and net worth.
 */
(function(global) {
    'use strict';

    var SimModule = (typeof module !== 'undefined' && module.exports) ? require('../../../simulation/match-runner') : global.SimModule;
    if (typeof module !== 'undefined' && module.exports) require('../../simulation-adapters');
    var SimBoard = SimModule.SimBoard;
    var DURATION_PENALTY_RATE = 0.5;

    function Tournament(population, turnsPerMatch, matchRunner, options) {
        this.population = population;
        this.turnsPerMatch = turnsPerMatch || 100;
        this.matchRunner = matchRunner || null;
        this.options = options || {};
        this.setup = null;
        this.cancelled = false;
        this.results = {
            rounds: [],
            champion: null,
            topScore: 0
        };
    }

    Tournament.prototype.cancel = function() {
        this.cancelled = true;
    };

    Tournament.prototype.selectSetup = function() {
        var editions = this.options.editions || (global.Monopoly && global.Monopoly.Editions
            ? global.Monopoly.Editions.getNames()
            : ['Classic']);
        var playerCounts = this.options.playerCounts || [2, 3, 4, 5, 6, 7, 8];
        var random = this.options.random || Math.random;
        var edition = this.options.edition || editions[Math.floor(random() * editions.length)];
        var playerCount = this.options.playerCount || playerCounts[Math.floor(random() * playerCounts.length)];

        if (!edition || !Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) {
            throw new Error('Tournament setup requires an edition and a player count from 2 to 8.');
        }
        if (global.Monopoly && global.Monopoly.Editions &&
            global.Monopoly.Editions.getNames().indexOf(edition) === -1) {
            throw new Error('Unknown tournament edition: ' + edition);
        }

        this.setup = { edition: edition, playerCount: playerCount };
        return this.setup;
    };

    /**
     * Executes the complete tournament across all species and genomes in the population.
     * Assigns fitness scores to all genomes.
     * 
     * @param {Function} [progressCallback] - Optional callback({ round, matchesCompleted, matchCount, edition, playerCount })
     * @returns {Promise<Object>} Tournament summary and champion genome
     */
    Tournament.prototype.run = async function(progressCallback) {
        var setup = this.setup || this.selectSetup();
        // Collect all genotypes from all species
        var contestants = [];
        for (var s = 0; s < this.population.species.length; s++) {
            var sp = this.population.species[s];
            for (var m = 0; m < sp.members.length; m++) {
                var g = sp.members[m];
                g.fitness = 0; // Reset fitness
                contestants.push(g);
            }
        }

        if (contestants.length === 0) {
            return this.results;
        }

        // Shuffle contestants randomly
        for (var i = contestants.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = contestants[i];
            contestants[i] = contestants[j];
            contestants[j] = temp;
        }

        var roundNum = 1;
        var roundScores = [100, 200, 400, 800, 1600];

        while (contestants.length > 1) {
            var matchCount = Math.ceil(contestants.length / setup.playerCount);
            var nextRoundContestants = [];
            var pendingMatches = [];
            var roundReward = roundScores[Math.min(roundNum - 1, roundScores.length - 1)];

            for (var m = 0; m < matchCount; m++) {
                var bracket = contestants.slice(m * setup.playerCount, (m + 1) * setup.playerCount);
                pendingMatches.push({ bracket: bracket, matchIndex: m });
            }

            var self = this;
            var matchesCompleted = 0;
            var roundRecord = { round: roundNum, contestants: contestants.length, matches: matchCount };
            this.results.rounds.push(roundRecord);
            async function evaluateMatch(match) {
                if (self.cancelled) throw new Error('Tournament cancelled.');
                var matchResults;
                if (self.matchRunner) {
                    matchResults = await self.matchRunner(match.bracket, self.turnsPerMatch, setup);
                } else {
                    var board = new SimBoard(match.bracket, self.turnsPerMatch, setup);
                    matchResults = await board.run();
                }

                var turnsPlayed = matchResults.length && Number.isFinite(matchResults[0].turns)
                    ? Math.max(0, Math.min(matchResults[0].turns, self.turnsPerMatch))
                    : 0;
                var durationPenaltyRatio = turnsPlayed / self.turnsPerMatch;
                for (var r = 0; r < matchResults.length; r++) {
                    var res = matchResults[r];
                    if (res.playerIndex >= match.bracket.length) continue;
                    var genome = match.bracket[res.playerIndex];
                    var assetScore = Math.max(0, Math.round(res.netWorth / 50.0));
                    var placeBonus = r === 0 ? roundReward : (r === 1 ? Math.round(roundReward * 0.4) : (r === 2 ? Math.round(roundReward * 0.2) : 0));
                    var score = placeBonus + assetScore;
                    var durationPenalty = Math.round(score * durationPenaltyRatio * DURATION_PENALTY_RATE);
                    genome.fitness += Math.max(0, score - durationPenalty);
                }

                var winnerResult = matchResults.find(function(result) {
                    return result.playerIndex < match.bracket.length;
                });
                if (winnerResult) nextRoundContestants.push(match.bracket[winnerResult.playerIndex]);
                matchesCompleted++;
                if (progressCallback) {
                    progressCallback({
                        round: roundNum,
                        matchesCompleted: matchesCompleted,
                        matchCount: matchCount,
                        edition: setup.edition,
                        playerCount: setup.playerCount
                    });
                }
            }

            if (this.matchRunner) {
                await Promise.all(pendingMatches.map(evaluateMatch));
            } else {
                for (var pendingIndex = 0; pendingIndex < pendingMatches.length; pendingIndex++) {
                    await evaluateMatch(pendingMatches[pendingIndex]);
                }
            }
            contestants = nextRoundContestants;
            roundNum++;
        }

        this.results.setup = setup;
        this.results.champion = contestants[0] || null;
        this.results.topScore = this.results.champion ? this.results.champion.fitness : 0;

        // Update population champion
        if (this.results.champion) {
            this.population.champion = this.results.champion.clone();
            this.population.championScore = this.results.topScore;
        }

        return this.results;
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Tournament;
        module.exports.Tournament = Tournament;
    }
    global.NEATTournament = Tournament;
    global.Tournament = Tournament;
})(typeof window !== 'undefined' ? window : globalThis);
