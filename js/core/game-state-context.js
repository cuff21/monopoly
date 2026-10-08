(function(global) {
	'use strict';

	var AsyncLocalStorage = null;
	if (typeof module !== 'undefined' && module.exports) {
		try {
			AsyncLocalStorage = require('async_hooks').AsyncLocalStorage;
		} catch (error) {
			AsyncLocalStorage = null;
		}
	}

	var storage = AsyncLocalStorage ? new AsyncLocalStorage() : null;
	var defaultState = {};
	var browserState = null;
	var browserQueue = Promise.resolve();

	function currentState() {
		return (storage && storage.getStore()) || browserState || defaultState;
	}

	function install(target, initialState) {
		defaultState = Object.assign({}, initialState);
		Object.keys(defaultState).forEach(function(key) {
			Object.defineProperty(target, key, {
				configurable: true,
				enumerable: true,
				get: function() {
					var state = currentState();
					return state && Object.prototype.hasOwnProperty.call(state, key) ? state[key] : defaultState[key];
				},
				set: function(value) {
					var state = currentState();
					state[key] = value;
				}
			});
		});
	}

	function createState(overrides) {
		var base = currentState();
		var state = {};
		Object.keys(base).forEach(function(key) {
			state[key] = Array.isArray(base[key]) ? base[key].slice() : base[key];
		});
		return Object.assign(state, overrides || {});
	}

	function run(state, callback) {
		if (storage) return storage.run(state, callback);

		var result = browserQueue.then(function() {
			browserState = state;
			return Promise.resolve().then(callback).finally(function() {
				browserState = null;
			});
		});
		browserQueue = result.catch(function() {});
		return result;
	}

	var GameStateContext = {
		install: install,
		createState: createState,
		run: run,
		getCurrentState: currentState
	};

	global.GameStateContext = GameStateContext;
	if (typeof module !== 'undefined' && module.exports) module.exports = GameStateContext;
})(typeof window !== 'undefined' ? window : globalThis);