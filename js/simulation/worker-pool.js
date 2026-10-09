(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('./ai-adapter-registry') : null);
    function SimulationWorkerPool(workerCount, workerUrl, WorkerConstructor, timeoutMs, maxRetries) {
        this.WorkerConstructor = WorkerConstructor || global.Worker;
        if (typeof this.WorkerConstructor !== 'function') throw new Error('Web Workers are unavailable.');
        if (!workerUrl) throw new Error('A worker entry URL is required.');
        this.workerUrl = workerUrl;
        this.timeoutMs = timeoutMs === undefined ? 30000 : timeoutMs;
        this.maxRetries = maxRetries === undefined ? 1 : maxRetries;
        if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) throw new TypeError('Worker timeout must be a positive integer.');
        if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0) throw new TypeError('Worker retry count must be a non-negative integer.');
        this.queue = [];
        this.slots = [];
        this.nextId = 1;
        this.terminated = false;

        for (var i = 0; i < workerCount; i++) {
            var slot = { worker: new this.WorkerConstructor(this.workerUrl), currentJob: null, timeoutId: null };
            this.attachWorkerHandlers(slot);
            this.slots.push(slot);
        }
    }

    SimulationWorkerPool.prototype.attachWorkerHandlers = function(slot) {
        var self = this;
        slot.worker.onmessage = function(event) {
            var job = slot.currentJob;
            if (!job || event.data.id !== job.id) return;
            clearTimeout(slot.timeoutId);
            slot.timeoutId = null;
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
            clearTimeout(slot.timeoutId);
            slot.timeoutId = null;
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
                retries: 0,
                resolve: resolve,
                reject: reject
            });
            self.dispatch();
        });
    };

    SimulationWorkerPool.prototype.dispatch = function() {
		var self = this;
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
                    playerCount: job.setup.playerCount,
                    boardRuleOverrides: job.setup.boardRuleOverrides,
                    seed: job.setup.seed
                }]
            });
            slot.timeoutId = setTimeout(function() {
                self.handleTimeout(slot);
            }, this.timeoutMs);
        }
    };

    SimulationWorkerPool.prototype.handleTimeout = function(slot) {
        var job = slot.currentJob;
        if (!job || this.terminated) return;

        slot.timeoutId = null;
        slot.currentJob = null;
        slot.worker.terminate();

        if (job.retries < this.maxRetries) {
            job.retries++;
            try {
                slot.worker = new this.WorkerConstructor(this.workerUrl);
                this.attachWorkerHandlers(slot);
                this.queue.unshift(job);
                this.dispatch();
            } catch (error) {
                job.reject(error);
                this.terminate();
            }
            return;
        }

        job.reject(new Error('Simulation worker timed out after ' + this.timeoutMs + ' ms and ' + job.retries + ' retries.'));
        this.terminate();
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
            clearTimeout(slot.timeoutId);
            slot.timeoutId = null;
            if (slot.currentJob) slot.currentJob.reject(error);
            slot.currentJob = null;
            slot.worker.terminate();
        });
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = SimulationWorkerPool;
    global.SimulationWorkerPool = SimulationWorkerPool;
})(typeof window !== 'undefined' ? window : globalThis);