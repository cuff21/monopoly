// Formal plugin interface for board "editions". Exactly one edition script should be included
// in index.html (comment/uncomment to switch); whichever one registers becomes the active edition.
//
// A definition must provide:
//   buildGroups()              -> GroupDefinition[]
//   buildSquares(groups?)       -> Square[40]
//   buildCommunityChestCards() -> Card[16]
//   buildChanceCards()         -> Card[16]

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Monopoly = _global.Monopoly || {};

_global.Monopoly.Editions = (function() {
	var editions = {};
	var activeName = null;

	function register(name, definition) {
		if (!definition || typeof definition.buildGroups !== 'function') {
			throw new Error('Edition ' + name + ' must provide buildGroups().');
		}
		editions[name] = definition;
		if (activeName === null) activeName = name;
	}

	function getActive() {
		return editions[getActiveName()];
	}

	function setActive(name) {
		if (!editions[name]) return false;
		activeName = name;
		return true;
	}

	function getActiveName() {
		return activeName;
	}

	function get(name) {
		return editions[name] || null;
	}

	function getNames() {
		return Object.keys(editions);
	}

	return { register: register, get: get, getActive: getActive, setActive: setActive, getActiveName: getActiveName, getNames: getNames };
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = _global.Monopoly.Editions;
}
