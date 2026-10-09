// Edition registry. The current pre-migration interface uses buildGroups/buildSquares;
// Phase 2 replaces it with the required structured contract below.
//
// Structured edition definition:
//   buildBoard()               -> a new complete Board on every call
//   buildCommunityChestCards() -> ordered Card[]
//   buildChanceCards()         -> ordered Card[]
// Registration validates and discards one fresh Board. Each Game builds and validates its
// own Board; function-bearing behavior stays local to that Game.

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Monopoly = _global.Monopoly || {};
if (typeof _global.validateBoard !== 'function' && typeof module !== 'undefined' && module.exports) require('../core/board');

var validateEditionBoard = _global.validateBoard;

_global.Monopoly.Editions = (function() {
	var editions = {};
	var activeName = null;
	var BOARD_RULE_KEYS = ['startSalary', 'bailAmount', 'houseTotal', 'hotelTotal'];

	function cloneBoardValue(value) {
		if (typeof value === 'function' || value === null || typeof value !== 'object') return value;
		if (Array.isArray(value)) return value.map(cloneBoardValue);
		var copy = {};
		Object.keys(value).forEach(function(key) { copy[key] = cloneBoardValue(value[key]); });
		return copy;
	}

	function freezeBoardValue(value, seen) {
		if (value === null || typeof value !== 'object') return value;
		seen = seen || [];
		if (seen.indexOf(value) !== -1) return value;
		seen.push(value);
		Object.keys(value).forEach(function(key) { freezeBoardValue(value[key], seen); });
		return Object.freeze(value);
	}

	function buildValidatedEditionBoard(name, edition) {
		var board = validateEditionBoard(edition.buildBoard());
		if (board.editionId !== name) {
			throw new TypeError('Edition ' + name + ' buildBoard() must return a Board with matching editionId.');
		}
		return board;
	}

	function register(name, definition) {
		if (!definition || typeof definition.buildBoard !== 'function') {
			throw new Error('Edition ' + name + ' must provide buildBoard().');
		}
		if (typeof definition.buildCommunityChestCards !== 'function' || typeof definition.buildChanceCards !== 'function') {
			throw new Error('Edition ' + name + ' must provide buildCommunityChestCards() and buildChanceCards().');
		}
		buildValidatedEditionBoard(name, definition);
		editions[name] = definition;
		if (activeName === null) activeName = name;
	}

	function buildBoardForGame(name, ruleOverrides) {
		var edition = editions[name];
		if (!edition) throw new RangeError('Unknown Monopoly edition: ' + name);
		var sourceBoard = buildValidatedEditionBoard(name, edition);
		var board = cloneBoardValue(sourceBoard);
		board.rules = Object.assign({}, board.rules);
		Object.keys(ruleOverrides || {}).forEach(function(key) {
			if (BOARD_RULE_KEYS.indexOf(key) === -1) throw new RangeError('Unknown Board rule override: ' + key);
			board.rules[key] = ruleOverrides[key];
		});
		validateEditionBoard(board);
		return freezeBoardValue(board);
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

	return {
		register: register,
		get: get,
		getActive: getActive,
		setActive: setActive,
		getActiveName: getActiveName,
		getNames: getNames,
		buildBoardForGame: buildBoardForGame
	};
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = _global.Monopoly.Editions;
}
