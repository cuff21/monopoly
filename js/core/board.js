// Shared, edition-agnostic board data types. Editions use these to build their square/card decks.
// Structured Board API contract (introduced in Phase 2):
// getSquare(board, squareId), getGroup(board, groupId), and
// getGroupSquareIds(board, groupId) resolve stable IDs and throw RangeError for unknown IDs.
// walk(board, squareId, signedSteps) wraps in either direction and returns squareId for zero
// steps. findNext(board, squareId, predicate) passes each visited square to predicate and
// searches forward for one full circuit, returning the matching ID or null. The origin is
// eligible only after the full wrap. A missing group or unknown origin throws RangeError.

// Declarative form, used by editions:
//   new Board({ editionId, rules?, neutralColor?, groups: [...], squares: [...] })
// groups: { id, label, color, rent?, monopolyMultiplier?, presentation? }
//   rent = five rent tiers shared by railroad/utility members; streets use monopolyMultiplier (default 2).
// squares (in board order): { id, kind, group?, label, price?, rent?, houseCost?, tax?, taxPercentOfNetWorth?,
//   text?, onLand?, presentation? }
//   street rent = [base, 1 house, 2, 3, 4, hotel]; railroad/utility rent is inherited from the group.
//   mortgage defaults to half the price. Links, coordinates and group membership are derived, and the
//   resulting Board is validated. The structured form (squaresById/groupsById) is also accepted.
function Board(spec) {
	var declarative = Array.isArray(spec.squares);
	if (declarative) spec = expandBoardDefinition(spec);
	this.editionId = spec.editionId;
	this.startSquareId = spec.startSquareId;
	this.squaresById = Object.assign({}, spec.squaresById || {});
	this.groupsById = Object.assign({}, spec.groupsById || {});
	this.rules = Object.assign({}, spec.rules || {});
	if (declarative) validateBoard(this);
}

function perimeterCoordinates(index, count, squareId) {
	if (count !== 40) throw new TypeError('Square ' + squareId + ' needs explicit presentation x/y for a non-40-square Board.');
	if (index === 0) return { x: 94, y: 94, rotationDegrees: 0 };
	if (index < 10) return { x: 94 - index * 8.5, y: 94, rotationDegrees: 0 };
	if (index === 10) return { x: 6, y: 94, rotationDegrees: 0 };
	if (index < 20) return { x: 6, y: 94 - (index - 10) * 8.5, rotationDegrees: 90 };
	if (index === 20) return { x: 6, y: 6, rotationDegrees: 0 };
	if (index < 30) return { x: 6 + (index - 20) * 8.5, y: 6, rotationDegrees: 180 };
	if (index === 30) return { x: 94, y: 6, rotationDegrees: 0 };
	return { x: 94, y: 6 + (index - 30) * 8.5, rotationDegrees: 270 };
}

function expandBoardDefinition(def) {
	var neutralColor = def.neutralColor || '#FFFFFF';
	var groupDefs = {};
	var groupsById = {};
	var squaresById = {};
	var squares = def.squares;

	(def.groups || []).forEach(function(group) { groupDefs[group.id] = group; });

	squares.forEach(function(square, index) {
		var group = null;
		if (square.group !== undefined) {
			group = groupDefs[square.group];
			if (!group) throw new TypeError('Board ' + def.editionId + ' square ' + square.id + ' references unknown group ' + square.group);
		}
		var rent = square.rent || (group && group.rent) || [];
		var isStreet = square.kind === 'street';
		var price = square.price || 0;
		var rules = {
			purchasePrice: price,
			baseRent: isStreet ? rent[0] : 0,
			rentTiers: isStreet ? rent.slice(1) : rent.slice(),
			mortgageValue: Math.floor(price / 2),
			houseCost: square.houseCost || 0,
			taxAmount: square.tax || 0
		};
		if (square.taxPercentOfNetWorth !== undefined) rules.taxPercentOfNetWorth = square.taxPercentOfNetWorth;

	var presentation = Object.assign({ label: square.label, color: group ? group.color : neutralColor }, square.presentation);
	if (presentation.x === undefined || presentation.y === undefined) Object.assign(presentation, perimeterCoordinates(index, squares.length, square.id));
		if (square.text !== undefined) presentation.priceText = square.text;
		else if (!group) presentation.priceText = '';

		var spec = {
			id: square.id,
			kind: square.kind,
			nextId: squares[(index + 1) % squares.length].id,
			previousId: squares[(index + squares.length - 1) % squares.length].id,
			rules: rules,
			presentation: presentation,
			behavior: square.onLand ? { onLand: square.onLand } : {}
		};
		if (group) spec.groupId = group.id;
		if (square.deckId !== undefined) spec.deckId = square.deckId;
		squaresById[spec.id] = new Square(spec);
	});

	(def.groups || []).forEach(function(group) {
		groupsById[group.id] = new Group({
			groupId: group.id,
			label: group.label,
			presentation: Object.assign({ color: group.color }, group.presentation),
			rules: group.rent
				? { rentTiers: group.rent.slice() }
				: { monopolyMultiplier: group.monopolyMultiplier === undefined ? 2 : group.monopolyMultiplier },
			squareIds: squares.filter(function(square) { return square.group === group.id; }).map(function(square) { return square.id; })
		});
	});

	return {
		editionId: def.editionId,
		startSquareId: 'go',
		squaresById: squaresById,
		groupsById: groupsById,
		rules: Object.assign({ startSalary: 200, houseTotal: 32, hotelTotal: 12, bailAmount: 50 }, def.rules)
	};
}

