// Structured edition definition:
//   buildBoard()               -> a new complete Board on every call
//   buildCardDecks()           -> { deckId: { label, icon, cards, keepable?, continueTurn? } }
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

	function validateDeckDefinitions(name, cardDecks) {
		if (!cardDecks || typeof cardDecks !== 'object' || Array.isArray(cardDecks)) {
			throw new TypeError('Edition ' + name + ' buildCardDecks() must return a deck map.');
		}
		Object.keys(cardDecks).forEach(function(deckId) {
			var definition = cardDecks[deckId];
			if (!deckId) throw new TypeError('Edition ' + name + ' deck IDs must be nonempty strings.');
			if (!definition || !Array.isArray(definition.cards) || definition.cards.length === 0) {
				throw new TypeError('Edition ' + name + ' deck ' + deckId + ' must provide a nonempty cards[] list.');
			}
			definition.cards.forEach(function(card, index) {
				if (!card || typeof card !== 'object' || typeof card.action !== 'function') {
					throw new TypeError('Edition ' + name + ' deck ' + deckId + ' card ' + index + ' must provide an action function.');
				}
			});
			['keepable', 'continueTurn'].forEach(function(field) {
				var indexes = definition[field] || [];
				if (!Array.isArray(indexes) || indexes.some(function(index, position) {
					return !Number.isInteger(index) || index < 0 || index >= definition.cards.length || indexes.indexOf(index) !== position;
				})) throw new TypeError('Edition ' + name + ' deck ' + deckId + ' has invalid ' + field + ' indexes.');
			});
		});
		return cardDecks;
	}

	function buildValidatedEditionBoard(name, edition, suppliedDecks) {
		var board = validateEditionBoard(edition.buildBoard());
		var cardDecks = validateDeckDefinitions(name, suppliedDecks || edition.buildCardDecks() || {});
		if (board.editionId !== name) {
			throw new TypeError('Edition ' + name + ' buildBoard() must return a Board with matching editionId.');
		}
		Object.keys(board.squaresById).forEach(function(squareId) {
			var square = board.squaresById[squareId];
			if (square.kind === 'card' && !Object.prototype.hasOwnProperty.call(cardDecks, square.deckId)) {
				throw new TypeError('Edition ' + name + ' square ' + squareId + ' references unknown card deck ' + square.deckId + '.');
			}
		});
		return board;
	}

	function register(name, definition) {
		if (!definition || typeof definition.buildBoard !== 'function') {
			throw new Error('Edition ' + name + ' must provide buildBoard().');
		}
		if (typeof definition.buildCardDecks !== 'function') {
			throw new Error('Edition ' + name + ' must provide buildCardDecks().');
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

	function cloneCardDecks(name, definitions) {
		var decks = Object.create(null);
		Object.keys(definitions).forEach(function(deckId) {
			var definition = definitions[deckId];
			var cards = definition.cards.map(function(card, index) {
				var copy = cloneBoardValue(card);
				copy.deckId = deckId;
				copy.cardIndex = index;
				copy.keepable = (definition.keepable || []).indexOf(index) !== -1;
				copy.endsTurn = (definition.continueTurn || []).indexOf(index) === -1;
				return copy;
			});
			decks[deckId] = {
				deckId: deckId, label: definition.label || deckId, icon: definition.icon || '',
				cards: cards, order: cards.map(function(card, index) { return index; }), index: 0
			};
		});
		return decks;
	}

	function buildCardDecksForGame(name) {
		var edition = editions[name];
		if (!edition) throw new RangeError('Unknown Monopoly edition: ' + name);
		return cloneCardDecks(name, validateDeckDefinitions(name, edition.buildCardDecks() || {}));
	}

	function buildGameSetup(name, ruleOverrides) {
		var edition = editions[name];
		if (!edition) throw new RangeError('Unknown Monopoly edition: ' + name);
		var definitions = validateDeckDefinitions(name, edition.buildCardDecks() || {});
		var sourceBoard = buildValidatedEditionBoard(name, edition, definitions);
		var board = cloneBoardValue(sourceBoard);
		board.rules = Object.assign({}, board.rules);
		Object.keys(ruleOverrides || {}).forEach(function(key) {
			if (BOARD_RULE_KEYS.indexOf(key) === -1) throw new RangeError('Unknown Board rule override: ' + key);
			board.rules[key] = ruleOverrides[key];
		});
		validateEditionBoard(board);
		return { board: freezeBoardValue(board), cardDecks: cloneCardDecks(name, definitions) };
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
		buildBoardForGame: buildBoardForGame,
		buildCardDecksForGame: buildCardDecksForGame,
		buildGameSetup: buildGameSetup
	};
})();

if (typeof module !== 'undefined' && module.exports) {
	module.exports = _global.Monopoly.Editions;
}
