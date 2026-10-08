(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('../../simulation/ai-adapter-registry') : null);
    var Gen6AI = global.Gen6AI;
    var Genotype = global.NEATGenotype && global.NEATGenotype.Genotype;

    if (typeof module !== 'undefined' && module.exports) {
        Gen6AI = require('./index').Gen6AI;
        Genotype = require('./neat/genotype').Genotype;
    }

    function extractGenotype(contestant) {
        var genotype = contestant && contestant.kind === 'gen6' ? contestant.genotype : contestant;
        return typeof genotype === 'string' ? Genotype.fromString(genotype) : genotype;
    }

    var adapter = {
        kind: 'gen6',
        supports: function(contestant) {
            if (typeof contestant === 'string') return true;
            if (!contestant || contestant.kind) return false;
            return Array.isArray(contestant.vertices) && Array.isArray(contestant.edges);
        },
        createPlayerAI: function(contestant, player) {
            return new Gen6AI(player, extractGenotype(contestant));
        },
        serialize: function(contestant) {
            var genotype = extractGenotype(contestant);
            return { kind: 'gen6', genotype: genotype.toString() };
        },
        deserialize: function(contestant) {
            if (contestant && contestant.kind === 'gen6' && typeof contestant.genotype === 'string') {
                return { kind: 'gen6', genotype: Genotype.fromString(contestant.genotype) };
            }
            return contestant;
        }
    };

    SimulationAdapters.register(adapter);
    global.Gen6SimulationAdapter = adapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof window !== 'undefined' ? window : globalThis);