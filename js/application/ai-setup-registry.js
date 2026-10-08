(function(global) {
	'use strict';

	var entries = Object.create(null);
	var defaultId = null;
	var defaultPriority = -Infinity;

	function register(definition) {
		if (!definition || typeof definition.id !== 'string' || !definition.id ||
			typeof definition.label !== 'string' || !definition.label ||
			typeof definition.createPlayer !== 'function') {
			throw new TypeError('An AI setup registration requires an id, label, and createPlayer function.');
		}
		if (entries[definition.id]) {
			throw new Error('An AI setup registration already exists for id: ' + definition.id);
		}
		if (definition.defaultPriority !== undefined &&
			(!Number.isInteger(definition.defaultPriority) || definition.defaultPriority < 0)) {
			throw new TypeError('An AI setup defaultPriority must be a non-negative integer.');
		}
		entries[definition.id] = definition;
		if (definition.defaultPriority > defaultPriority) {
			defaultId = definition.id;
			defaultPriority = definition.defaultPriority;
		}
		return definition;
	}

	function getProfiles(definition) {
		if (!definition) return [];
		var profiles = typeof definition.profiles === 'function' ? definition.profiles() : definition.profiles;
		return Array.isArray(profiles) ? profiles.slice() : [];
	}

	var registry = {
		register: register,
		get: function(id) { return entries[id] || null; },
		list: function() {
			return Object.keys(entries).map(function(id) {
				var definition = entries[id];
				return { id: id, label: definition.label, profiles: getProfiles(definition) };
			});
		},
		getProfiles: function(id) { return getProfiles(entries[id]); },
		getDefaultId: function() { return defaultId; }
	};

	global.AISetupRegistry = registry;
	if (typeof module !== 'undefined' && module.exports) module.exports = registry;
})(typeof window !== 'undefined' ? window : globalThis);
