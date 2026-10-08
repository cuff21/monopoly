/**
 * Gen6 NEAT training lifecycle: evaluate a population, evolve it, and persist its champion.
 */
(function(global) {
    'use strict';

    var PopulationModule = (typeof module !== 'undefined' && module.exports) ? require('../neat/population') : global.NEATPopulation;
    var Genotype = (typeof module !== 'undefined' && module.exports) ? require('../neat/genotype').Genotype : global.NEATGenotype.Genotype;
    var Tournament = (typeof module !== 'undefined' && module.exports) ? require('./tournament') : global.NEATTournament;
    var PolicyEvaluator = (typeof module !== 'undefined' && module.exports) ? require('./policy-evaluator') : global.Gen6PolicyEvaluator;
    var BrowserWorkerPool = (typeof module !== 'undefined' && module.exports)
        ? require('../../../simulation/worker-pool')
        : global.SimulationWorkerPool;
    var Gen6Compatibility = (typeof module !== 'undefined' && module.exports)
        ? require('../schema1-compatibility')
        : global.Gen6Schema1Compatibility;
    var Population = PopulationModule.Population;

    var POPULATION_KEY = 'gen6Population';
    var CHAMPION_KEY = 'gen6Champion';
    var MAX_GENERATIONS_PER_RUN = 20;
    var DEFAULT_POPULATION_SIZE = 32;
    var DEFAULT_TURNS_PER_MATCH = 60;
    var DEFAULT_WORKER_URL = 'js/simulation/worker-entry.js';

    function defaultStorage() {
        try {
            return global.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    function rejectLegacyStorage(storage) {
        if (!Gen6Compatibility) throw new Error('Gen6 compatibility checks are unavailable.');
        Gen6Compatibility.rejectLegacyStorage(storage);
    }

    function Gen6Trainer(options) {
        options = options || {};
        this.storage = options.storage === undefined ? defaultStorage() : options.storage;
        this.population = options.population || new Population(options.populationSize || DEFAULT_POPULATION_SIZE, 147, 9);
        this.turnsPerMatch = options.turnsPerMatch || DEFAULT_TURNS_PER_MATCH;
        this.matchRunner = options.matchRunner || null;
        this.policyEvaluator = options.policyEvaluator || new PolicyEvaluator({
            games: options.validationGames,
            turnsPerGame: options.validationTurns,
            requiredImprovement: options.requiredImprovement,
            matchRunner: this.matchRunner
        });
        this.tournamentFactory = options.tournamentFactory || function(population, turns) {
            return new Tournament(population, turns, this.matchRunner);
        }.bind(this);

        if (this.population.species.length === 0) this.population.initialize();
        this.bestGenome = this.population.champion ? this.population.champion.clone() : null;
        this.bestScore = this.population.championScore || 0;
    }

    Gen6Trainer.prototype.stop = function() {
        this.stopRequested = true;
        if (this.activeTournament && this.activeTournament.cancel) this.activeTournament.cancel();
        if (this.policyEvaluator && this.policyEvaluator.cancel) this.policyEvaluator.cancel();
    };

    Gen6Trainer.prototype.train = async function(generationCount, progressCallback) {
        generationCount = Number(generationCount);
        if (!Number.isInteger(generationCount) || generationCount < 1 || generationCount > MAX_GENERATIONS_PER_RUN) {
            throw new Error('Generation count must be an integer between 1 and ' + MAX_GENERATIONS_PER_RUN + '.');
        }

        this.stopRequested = false;
        if (this.policyEvaluator) this.policyEvaluator.cancelled = false;
        try {
            return await this.runTraining(generationCount, progressCallback);
        } catch (error) {
            if (!this.stopRequested) throw error;
            return {
                stopped: true,
                population: this.population,
                champion: this.bestGenome ? this.bestGenome.clone() : null,
                bestScore: this.bestScore,
                validation: null
            };
        } finally {
            this.activeTournament = null;
        }
    };

    Gen6Trainer.prototype.runTraining = async function(generationCount, progressCallback) {
        for (var generation = 0; generation < generationCount; generation++) {
            if (this.stopRequested) throw new Error('Training stopped.');
            var tournament = this.tournamentFactory(this.population, this.turnsPerMatch);
            this.activeTournament = tournament;
            var trainer = this;
            var result = await tournament.run(function(update) {
                if (progressCallback) {
                    progressCallback(Object.assign({
                        phase: 'tournament',
                        generation: trainer.population.generation + 1,
                        generationsCompleted: generation,
                        generationsRequested: generationCount
                    }, update));
                }
            });
            if (this.stopRequested) throw new Error('Training stopped.');
            if (!result || !result.champion) {
                throw new Error('Training tournament did not produce a champion.');
            }

            if (!this.bestGenome || result.topScore >= this.bestScore) {
                this.bestGenome = result.champion.clone();
                this.bestScore = result.topScore;
            }

            this.population.epoch();
            this.population.champion = this.bestGenome.clone();
            this.population.championScore = this.bestScore;
            this.save(false);

            if (progressCallback) {
                progressCallback({
                    generation: this.population.generation,
                    generationsCompleted: generation + 1,
                    generationsRequested: generationCount,
                    bestScore: this.bestScore,
                    champion: this.bestGenome.clone(),
                    tournament: {
                        edition: result.setup && result.setup.edition,
                        playerCount: result.setup && result.setup.playerCount,
                        topScore: result.topScore,
                        rounds: result.rounds || []
                    }
                });
            }
            await new Promise(function(resolve) { setTimeout(resolve, 0); });
        }

        var validation = await this.policyEvaluator.evaluate(this.bestGenome, function(update) {
            if (progressCallback) {
                progressCallback(Object.assign({ phase: 'validation' }, update));
            }
        });
        this.save(validation.passed);

        return {
            population: this.population,
            champion: this.bestGenome.clone(),
            bestScore: this.bestScore,
            validation: validation
        };
    };

    Gen6Trainer.prototype.save = function(approveChampion) {
        if (!this.storage || !this.bestGenome) return false;

        if (approveChampion) this.storage.setItem(CHAMPION_KEY, this.bestGenome.toString());
        this.storage.setItem(POPULATION_KEY, JSON.stringify({
            version: 1,
            populationSize: this.population.size,
            generation: this.population.generation,
            bestScore: this.bestScore,
            champion: this.bestGenome.toString(),
            state: this.population.saveToString()
        }));
        return true;
    };

    Gen6Trainer.getStoredChampion = function(storage) {
        storage = storage === undefined ? defaultStorage() : storage;
        if (!storage) return null;
        rejectLegacyStorage(storage);
        var serialized = storage.getItem(CHAMPION_KEY);
        return serialized ? Genotype.fromString(serialized) : null;
    };

    Gen6Trainer.loadOrCreate = function(options) {
        options = options || {};
        var storage = options.storage === undefined ? defaultStorage() : options.storage;
        rejectLegacyStorage(storage);
        var serialized = storage && storage.getItem(POPULATION_KEY);
        if (!serialized) {
            options.storage = storage;
            return new Gen6Trainer(options);
        }

        var saved = JSON.parse(serialized);
        if (saved.version !== 1 || typeof saved.state !== 'string') {
            throw new Error('Unsupported saved Gen6 population format.');
        }

        var population = Population.loadFromString(saved.state);
        var requestedPopulationSize = options.populationSize || saved.populationSize;
        if (requestedPopulationSize !== saved.populationSize) {
            var members = [];
            population.species.forEach(function(species) {
                members = members.concat(species.members);
            });
            members = members.slice(0, requestedPopulationSize);
            while (members.length < requestedPopulationSize) {
                members.push(Genotype.createInitial(population.inputCount, population.outputCount, population.getMarking));
            }
            population.speciate(members);
        }
        population.size = requestedPopulationSize;
        population.generation = saved.generation;
        population.championScore = saved.bestScore;
        population.champion = Genotype.fromString(saved.champion);

        options.storage = storage;
        options.population = population;
        return new Gen6Trainer(options);
    };

    Gen6Trainer.MAX_GENERATIONS_PER_RUN = MAX_GENERATIONS_PER_RUN;
    Gen6Trainer.DEFAULT_POPULATION_SIZE = DEFAULT_POPULATION_SIZE;
    Gen6Trainer.DEFAULT_TURNS_PER_MATCH = DEFAULT_TURNS_PER_MATCH;
    Gen6Trainer.DEFAULT_WORKER_URL = DEFAULT_WORKER_URL;
    Gen6Trainer.BrowserWorkerPool = BrowserWorkerPool;
    Gen6Trainer.createBrowserWorkerPool = function(options) {
        options = options || {};
        var hardwareConcurrency = global.navigator && global.navigator.hardwareConcurrency ? global.navigator.hardwareConcurrency : 2;
        var workerCount = options.workerCount || Math.max(1, Math.min(4, hardwareConcurrency - 1));
        return new BrowserWorkerPool(workerCount, options.workerUrl || DEFAULT_WORKER_URL, options.WorkerConstructor);
    };

    var Gen6TrainerModule = { Gen6Trainer: Gen6Trainer };
    if (typeof module !== 'undefined' && module.exports) module.exports = Gen6TrainerModule;
    global.Gen6Trainer = Gen6Trainer;
})(typeof window !== 'undefined' ? window : globalThis);