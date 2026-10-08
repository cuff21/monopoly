(function(global) {
    'use strict';

    var adapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('../simulation/ai-adapter-registry') : null);

    if (typeof module !== 'undefined' && module.exports) {
        require('./ai-gen5/simulation-adapter');
        require('./ai-strategic-simulation-adapter');
        require('./ai-gen6/simulation-adapter');
    }

    if (typeof module !== 'undefined' && module.exports) module.exports = adapters;
})(typeof window !== 'undefined' ? window : globalThis);