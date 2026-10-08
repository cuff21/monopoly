(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('./ai-adapter-registry') : null);
    function SimulationWorkerPool(workerCount, workerUrl, WorkerConstructor) {
        this.WorkerConstructor = WorkerConstructor || global.Worker;
        if (typeof this.WorkerConstructor !== 'function') throw new Error('Web Workers are unavailable.');
        if (!workerUrl) throw new Error('A worker entry URL is required.');
        this.workerUrl = workerUrl;
        this.queue = [];
        this.slots = [];
        this.nextId = 1;
        this.terminated = false;

        for (var i = 0; i < workerCount; i++) {
            var slot = { worker: new this.WorkerConstructor(this.workerUrl), currentJob: null };
            this.attachWorkerHandlers(slot);
            this.slots.push(slot);
        }
    }

    SimulationWorkerPool.prototype.attachWorkerHandlers = function(slot) {
        var self = this;
        slot.worker.onmessage = function(event) {
            var job = slot.currentJob;
            if (!job || event.data.id !== job.id) return;
            slot.currentJob = null;
            if (event.data.success) {
                var match = event.data.result && event.data.result[0];
                job.resolve(match ? match.results : []);
            } else {
                job.reject(new Error(event.data.error || 'Simulation worker failed.'));
            }
            self.dispatch();
        };
        slot.worker.onerror = function(event) {
            var job = slot.currentJob;
            slot.currentJob = null;
            if (job) job.reject(new Error(event.message || 'Simulation worker crashed.'));
            self.dispatch();
        };
    };

    SimulationWorkerPool.prototype.runMatch = function(contestants, maxTurns, setup) {
        var self = this;
        if (this.terminated) return Promise.reject(new Error('Simulation worker pool is closed.'));
        return new Promise(function(resolve, reject) {
            self.queue.push({
                id: self.nextId++,
                contestants: contestants.map(function(contestant) {
                    return SimulationAdapters.serialize(contestant);
                }),
                maxTurns: maxTurns,
                setup: setup || {},
                resolve: resolve,
                reject: reject
            });
            self.dispatch();
        });
    };

    SimulationWorkerPool.prototype.dispatch = function() {
        if (this.terminated) return;
        for (var i = 0; i < this.slots.length && this.queue.length > 0; i++) {
            var slot = this.slots[i];
            if (slot.currentJob) continue;
            var job = this.queue.shift();
            slot.currentJob = job;
            slot.worker.postMessage({
                id: job.id,
                matches: [{
                    contestants: job.contestants,
                    maxTurns: job.maxTurns,
                    edition: job.setup.edition,
                    playerCount: job.setup.playerCount
                }]
            });
        }
    };

    SimulationWorkerPool.prototype.getStats = function() {
        return {
            workers: this.slots.length,
            active: this.slots.filter(function(slot) { return slot.currentJob; }).length,
            queued: this.queue.length
        };
    };

    SimulationWorkerPool.prototype.terminate = function() {
        if (this.terminated) return;
        this.terminated = true;
        var error = new Error('Simulation worker pool was terminated.');
        this.queue.splice(0).forEach(function(job) { job.reject(error); });
        this.slots.forEach(function(slot) {
            if (slot.currentJob) slot.currentJob.reject(error);
            slot.currentJob = null;
            slot.worker.terminate();
        });
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = SimulationWorkerPool;
    global.SimulationWorkerPool = SimulationWorkerPool;
})(typeof window !== 'undefined' ? window : globalThis);