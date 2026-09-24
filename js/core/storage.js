// Browser storage adapter for game history. Keeps persistence and validation in one place.
(function(global) {
    var HISTORY_KEY = 'gameHistory';

    function getStorage() {
        try {
            return global.localStorage || null;
        } catch (error) {
            return null;
        }
    }

    function parseHistory(value) {
        if (!value) {
            return [];
        }

        try {
            var parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function getHistory() {
        var storage = getStorage();
        if (!storage) {
            return [];
        }

        try {
            return parseHistory(storage.getItem(HISTORY_KEY));
        } catch (error) {
            return [];
        }
    }

    function saveHistory(history) {
        if (!Array.isArray(history)) {
            return false;
        }

        var storage = getStorage();
        if (!storage) {
            return false;
        }

        try {
            storage.setItem(HISTORY_KEY, JSON.stringify(history));
            return true;
        } catch (error) {
            return false;
        }
    }

    function appendResults(results) {
        if (!Array.isArray(results)) {
            return false;
        }

        var history = getHistory();
        history.push(results);
        return saveHistory(history);
    }

    function importHistory(value) {
        var history;
        try {
            history = JSON.parse(value || '[]');
        } catch (error) {
            return false;
        }
        if (!Array.isArray(history)) {
            return false;
        }
        return saveHistory(history);
    }

    function exportHistory() {
        return JSON.stringify(getHistory());
    }

    var GameStorage = {
        getHistory: getHistory,
        saveHistory: saveHistory,
        appendResults: appendResults,
        importHistory: importHistory,
        exportHistory: exportHistory
    };

    global.GameStorage = GameStorage;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = GameStorage;
    }
})(typeof window !== 'undefined' ? window : globalThis);
