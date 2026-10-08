(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('../../simulation/ai-adapter-registry') : null);
    var Gen6AI = global.Gen6AI;
    var GenotypeModule = global.NEATGenotype;
    var Genotype = GenotypeModule && GenotypeModule.Genotype;

    if (typeof module !== 'undefined' && module.exports) {
        Gen6AI = require('./index').Gen6AI;
        GenotypeModule = require('./neat/genotype');
        Genotype = GenotypeModule.Genotype;
    }

    function restoreWorkerGenotype(data) {
        if (!data || data.format !== 'gen6-worker-genotype-v1' ||
            !Array.isArray(data.vertices) || !Array.isArray(data.edges)) {
            throw new Error('Unsupported legacy Gen6 NEAT data.');
        }
        var vertices = data.vertices.map(function(vertex) {
            return new GenotypeModule.VertexInfo(vertex.marking, vertex.order, vertex.type);
        });
        var edges = data.edges.map(function(edge) {
            return new GenotypeModule.EdgeInfo(edge.marking, edge.source, edge.destination, edge.weight, edge.enabled);
        });
        return new Genotype(vertices, edges);
    }

    function extractGenotype(contestant) {
        var genotype = contestant && contestant.kind === 'gen6' ? contestant.genotype : contestant;
        if (typeof genotype === 'string') throw new Error('Unsupported legacy Gen6 NEAT data.');
        if (genotype && genotype.format === 'gen6-worker-genotype-v1') return restoreWorkerGenotype(genotype);
        return genotype;
    }

    function serializeGenotype(genotype) {
        return {
            format: 'gen6-worker-genotype-v1',
            vertices: genotype.vertices.map(function(vertex) {
                return { marking: vertex.marking, order: vertex.order, type: vertex.type };
            }),
            edges: genotype.edges.map(function(edge) {
                return {
                    marking: edge.marking,
                    source: edge.source,
                    destination: edge.destination,
                    weight: edge.weight,
                    enabled: edge.enabled
                };
            })
        };
    }

    var adapter = {
        kind: 'gen6',
        supports: function(contestant) {
            if (typeof contestant === 'string') return false;
            if (!contestant || contestant.kind) return false;
            return Array.isArray(contestant.vertices) && Array.isArray(contestant.edges);
        },
        createPlayerAI: function(contestant, player) {
            return new Gen6AI(player, extractGenotype(contestant));
        },
        serialize: function(contestant) {
            var genotype = extractGenotype(contestant);
            return { kind: 'gen6', genotype: serializeGenotype(genotype) };
        },
        deserialize: function(contestant) {
            if (contestant && contestant.kind === 'gen6') {
                return { kind: 'gen6', genotype: extractGenotype(contestant) };
            }
            return contestant;
        }
    };

    SimulationAdapters.register(adapter);
    global.Gen6SimulationAdapter = adapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof window !== 'undefined' ? window : globalThis);