function Square(spec) {
	if (!spec || typeof spec !== 'object' || typeof spec.id !== 'string' || typeof spec.kind !== 'string') {
		throw new TypeError('Square requires a structured specification with id and kind.');
	}
	Object.assign(this, spec);
}

function Group(spec) {
	Object.assign(this, spec);
}

function getSquare(board, squareId) {
	if (!board || !board.squaresById || !Object.prototype.hasOwnProperty.call(board.squaresById, squareId)) {
		throw new RangeError('Unknown square ID: ' + squareId);
	}
	return board.squaresById[squareId];
}

function getGroup(board, groupId) {
	if (!board || !board.groupsById || !Object.prototype.hasOwnProperty.call(board.groupsById, groupId)) {
		throw new RangeError('Unknown group ID: ' + groupId);
	}
	return board.groupsById[groupId];
}

function getGroupSquareIds(board, groupId) {
	return getGroup(board, groupId).squareIds.slice();
}

function walk(board, squareId, signedSteps) {
	var squareCount = board && board.squaresById ? Object.keys(board.squaresById).length : 0;
	if (!Number.isInteger(signedSteps)) throw new RangeError('Steps must be a signed integer.');
	getSquare(board, squareId);
	if (squareCount === 0) throw new RangeError('Cannot walk an empty board.');
	var steps = signedSteps % squareCount;
	var currentId = squareId;
	while (steps > 0) {
		currentId = getSquare(board, currentId).nextId;
		getSquare(board, currentId);
		steps--;
	}
	while (steps < 0) {
		currentId = getSquare(board, currentId).previousId;
		getSquare(board, currentId);
		steps++;
	}
	return currentId;
}

function findNext(board, squareId, predicate) {
	var squareCount = board && board.squaresById ? Object.keys(board.squaresById).length : 0;
	getSquare(board, squareId);
	if (typeof predicate !== 'function') throw new TypeError('findNext requires a predicate function.');
	var currentId = squareId;
	for (var step = 0; step < squareCount; step++) {
		currentId = getSquare(board, currentId).nextId;
		var square = getSquare(board, currentId);
		if (predicate(square)) return currentId;
	}
	return null;
}

