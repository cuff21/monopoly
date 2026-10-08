/**
 * Shared Simulation Worker
 * Supports parallel headless execution in:
 * 1. Web Workers (browser background threads)
 * 2. Node.js Worker Threads (multi-core server/training)
 */
(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('./ai-adapter-registry') : null);

    function createWorkerMessageHandler(sendMessage) {
        var activeMessageId = null;
        var responseSent = false;

        return {
            handle: async function(message) {
                activeMessageId = message.id;
                responseSent = false;
                try {
                    var result = await processBatch(message);
                    if (!responseSent) {
                        responseSent = true;
                        sendMessage({ id: message.id, success: true, result: result });
                    }
                } catch (error) {
                    if (!responseSent) {
                        responseSent = true;
                        sendMessage({ id: message.id, success: false, error: error.message });
                    }
                } finally {
                    if (activeMessageId === message.id) activeMessageId = null;
                }
            },
            handleUnhandledRejection: function(reason) {
                if (activeMessageId === null || responseSent) return false;
                responseSent = true;
                sendMessage({
                    id: activeMessageId,
                    success: false,
                    error: reason && reason.message ? reason.message : String(reason)
                });
                return true;
            }
        };
    }

    var isNode = (typeof process !== 'undefined' && process.versions && process.versions.node);
    var SimBoard;
    if (isNode) {
        var SimModule = require('./match-runner');
        SimBoard = SimModule.SimBoard;

        try {
            var workerThreads = require('worker_threads');
            if (workerThreads.parentPort) {
                var messageHandler = createWorkerMessageHandler(function(message) {
                    workerThreads.parentPort.postMessage(message);
                });
                process.on('unhandledRejection', messageHandler.handleUnhandledRejection);
                workerThreads.parentPort.on('message', messageHandler.handle);
            }
        } catch (e) {
            // Not running as a worker thread
        }
    } else {
        SimBoard = global.SimBoard || null;

        if (typeof global.postMessage === 'function') {
            var messageHandler = createWorkerMessageHandler(function(message) {
                global.postMessage(message);
            });
            global.addEventListener('unhandledrejection', function(event) {
                if (messageHandler.handleUnhandledRejection(event.reason)) event.preventDefault();
            });
            global.onmessage = function(event) { messageHandler.handle(event.data); };
        }
    }

    /**
     * Executes a batch of simulation matches.
     * @param {Object} data
    * @param {Array<Object>} data.matches - Array of match payloads with adapter-serialized contestants and match settings.
     * @returns {Promise<Array<Object>>} Match results
     */
    async function processBatch(data) {
        var matches = data.matches || [];
        var results = [];

        for (var i = 0; i < matches.length; i++) {
            var match = matches[i];
            var contestants = (match.contestants || []).map(function(contestant) {
                return SimulationAdapters.deserialize(contestant);
            });
            var board = new SimBoard(contestants, match.maxTurns || 120, {
                edition: match.edition,
                playerCount: match.playerCount
            });
            var matchRes = await board.run();
            results.push({
                matchIndex: i,
                results: matchRes
            });
        }

        return results;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            processBatch: processBatch,
            createWorkerMessageHandler: createWorkerMessageHandler
        };
    }
})(typeof self !== 'undefined' ? self : globalThis);
