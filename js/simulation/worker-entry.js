(function(global) {
    'use strict';

    function bootstrapWorker(scope, manifestUrl) {
        if (scope.SimBoard && scope.SimulationAdapters) return;
        if (typeof scope.importScripts !== 'function') {
            throw new Error('Simulation worker cannot load its dependencies.');
        }
        if (!manifestUrl && scope.location && scope.location.href) {
            manifestUrl = '../script-manifest.js';
        }
        if (!manifestUrl) throw new Error('Simulation worker requires a manifest URL.');

        var resolvedManifestUrl = new URL(manifestUrl, scope.location.href).href;
        scope.importScripts(resolvedManifestUrl);
        var manifest = scope.ApplicationScriptManifest;
        if (!manifest || !Array.isArray(manifest.scripts)) {
            throw new Error('Application script manifest is missing its scripts.');
        }
        var scripts = manifest.scripts.filter(function(entry) {
            return entry.worker;
        }).map(function(entry) {
            return new URL(entry.src, resolvedManifestUrl).href;
        });
        scope.importScripts.apply(scope, scripts);
        if (!scope.SimBoard || !scope.SimulationAdapters) {
            throw new Error('Simulation worker dependencies failed to load.');
        }
    }

    var workerRuntime = null;
    if (typeof module !== 'undefined' && module.exports) {
        workerRuntime = require('./worker-runtime');
    } else if (typeof global.postMessage === 'function') {
        bootstrapWorker(global);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            processBatch: workerRuntime.processBatch,
            bootstrapWorker: bootstrapWorker
        };
    }
})(typeof self !== 'undefined' ? self : globalThis);