function validateBoard(board) {
	var allowedKinds = ['street', 'railroad', 'utility', 'tax', 'card', 'jail', 'go-to-jail', 'free-parking', 'go'];
	var idPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
	var editionId = board && board.editionId ? board.editionId : 'unknown';

	function fail(entityType, entityId, field, message) {
		throw new TypeError('Invalid Board ' + editionId + ' ' + entityType + ' ' + entityId + ' field ' + field + ': ' + message);
	}

	function isObject(value) {
		return value !== null && typeof value === 'object' && !Array.isArray(value);
	}

	function isFiniteNonnegativeInteger(value) {
		return Number.isFinite(value) && Number.isInteger(value) && value >= 0;
	}

	function requireMoney(entityType, entityId, rules, field) {
		if (!Object.prototype.hasOwnProperty.call(rules, field) || !isFiniteNonnegativeInteger(rules[field])) {
			fail(entityType, entityId, 'rules.' + field, 'expected a finite nonnegative integer dollar value');
		}
	}

	function requireZero(entityType, entityId, rules, field) {
		if (rules[field] !== 0) fail(entityType, entityId, 'rules.' + field, 'must be zero for this square kind');
	}

	function validateTiers(square, monetary) {
		var tiers = square.rules.rentTiers;
		if (!Array.isArray(tiers) || tiers.length !== 5) fail('square', square.id, 'rules.rentTiers', 'expected exactly five rent tiers');
		tiers.forEach(function(tier, index) {
			if (!isFiniteNonnegativeInteger(tier)) {
				fail('square', square.id, 'rules.rentTiers[' + index + ']', monetary
					? 'expected a finite nonnegative integer dollar value'
					: 'expected a finite nonnegative integer dice multiplier');
			}
		});
	}

	if (!isObject(board)) fail('metadata', editionId, 'board', 'expected an object');
	if (typeof board.editionId !== 'string' || !board.editionId.trim()) fail('metadata', editionId, 'editionId', 'expected a nonempty string');
	if (!isObject(board.rules)) fail('metadata', editionId, 'rules', 'expected an object');
	['startSalary', 'houseTotal', 'hotelTotal'].forEach(function(field) {
		if (!Number.isInteger(board.rules[field]) || !Number.isFinite(board.rules[field]) || board.rules[field] <= 0) {
			fail('metadata', editionId, 'rules.' + field, 'expected a positive finite integer');
		}
	});
	if (!Number.isInteger(board.rules.bailAmount) || !Number.isFinite(board.rules.bailAmount) || board.rules.bailAmount < 0) {
		fail('metadata', editionId, 'rules.bailAmount', 'expected a nonnegative finite integer');
	}
	if (!isObject(board.squaresById) || Object.keys(board.squaresById).length === 0) fail('metadata', editionId, 'squaresById', 'expected at least one square');
	if (!isObject(board.groupsById)) fail('metadata', editionId, 'groupsById', 'expected an object');
	if (typeof board.startSquareId !== 'string' || !Object.prototype.hasOwnProperty.call(board.squaresById, board.startSquareId)) {
		fail('metadata', editionId, 'startSquareId', 'must identify a square on the Board');
	}
	if (board.startSquareId !== 'go' || board.squaresById[board.startSquareId].kind !== 'go') {
		fail('metadata', editionId, 'startSquareId', 'must identify the go square');
	}

	var squareIds = Object.keys(board.squaresById);
	var seenIds = Object.create(null);
	squareIds.forEach(function(squareId) {
		var square = board.squaresById[squareId];
		if (!idPattern.test(squareId)) fail('square', squareId, 'id', 'must match the stable ID format');
		if (seenIds[squareId]) fail('square', squareId, 'id', 'must be unique across the Board');
		seenIds[squareId] = true;
		if (!isObject(square)) fail('square', squareId, 'square', 'expected an object');
		if (square.id !== squareId) fail('square', squareId, 'id', 'must match its squaresById key');
		if (allowedKinds.indexOf(square.kind) === -1) fail('square', squareId, 'kind', 'unknown square kind');
		if (square.kind === 'card' && (typeof square.deckId !== 'string' || !square.deckId)) fail('square', squareId, 'deckId', 'card squares must identify a deck');
		if (typeof square.nextId !== 'string' || !Object.prototype.hasOwnProperty.call(board.squaresById, square.nextId)) {
			fail('square', squareId, 'nextId', 'must identify a square on the Board');
		}
		if (typeof square.previousId !== 'string' || !Object.prototype.hasOwnProperty.call(board.squaresById, square.previousId)) {
			fail('square', squareId, 'previousId', 'must identify a square on the Board');
		}
		if (!isObject(square.presentation)) fail('square', squareId, 'presentation', 'expected an object');
		['x', 'y'].forEach(function(field) {
			if (!Number.isFinite(square.presentation[field]) || square.presentation[field] < 0 || square.presentation[field] > 100) {
				fail('square', squareId, 'presentation.' + field, 'expected a finite percentage in [0, 100]');
			}
		});
		if (!Number.isFinite(square.presentation.rotationDegrees)) fail('square', squareId, 'presentation.rotationDegrees', 'expected a finite number');
		if (!isObject(square.rules)) fail('square', squareId, 'rules', 'expected an object');
		['purchasePrice', 'baseRent', 'mortgageValue', 'houseCost', 'taxAmount'].forEach(function(field) {
			requireMoney('square', squareId, square.rules, field);
		});
		if (!Array.isArray(square.rules.rentTiers)) fail('square', squareId, 'rules.rentTiers', 'expected an array');
		if (square.rules.taxPercentOfNetWorth !== undefined) {
			if (square.kind !== 'tax' || !Number.isFinite(square.rules.taxPercentOfNetWorth) || square.rules.taxPercentOfNetWorth <= 0 || square.rules.taxPercentOfNetWorth > 1) {
				fail('square', squareId, 'rules.taxPercentOfNetWorth', 'is valid only on tax squares and must be in (0, 1]');
			}
		}

		if (square.kind === 'street') {
			if (typeof square.groupId !== 'string') fail('square', squareId, 'groupId', 'street squares require a group');
			validateTiers(square, true);
			requireZero('square', squareId, square.rules, 'taxAmount');
		} else if (square.kind === 'railroad') {
			if (typeof square.groupId !== 'string') fail('square', squareId, 'groupId', 'railroad squares require a group');
			validateTiers(square, true);
			requireZero('square', squareId, square.rules, 'baseRent');
			requireZero('square', squareId, square.rules, 'houseCost');
			requireZero('square', squareId, square.rules, 'taxAmount');
		} else if (square.kind === 'utility') {
			if (typeof square.groupId !== 'string') fail('square', squareId, 'groupId', 'utility squares require a group');
			validateTiers(square, false);
			requireZero('square', squareId, square.rules, 'baseRent');
			requireZero('square', squareId, square.rules, 'houseCost');
			requireZero('square', squareId, square.rules, 'taxAmount');
		} else if (square.kind === 'tax') {
			if (square.groupId !== undefined) fail('square', squareId, 'groupId', 'tax squares cannot belong to a group');
			if (square.rules.rentTiers.length !== 0) fail('square', squareId, 'rules.rentTiers', 'must be empty for tax squares');
			['purchasePrice', 'baseRent', 'mortgageValue', 'houseCost'].forEach(function(field) {
				requireZero('square', squareId, square.rules, field);
			});
		} else {
			if (square.groupId !== undefined) fail('square', squareId, 'groupId', 'only purchasable properties may belong to a group');
			if (square.rules.rentTiers.length !== 0) fail('square', squareId, 'rules.rentTiers', 'must be empty for this square kind');
			['purchasePrice', 'baseRent', 'mortgageValue', 'houseCost', 'taxAmount'].forEach(function(field) {
				requireZero('square', squareId, square.rules, field);
			});
		}
	});

	squareIds.forEach(function(squareId) {
		var square = board.squaresById[squareId];
		if (board.squaresById[square.nextId].previousId !== squareId) fail('square', squareId, 'nextId', 'next/previous links must be reciprocal');
		if (board.squaresById[square.previousId].nextId !== squareId) fail('square', squareId, 'previousId', 'previous/next links must be reciprocal');
	});

	var visited = Object.create(null);
	var currentId = board.startSquareId;
	for (var step = 0; step < squareIds.length; step++) {
		if (visited[currentId]) fail('square', currentId, 'nextId', 'traversal forms a cycle that omits Board squares');
		visited[currentId] = true;
		currentId = board.squaresById[currentId].nextId;
	}
	if (currentId !== board.startSquareId || Object.keys(visited).length !== squareIds.length) {
		fail('metadata', editionId, 'squaresById', 'nextId traversal must form one cycle containing every square');
	}
	squareIds.forEach(function(squareId) {
		var square = board.squaresById[squareId];
		if (square.groupId !== undefined && !Object.prototype.hasOwnProperty.call(board.groupsById, square.groupId)) {
			fail('square', squareId, 'groupId', 'references unknown group ' + square.groupId);
		}
	});
	var groupIds = Object.keys(board.groupsById);
	groupIds.forEach(function(groupId) {
		var group = board.groupsById[groupId];
		if (!idPattern.test(groupId)) fail('group', groupId, 'groupId', 'must match the stable ID format');
		if (seenIds[groupId]) fail('group', groupId, 'groupId', 'must be unique across the Board');
		seenIds[groupId] = true;
		if (!isObject(group)) fail('group', groupId, 'group', 'expected an object');
		if (group.groupId !== groupId) fail('group', groupId, 'groupId', 'must match its groupsById key');
		if (typeof group.label !== 'string' || !group.label.trim()) fail('group', groupId, 'label', 'expected a nonempty display label');
		if (!isObject(group.presentation)) fail('group', groupId, 'presentation', 'expected an object');
		if (!isObject(group.rules)) fail('group', groupId, 'rules', 'expected an object');
		if (!Array.isArray(group.squareIds) || group.squareIds.length === 0) fail('group', groupId, 'squareIds', 'expected at least one member square');
		var members = Object.create(null);
		group.squareIds.forEach(function(squareId) {
			if (members[squareId]) fail('group', groupId, 'squareIds', 'duplicate member ' + squareId);
			members[squareId] = true;
			if (!Object.prototype.hasOwnProperty.call(board.squaresById, squareId)) fail('group', groupId, 'squareIds', 'unknown member ' + squareId);
			var square = board.squaresById[squareId];
			if (square.groupId !== groupId) fail('group', groupId, 'squareIds', 'member ' + squareId + ' does not reference this group');
		});
		var firstMember = board.squaresById[group.squareIds[0]];
		group.squareIds.forEach(function(squareId) {
			if (board.squaresById[squareId].kind !== firstMember.kind) fail('group', groupId, 'squareIds', 'members must share a square kind');
		});
		if (firstMember.kind === 'street') {
			if (!Number.isFinite(group.rules.monopolyMultiplier) || group.rules.monopolyMultiplier < 0) {
				fail('group', groupId, 'rules.monopolyMultiplier', 'street groups require a finite nonnegative monopoly multiplier');
			}
		} else {
			if (!Array.isArray(group.rules.rentTiers) || group.rules.rentTiers.length !== 5) {
				fail('group', groupId, 'rules.rentTiers', 'railroad and utility groups require five rent tiers');
			}
			var expectedTiers = firstMember.rules.rentTiers;
			if (JSON.stringify(group.rules.rentTiers) !== JSON.stringify(expectedTiers)) {
				fail('group', groupId, 'rules.rentTiers', 'must match member square rent tiers');
			}
			group.squareIds.forEach(function(squareId) {
				if (JSON.stringify(board.squaresById[squareId].rules.rentTiers) !== JSON.stringify(expectedTiers)) {
					fail('group', groupId, 'squareIds', 'members must share a rent schedule');
				}
			});
		}
	});

	squareIds.forEach(function(squareId) {
		var square = board.squaresById[squareId];
		if (square.groupId !== undefined && !Object.prototype.hasOwnProperty.call(board.groupsById, square.groupId)) {
			fail('square', squareId, 'groupId', 'references unknown group ' + square.groupId);
		}
		if (square.groupId !== undefined && board.groupsById[square.groupId].squareIds.indexOf(squareId) === -1) {
			fail('square', squareId, 'groupId', 'is not included in the referenced group squareIds');
		}
	});

	return board;
}

function Card(text, action) {
	this.text = text;
	this.action = action;
}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Square = Square;
_global.Board = Board;
_global.Group = Group;
_global.Card = Card;
_global.getSquare = getSquare;
_global.getGroup = getGroup;
_global.getGroupSquareIds = getGroupSquareIds;
_global.walk = walk;
_global.findNext = findNext;
_global.validateBoard = validateBoard;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		Board: Board,
		Square: Square,
		Group: Group,
		getSquare: getSquare,
		getGroup: getGroup,
		getGroupSquareIds: getGroupSquareIds,
		walk: walk,
		findNext: findNext,
		validateBoard: validateBoard,
		Card: Card
	};
}
