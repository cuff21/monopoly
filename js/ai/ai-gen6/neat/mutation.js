/**
 * Mutation operators for MonopolyNEAT Gen6 AI
 * Compatible with b2developer/MonopolyNEAT C# Mutation.cs.
 */
(function(global) {
    'use strict';

    var GenotypeModule = (typeof module !== 'undefined' && module.exports) ? require('./genotype') : global.NEATGenotype;
    var EdgeInfo = GenotypeModule.EdgeInfo;
    var VertexInfo = GenotypeModule.VertexInfo;
    var VertexType = GenotypeModule.VertexType;

    var Mutation = {
        WEIGHT_MUTATION_RATE: 0.80,
        WEIGHT_PERTURB_PROBABILITY: 0.90,
        WEIGHT_PERTURB_POWER: 0.50,
        ADD_LINK_RATE: 0.05,
        ADD_NODE_RATE: 0.03,
        TOGGLE_ENABLE_RATE: 0.01,

        /**
         * Mutates connection weights of a genotype.
         * @param {Genotype} genotype
         * @param {number} [perturbPower=0.5]
         */
        mutateWeights: function(genotype, perturbPower) {
            var power = perturbPower !== undefined ? perturbPower : Mutation.WEIGHT_PERTURB_POWER;
            var edges = genotype.edges;

            for (var i = 0; i < edges.length; i++) {
                if (Math.random() < Mutation.WEIGHT_PERTURB_PROBABILITY) {
                    // Perturb slightly
                    edges[i].weight += (Math.random() * 2.0 - 1.0) * power;
                    // Clamp to [-8, 8]
                    edges[i].weight = Math.max(-8.0, Math.min(8.0, edges[i].weight));
                } else {
                    // Assign completely new random weight
                    edges[i].weight = (Math.random() * 4.0 - 2.0);
                }
            }
        },

        /**
         * Adds a new connection between two previously unconnected nodes.
         * 
         * @param {Genotype} genotype
         * @param {Function} getMarking - (source, dest) => innovationMarking
         */
        mutateAddLink: function(genotype, getMarking) {
            var verts = genotype.vertices;
            if (verts.length < 2) return;

            // Existing connection lookup
            var existing = new Set();
            for (var i = 0; i < genotype.edges.length; i++) {
                var e = genotype.edges[i];
                existing.add(e.source + '->' + e.destination);
            }

            var tries = 25;
            while (tries-- > 0) {
                var v1 = verts[Math.floor(Math.random() * verts.length)];
                var v2 = verts[Math.floor(Math.random() * verts.length)];

                if (v1.marking === v2.marking) continue;
                // v1 cannot be output, v2 cannot be input
                if (v1.type === VertexType.OUTPUT) continue;
                if (v2.type === VertexType.INPUT) continue;

                var key = v1.marking + '->' + v2.marking;
                if (existing.has(key)) continue;

                var mark = getMarking(v1.marking, v2.marking);
                var weight = (Math.random() * 2.0 - 1.0);
                genotype.edges.push(new EdgeInfo(mark, v1.marking, v2.marking, weight, true));
                return;
            }
        },

        /**
         * Splits an existing enabled edge by inserting a new intermediate hidden node.
         * 
         * @param {Genotype} genotype
         * @param {Function} getNewVertexMarking - () => newVertexMarking
         * @param {Function} getMarking - (source, dest) => innovationMarking
         */
        mutateAddNode: function(genotype, getNewVertexMarking, getMarking) {
            var enabledEdges = genotype.edges.filter(function(e) { return e.enabled; });
            if (enabledEdges.length === 0) return;

            var chosen = enabledEdges[Math.floor(Math.random() * enabledEdges.length)];
            chosen.enabled = false;

            var newVertMark = getNewVertexMarking();
            var newVert = new VertexInfo(newVertMark, newVertMark, VertexType.HIDDEN);
            genotype.vertices.push(newVert);

            var mark1 = getMarking(chosen.source, newVertMark);
            var mark2 = getMarking(newVertMark, chosen.destination);

            // Leading edge has weight 1.0, trailing edge inherits previous weight
            genotype.edges.push(new EdgeInfo(mark1, chosen.source, newVertMark, 1.0, true));
            genotype.edges.push(new EdgeInfo(mark2, newVertMark, chosen.destination, chosen.weight, true));
        },

        /**
         * Toggles the enabled state of a random edge.
         * @param {Genotype} genotype
         */
        mutateToggleEnable: function(genotype) {
            if (genotype.edges.length === 0) return;
            var edge = genotype.edges[Math.floor(Math.random() * genotype.edges.length)];
            edge.enabled = !edge.enabled;
        },

        /**
         * Applies standard NEAT mutation suite to a genome based on mutation rates.
         */
        mutate: function(genotype, getNewVertexMarking, getMarking) {
            if (Math.random() < Mutation.WEIGHT_MUTATION_RATE) {
                Mutation.mutateWeights(genotype);
            }
            if (Math.random() < Mutation.ADD_LINK_RATE) {
                Mutation.mutateAddLink(genotype, getMarking);
            }
            if (Math.random() < Mutation.ADD_NODE_RATE) {
                Mutation.mutateAddNode(genotype, getNewVertexMarking, getMarking);
            }
            if (Math.random() < Mutation.TOGGLE_ENABLE_RATE) {
                Mutation.mutateToggleEnable(genotype);
            }
            return genotype;
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Mutation;
    }
    global.NEATMutation = Mutation;
})(typeof window !== 'undefined' ? window : globalThis);
