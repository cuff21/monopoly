/**
 * Phenotype for MonopolyNEAT Gen6 AI
 * Executes the recurrent neural network represented by a Genotype.
 * 
 * Uses 10 activation cycles with standard Sigmoid activation:
 *   sigmoid(x) = 1.0 / (1.0 + Math.exp(-x))
 * Compatible with b2developer/MonopolyNEAT C# Phenotype.cs.
 */
(function(global) {
    'use strict';

    function sigmoid(x) {
        return 1.0 / (1.0 + Math.exp(-x));
    }

    /**
     * @param {Genotype} genotype - Genotype to build phenotype from
     * @param {number} [activationPasses=10] - Number of recurrent propagation passes
     */
    function Phenotype(genotype, activationPasses) {
        this.passes = activationPasses || 10;
        this.outputCount = 9;

        // Map vertex markings to internal 0..N-1 indices
        this.markingToIndex = new Map();
        this.indexToMarking = [];

        var verts = genotype.vertices || [];
        this.inputCount = verts.filter(function(vertex) { return vertex.type === 0; }).length || 126;
        for (var i = 0; i < verts.length; i++) {
            var mark = verts[i].marking;
            if (!this.markingToIndex.has(mark)) {
                this.markingToIndex.set(mark, this.indexToMarking.length);
                this.indexToMarking.push(mark);
            }
        }

        // Ensure all input and output markings are indexed.
        for (var m = 0; m < this.inputCount + this.outputCount; m++) {
            if (!this.markingToIndex.has(m)) {
                this.markingToIndex.set(m, this.indexToMarking.length);
                this.indexToMarking.push(m);
            }
        }

        var nodeCount = this.indexToMarking.length;
        this.nodeCount = nodeCount;

        // Preallocate activation buffers
        this.values = new Float64Array(nodeCount);
        this.nextValues = new Float64Array(nodeCount);

        // Pre-build incoming edges array for each node:
        // incoming[targetIdx] = [ { sourceIdx, weight }, ... ]
        this.incomingEdges = new Array(nodeCount);
        for (var i = 0; i < nodeCount; i++) {
            this.incomingEdges[i] = [];
        }

        var edges = genotype.edges || [];
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (!e.enabled) continue;

            var srcIdx = this.markingToIndex.get(e.source);
            var dstIdx = this.markingToIndex.get(e.destination);

            if (srcIdx !== undefined && dstIdx !== undefined) {
                this.incomingEdges[dstIdx].push({
                    sourceIndex: srcIdx,
                    weight: e.weight
                });
            }
        }

        // Identify non-input nodes that have incoming edges
        this.activeNodes = [];
        for (var i = 0; i < nodeCount; i++) {
            var mark = this.indexToMarking[i];
            // Input nodes remain fixed; hidden and output nodes are activated.
            if (mark >= this.inputCount && this.incomingEdges[i].length > 0) {
                this.activeNodes.push(i);
            }
        }
    }

    /**
     * Propagates input values through the recurrent network.
     * 
    * @param {Array<number>|Float64Array} inputs - Model input values
    * @returns {Float64Array} 9 output values following the model's input nodes
     */
    Phenotype.prototype.evaluate = function(inputs) {
        var values = this.values;
        var nextValues = this.nextValues;
        var activeNodes = this.activeNodes;
        var incoming = this.incomingEdges;

        // Reset all nodes to 0.0
        values.fill(0.0);
        nextValues.fill(0.0);

        // Set input nodes.
        var inputLen = Math.min(inputs.length, this.inputCount);
        for (var i = 0; i < inputLen; i++) {
            var idx = this.markingToIndex.get(i);
            if (idx !== undefined) {
                values[idx] = inputs[i];
                nextValues[idx] = inputs[i];
            }
        }

        // Run activation passes (recurrent network propagation)
        var numPasses = this.passes;
        for (var p = 0; p < numPasses; p++) {
            for (var a = 0; a < activeNodes.length; a++) {
                var nodeIdx = activeNodes[a];
                var edges = incoming[nodeIdx];
                var sum = 0.0;
                for (var e = 0; e < edges.length; e++) {
                    sum += values[edges[e].sourceIndex] * edges[e].weight;
                }
                nextValues[nodeIdx] = sigmoid(sum);
            }

            // Copy nextValues to values for next cycle
            for (var a = 0; a < activeNodes.length; a++) {
                var nodeIdx = activeNodes[a];
                values[nodeIdx] = nextValues[nodeIdx];
            }
        }

        // Collect output nodes following the input markings.
        var outputs = new Float64Array(this.outputCount);
        for (var o = 0; o < this.outputCount; o++) {
            var outIdx = this.markingToIndex.get(this.inputCount + o);
            outputs[o] = outIdx !== undefined ? values[outIdx] : 0.5;
        }

        return outputs;
    };

    var PhenotypeModule = {
        sigmoid: sigmoid,
        Phenotype: Phenotype
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PhenotypeModule;
    }
    global.NEATPhenotype = PhenotypeModule;
})(typeof window !== 'undefined' ? window : globalThis);
