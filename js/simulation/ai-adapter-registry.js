(function(global) {
    'use strict';

    var adapters = Object.create(null);

    function register(adapter) {
        if (!adapter || typeof adapter.kind !== 'string' || !adapter.kind || typeof adapter.createPlayerAI !== 'function') {
            throw new TypeError('A simulation adapter requires a kind and createPlayerAI function.');
        }
        if (adapters[adapter.kind] && adapters[adapter.kind] !== adapter) {
            throw new Error('A simulation adapter is already registered for kind: ' + adapter.kind);
        }
        adapters[adapter.kind] = adapter;
        return adapter;
    }

    function resolve(contestant) {
        var kind = contestant && contestant.kind;
        var adapter = kind && adapters[kind];
        if (!adapter) {
            var kinds = Object.keys(adapters);
            for (var i = 0; i < kinds.length; i++) {
                var candidate = adapters[kinds[i]];
                if (typeof candidate.supports === 'function' && candidate.supports(contestant)) {
                    adapter = candidate;
                    break;
                }
            }
        }
        if (!adapter) {
            throw new Error('No simulation adapter is registered for contestant.');
        }
        return adapter;
    }

    var SimulationAdapters = {
        register: register,
        get: function(kind) { return adapters[kind] || null; },
        getKind: function(contestant) { return resolve(contestant).kind; },
        createPlayerAI: function(contestant, player) {
            return resolve(contestant).createPlayerAI(contestant, player);
        },
        serialize: function(contestant) {
            var adapter = resolve(contestant);
            return typeof adapter.serialize === 'function' ? adapter.serialize(contestant) : contestant;
        },
        deserialize: function(contestant) {
            var adapter = resolve(contestant);
            return typeof adapter.deserialize === 'function' ? adapter.deserialize(contestant) : contestant;
        }
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = SimulationAdapters;
    global.SimulationAdapters = SimulationAdapters;
})(typeof window !== 'undefined' ? window : globalThis);
