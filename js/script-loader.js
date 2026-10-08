(function(global) {
    'use strict';

    var manifest = global.ApplicationScriptManifest;
    if (!manifest || !Array.isArray(manifest.scripts)) {
        throw new Error('Application script manifest is missing.');
    }

    var loaderUrl = global.document.currentScript.src;
    manifest.scripts.forEach(function(entry) {
        if (!entry.page) return;
        var scriptUrl = new URL(entry.src, loaderUrl).href;
        global.document.write('<script type="text/javascript" src="' + scriptUrl + '"></script>');
    });
})(typeof window !== 'undefined' ? window : globalThis);