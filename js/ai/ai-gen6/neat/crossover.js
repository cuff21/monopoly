/**
 * Crossover and Speciation Distance for MonopolyNEAT Gen6 AI
 * Compatible with b2developer/MonopolyNEAT C# Crossover.cs.
 */
(function(global) {
    'use strict';

    var GenotypeModule = (typeof module !== 'undefined' && module.exports) ? require('./genotype') : global.NEATGenotype;
    var Genotype = GenotypeModule.Genotype;
    var EdgeInfo = GenotypeModule.EdgeInfo;
    var VertexInfo = GenotypeModule.VertexInfo;

    var Crossover = {
        C1: 1.0, // Excess coefficient
        C2: 1.0, // Disjoint coefficient
        C3: 0.4, // Weight difference coefficient
        DISTANCE_THRESHOLD: 3.0,

        /**
         * Calculates compatibility distance between two genomes.
         * delta = (c1 * E) / N + (c2 * D) / N + c3 * W_bar
         */
        compatibilityDistance: function(g1, g2, c1, c2, c3) {
            c1 = c1 !== undefined ? c1 : Crossover.C1;
            c2 = c2 !== undefined ? c2 : Crossover.C2;
            c3 = c3 !== undefined ? c3 : Crossover.C3;

            var edges1 = g1.edges;
            var edges2 = g2.edges;

            if (edges1.length === 0 && edges2.length === 0) return 0.0;

            var map1 = new Map();
            for (var i = 0; i < edges1.length; i++) {
                map1.set(edges1[i].marking, edges1[i]);
            }

            var map2 = new Map();
            for (var i = 0; i < edges2.length; i++) {
                map2.set(edges2[i].marking, edges2[i]);
            }

            var maxMark1 = edges1.reduce(function(m, e) { return Math.max(m, e.marking); }, 0);
            var maxMark2 = edges2.reduce(function(m, e) { return Math.max(m, e.marking); }, 0);

            var matchingCount = 0;
            var disjointCount = 0;
            var excessCount = 0;
            var totalWeightDiff = 0.0;

            var allKeys = new Set();
            map1.forEach(function(val, key) { allKeys.add(key); });
            map2.forEach(function(val, key) { allKeys.add(key); });

            allKeys.forEach(function(mark) {
                var e1 = map1.get(mark);
                var e2 = map2.get(mark);

                if (e1 && e2) {
                    matchingCount++;
                    totalWeightDiff += Math.abs(e1.weight - e2.weight);
                } else if (e1) {
                    if (mark > maxMark2) excessCount++;
                    else disjointCount++;
                } else if (e2) {
                    if (mark > maxMark1) excessCount++;
                    else disjointCount++;
                }
            });

            var N = Math.max(edges1.length, edges2.length);
            if (N < 20) N = 1.0; // Standard NEAT normalization

            var avgWeightDiff = matchingCount > 0 ? (totalWeightDiff / matchingCount) : 0.0;
            return ((c1 * excessCount) / N) + ((c2 * disjointCount) / N) + (c3 * avgWeightDiff);
        },

        /**
         * Breeds two parent genotypes into an offspring genotype.
         * Fitter parent donates disjoint/excess genes. Matching genes are randomly selected.
         * 
         * @param {Genotype} parent1 - First parent
         * @param {Genotype} parent2 - Second parent
         * @returns {Genotype} Offspring genotype
         */
        breed: function(parent1, parent2) {
            var fitter = parent1;
            var lessFit = parent2;

            if (parent2.fitness > parent1.fitness) {
                fitter = parent2;
                lessFit = parent1;
            } else if (parent1.fitness === parent2.fitness) {
                // If equal, choose shorter genome as fitter to favor parsimony
                if (parent2.edges.length < parent1.edges.length) {
                    fitter = parent2;
                    lessFit = parent1;
                }
            }

            var mapLess = new Map();
            for (var i = 0; i < lessFit.edges.length; i++) {
                mapLess.set(lessFit.edges[i].marking, lessFit.edges[i]);
            }

            var offspringEdges = [];
            var usedVertexMarkings = new Set();

            var inputCount = parent1.vertices.filter(function(vertex) { return vertex.type === 0; }).length;
            var outputCount = parent1.vertices.filter(function(vertex) { return vertex.type === 2; }).length || 9;
            // Keep every base input and output node across model versions.
            for (var v = 0; v < inputCount + outputCount; v++) {
                usedVertexMarkings.add(v);
            }

            for (var i = 0; i < fitter.edges.length; i++) {
                var fitGene = fitter.edges[i];
                var otherGene = mapLess.get(fitGene.marking);
                var chosenGene;

                if (otherGene) {
                    // Matching gene: randomly pick from either parent, or 50% average weight
                    var r = Math.random();
                    if (r < 0.4) {
                        chosenGene = fitGene.clone();
                    } else if (r < 0.8) {
                        chosenGene = otherGene.clone();
                    } else {
                        chosenGene = fitGene.clone();
                        chosenGene.weight = (fitGene.weight + otherGene.weight) / 2.0;
                    }

                    // If disabled in either parent, 75% chance of being disabled in offspring
                    if (!fitGene.enabled || !otherGene.enabled) {
                        if (Math.random() < 0.75) {
                            chosenGene.enabled = false;
                        }
                    }
                } else {
                    // Disjoint or excess gene from fitter parent
                    chosenGene = fitGene.clone();
                }

                offspringEdges.push(chosenGene);
                usedVertexMarkings.add(chosenGene.source);
                usedVertexMarkings.add(chosenGene.destination);
            }

            // Build vertices list
            var vertMap = new Map();
            for (var i = 0; i < fitter.vertices.length; i++) {
                vertMap.set(fitter.vertices[i].marking, fitter.vertices[i].clone());
            }
            for (var i = 0; i < lessFit.vertices.length; i++) {
                if (!vertMap.has(lessFit.vertices[i].marking)) {
                    vertMap.set(lessFit.vertices[i].marking, lessFit.vertices[i].clone());
                }
            }

            var offspringVerts = [];
            usedVertexMarkings.forEach(function(mark) {
                var v = vertMap.get(mark);
                if (v) {
                    offspringVerts.push(v);
                } else {
                    offspringVerts.push(new VertexInfo(mark, mark));
                }
            });

            // Sort vertices by marking for deterministic structure
            offspringVerts.sort(function(a, b) { return a.marking - b.marking; });

            return new Genotype(offspringVerts, offspringEdges);
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Crossover;
    }
    global.NEATCrossover = Crossover;
})(typeof window !== 'undefined' ? window : globalThis);
