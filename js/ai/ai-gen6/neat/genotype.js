/**
 * Genotype for MonopolyNEAT Gen6 AI
 * Represents the genetic encoding (vertices and edges with innovation markings) of a neural network.
 * Compatible with b2developer/MonopolyNEAT C# implementation.
 */
(function(global) {
    'use strict';

    var VertexType = {
        INPUT: 0,
        HIDDEN: 1,
        OUTPUT: 2
    };

    /**
     * Represents a node (vertex) in the NEAT genome.
     * @param {number} marking - Historical innovation marking
     * @param {number} order - Topological / sequence order
     * @param {number} type - 0: Input, 1: Hidden, 2: Output
     */
    function VertexInfo(marking, order, type) {
        this.marking = marking;
        this.order = order !== undefined ? order : marking;
        this.type = type !== undefined ? type : (marking < 126 ? VertexType.INPUT : (marking < 135 ? VertexType.OUTPUT : VertexType.HIDDEN));
    }

    VertexInfo.prototype.clone = function() {
        return new VertexInfo(this.marking, this.order, this.type);
    };

    /**
     * Represents a directed connection (edge) between two nodes in the NEAT genome.
     * @param {number} marking - Historical innovation marking
     * @param {number} source - Source vertex marking
     * @param {number} destination - Destination vertex marking
     * @param {number} weight - Synaptic connection weight
     * @param {boolean} enabled - Whether connection is active
     */
    function EdgeInfo(marking, source, destination, weight, enabled) {
        this.marking = marking;
        this.source = source;
        this.destination = destination;
        this.weight = weight !== undefined ? weight : 0.0;
        this.enabled = enabled !== undefined ? Boolean(enabled) : true;
    }

    EdgeInfo.prototype.clone = function() {
        return new EdgeInfo(this.marking, this.source, this.destination, this.weight, this.enabled);
    };

    /**
     * Genotype containing vertex and edge gene lists.
     * @param {Array<VertexInfo>} vertices
     * @param {Array<EdgeInfo>} edges
     */
    function Genotype(vertices, edges) {
        this.vertices = vertices ? vertices.slice() : [];
        this.edges = edges ? edges.slice() : [];
        this.fitness = 0;
        this.adjustedFitness = 0;
        this.speciesId = 0;
    }

    Genotype.prototype.clone = function() {
        var clonedVerts = this.vertices.map(function(v) { return v.clone(); });
        var clonedEdges = this.edges.map(function(e) { return e.clone(); });
        var g = new Genotype(clonedVerts, clonedEdges);
        g.fitness = this.fitness;
        g.adjustedFitness = this.adjustedFitness;
        g.speciesId = this.speciesId;
        return g;
    };

    /**
     * Creates a default starting genotype with `inputCount` inputs fully connected to `outputCount` outputs.
     * @param {number} inputCount - Default 126
     * @param {number} outputCount - Default 9
     * @param {Function} [markingTracker] - Optional function(source, dest) => marking
     * @returns {Genotype}
     */
    Genotype.createInitial = function(inputCount, outputCount, markingTracker) {
        inputCount = inputCount || 126;
        outputCount = outputCount || 9;
        var vertices = [];
        var edges = [];

        // 0..inputCount-1: Inputs
        for (var i = 0; i < inputCount; i++) {
            vertices.push(new VertexInfo(i, i, VertexType.INPUT));
        }
        // inputCount..inputCount+outputCount-1: Outputs
        for (var i = 0; i < outputCount; i++) {
            var mark = inputCount + i;
            vertices.push(new VertexInfo(mark, mark, VertexType.OUTPUT));
        }

        var edgeMarking = 0;
        for (var i = 0; i < inputCount; i++) {
            for (var j = 0; j < outputCount; j++) {
                var dest = inputCount + j;
                var mark = markingTracker ? markingTracker(i, dest) : edgeMarking++;
                var initialWeight = (Math.random() * 2.0 - 1.0);
                edges.push(new EdgeInfo(mark, i, dest, initialWeight, true));
            }
        }

        return new Genotype(vertices, edges);
    };

    Genotype.fromString = function() {
        throw new Error("Unsupported legacy Gen6 NEAT data.");
    };

    /**
     * Serializes genotype to string formatted as `verts#edges`
     */
    Genotype.prototype.toString = function() {
        var vertParts = [];
        for (var i = 0; i < this.vertices.length; i++) {
            var v = this.vertices[i];
            vertParts.push(v.marking + ',' + v.order + ',' + v.type + ',');
        }

        var edgeParts = [];
        for (var i = 0; i < this.edges.length; i++) {
            var e = this.edges[i];
            edgeParts.push(e.marking + ',' + e.source + ',' + e.destination + ',' + e.weight + ',' + (e.enabled ? 1 : 0) + ',');
        }

        return vertParts.join('') + '#' + edgeParts.join('');
    };

    var GenotypeModule = {
        VertexType: VertexType,
        VertexInfo: VertexInfo,
        EdgeInfo: EdgeInfo,
        Genotype: Genotype
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GenotypeModule;
    }
    global.NEATGenotype = GenotypeModule;
})(typeof window !== 'undefined' ? window : globalThis);
