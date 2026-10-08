/**
 * Population and Species management for MonopolyNEAT Gen6 AI
 * Supports Speciation, Fitness Sharing, Elitism, Evolution,
 * and exact C# MonopolyNEAT SaveState / LoadState file format.
 */
(function(global) {
    'use strict';

    var GenotypeModule = (typeof module !== 'undefined' && module.exports) ? require('./genotype') : global.NEATGenotype;
    var Crossover = (typeof module !== 'undefined' && module.exports) ? require('./crossover') : global.NEATCrossover;
    var Mutation = (typeof module !== 'undefined' && module.exports) ? require('./mutation') : global.NEATMutation;

    var Genotype = GenotypeModule.Genotype;

    function Species(id, representative) {
        this.id = id;
        this.representative = representative ? representative.clone() : null;
        this.members = [];
        this.topFitness = 0;
        this.staleness = 0;
        this.averageFitness = 0;
    }

    Species.prototype.add = function(genotype) {
        genotype.speciesId = this.id;
        this.members.push(genotype);
    };

    /**
     * Population manager
     * @param {number} size - Default 256
    * @param {number} [inputCount=147]
     * @param {number} [outputCount=9]
     */
    function Population(size, inputCount, outputCount) {
        this.size = size || 256;
        this.inputCount = inputCount || 147;
        this.outputCount = outputCount || 9;

        this.generation = 0;
        this.championScore = 0;
        this.champion = null;

        this.species = [];
        this.speciesCounter = 0;
        this.distanceThreshold = 3.0;

        // Innovation markings cache: "source,dest" => marking
        this.markings = new Map();
        this.markingList = []; // [ { marking, source, dest }, ... ]
        this.nextMarking = 0;
        this.nextVertexMarking = this.inputCount + this.outputCount;

        var self = this;
        this.getMarking = function(src, dst) {
            var key = src + ',' + dst;
            if (self.markings.has(key)) {
                return self.markings.get(key);
            }
            var m = self.nextMarking++;
            self.markings.set(key, m);
            self.markingList.push({ marking: m, source: src, destination: dst });
            return m;
        };

        this.getNewVertexMarking = function() {
            return self.nextVertexMarking++;
        };
    }

    /**
     * Initializes a brand new population with base genotypes.
     */
    Population.prototype.initialize = function() {
        var self = this;
        var genotypes = [];
        for (var i = 0; i < this.size; i++) {
            genotypes.push(Genotype.createInitial(this.inputCount, this.outputCount, this.getMarking));
        }
        this.speciate(genotypes);
    };

    /**
     * Assigns genotypes to species based on compatibility distance.
     */
    Population.prototype.speciate = function(genotypes) {
        for (var s = 0; s < this.species.length; s++) {
            this.species[s].members = [];
        }

        for (var i = 0; i < genotypes.length; i++) {
            var g = genotypes[i];
            var placed = false;

            for (var s = 0; s < this.species.length; s++) {
                var sp = this.species[s];
                var dist = Crossover.compatibilityDistance(g, sp.representative);
                if (dist < this.distanceThreshold) {
                    sp.add(g);
                    placed = true;
                    break;
                }
            }

            if (!placed) {
                var newSpecies = new Species(++this.speciesCounter, g);
                newSpecies.add(g);
                this.species.push(newSpecies);
            }
        }

        // Filter out empty species and pick new representative
        var activeSpecies = [];
        for (var s = 0; s < this.species.length; s++) {
            var sp = this.species[s];
            if (sp.members.length > 0) {
                // Representative is a random member
                sp.representative = sp.members[Math.floor(Math.random() * sp.members.length)].clone();
                activeSpecies.push(sp);
            }
        }
        this.species = activeSpecies;
    };

    /**
     * Evolves the population to the next generation based on current fitness values.
     */
    Population.prototype.epoch = function() {
        var allMembers = [];
        for (var s = 0; s < this.species.length; s++) {
            var sp = this.species[s];
            allMembers = allMembers.concat(sp.members);
        }

        if (allMembers.length === 0) return;

        // Find generation champion
        allMembers.sort(function(a, b) { return b.fitness - a.fitness; });
        var genChamp = allMembers[0];
        if (!this.champion || genChamp.fitness >= this.championScore) {
            this.champion = genChamp.clone();
            this.championScore = genChamp.fitness;
        }

        // Compute adjusted fitness: fitness / speciesSize
        var totalAdjustedFitness = 0.0;
        for (var s = 0; s < this.species.length; s++) {
            var sp = this.species[s];
            var spTotal = 0.0;

            for (var m = 0; m < sp.members.length; m++) {
                var g = sp.members[m];
                g.adjustedFitness = g.fitness / sp.members.length;
                spTotal += g.adjustedFitness;
            }

            sp.averageFitness = sp.members.length > 0 ? (spTotal / sp.members.length) : 0;
            totalAdjustedFitness += spTotal;

            // Sort species members by fitness descending
            sp.members.sort(function(a, b) { return b.fitness - a.fitness; });

            // Check staleness
            if (sp.members[0].fitness > sp.topFitness) {
                sp.topFitness = sp.members[0].fitness;
                sp.staleness = 0;
            } else {
                sp.staleness++;
            }
        }

        // Breed next generation
        var nextGeneration = [];

        // Global champion elitism: keep champion unconditionally
        if (this.champion) {
            nextGeneration.push(this.champion.clone());
        }

        var self = this;
        for (var s = 0; s < this.species.length; s++) {
            var sp = this.species[s];
            // Discard stagnant species after 15 generations unless it has the global top fitness
            if (sp.staleness > 15 && sp.topFitness < this.championScore) {
                continue;
            }

            // Proportional offspring allocation
            var spShare = totalAdjustedFitness > 0 ? (sp.members.reduce(function(acc, m) { return acc + m.adjustedFitness; }, 0) / totalAdjustedFitness) : (1 / this.species.length);
            var offspringCount = Math.floor(spShare * this.size);

            // Species champion elitism if size > 5
            if (sp.members.length > 5 && nextGeneration.length < this.size) {
                nextGeneration.push(sp.members[0].clone());
                offspringCount--;
            }

            // Cull bottom 50% of species
            var cullLimit = Math.max(1, Math.ceil(sp.members.length * 0.5));
            var matingPool = sp.members.slice(0, cullLimit);

            function selectParent() {
                var idx = Math.floor(Math.random() * matingPool.length);
                return matingPool[idx];
            }

            for (var o = 0; o < offspringCount && nextGeneration.length < this.size; o++) {
                var child;
                if (matingPool.length === 1 || Math.random() < 0.25) {
                    // Asexual reproduction (mutation only)
                    child = selectParent().clone();
                } else {
                    // Sexual reproduction (crossover)
                    var p1 = selectParent();
                    var p2 = selectParent();
                    child = Crossover.breed(p1, p2);
                }

                // Apply mutation
                Mutation.mutate(child, self.getNewVertexMarking, self.getMarking);
                nextGeneration.push(child);
            }
        }

        // Fill any remainder up to population size
        while (nextGeneration.length < this.size) {
            var randomParent = allMembers[Math.floor(Math.random() * allMembers.length)];
            var child = randomParent.clone();
            Mutation.mutate(child, self.getNewVertexMarking, self.getMarking);
            nextGeneration.push(child);
        }

        this.generation++;
        this.speciate(nextGeneration);
    };

    /**
     * Serializes the entire population state into MonopolyNEAT text format:
     * GENERATION;CHAMPION_SCORE;MARKINGS;SPECIES;
     */
    Population.prototype.saveToString = function() {
        var parts = [];
        parts.push(this.generation);
        parts.push(this.championScore);

        // Markings: order,source,destination,...
        var markingTokens = [];
        for (var i = 0; i < this.markingList.length; i++) {
            var m = this.markingList[i];
            markingTokens.push(m.marking + ',' + m.source + ',' + m.destination);
        }
        parts.push(markingTokens.join(','));

        // Species: topFitness,staleness&genotype1ngenotype2...&
        var speciesParts = [];
        for (var s = 0; s < this.species.length; s++) {
            var sp = this.species[s];
            var spHeader = sp.topFitness + ',' + sp.staleness;
            var genoStrings = [];
            for (var m = 0; m < sp.members.length; m++) {
                genoStrings.push(sp.members[m].toString());
            }
            speciesParts.push(spHeader + '&' + genoStrings.join('n'));
        }
        parts.push(speciesParts.join('&') + '&');

        return parts.join(';') + ';';
    };

    Population.loadFromString = function() {
        throw new Error("Unsupported legacy Gen6 NEAT data.");
    };

    var PopulationModule = {
        Species: Species,
        Population: Population
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PopulationModule;
    }
    global.NEATPopulation = PopulationModule;
})(typeof window !== 'undefined' ? window : globalThis);
