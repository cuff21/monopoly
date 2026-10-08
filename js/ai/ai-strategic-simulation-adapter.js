(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('../simulation/ai-adapter-registry') : null);
    var StrategicAI = global.StrategicAI;

    if (typeof module !== 'undefined' && module.exports) {
        StrategicAI = require('./ai-strategic').StrategicAI;
    }

    var adapter = {
        kind: 'strategic',
        supports: function(contestant) {
            return !!contestant && ((contestant.kind === 'strategic') ||
                (contestant.kind === 'baseline' && contestant.ai === 'strategic'));
        },
        createPlayerAI: function(contestant, player) {
            return new StrategicAI(player, { name: contestant.profile || 'Balanced' });
        },
        serialize: function(contestant) {
            return { kind: 'baseline', ai: 'strategic', profile: contestant.profile || 'Balanced' };
        }
    };

    SimulationAdapters.register(adapter);
    global.StrategicSimulationAdapter = adapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof window !== 'undefined' ? window : globalThis);