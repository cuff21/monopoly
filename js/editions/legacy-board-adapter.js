(function(global) {
	'use strict';

	function coordinatesForIndex(index) {
	if (index === 0) return { x: 94, y: 94, rotationDegrees: 0 };
	if (index < 10) return { x: 94 - index * 8.5, y: 94, rotationDegrees: 0 };
	if (index === 10) return { x: 6, y: 94, rotationDegrees: 0 };
	if (index < 20) return { x: 6, y: 94 - (index - 10) * 8.5, rotationDegrees: 90 };
	if (index === 20) return { x: 6, y: 6, rotationDegrees: 0 };
	if (index < 30) return { x: 6 + (index - 20) * 8.5, y: 6, rotationDegrees: 180 };
	if (index === 30) return { x: 94, y: 6, rotationDegrees: 0 };
	return { x: 94, y: 6 + (index - 30) * 8.5, rotationDegrees: 270 };
	}

	function getRentTiers(legacyGroup, groupNumber) {
	var rentRule = legacyGroup.rules && legacyGroup.rules.rentRule;
	var tiers = rentRule && Array.isArray(rentRule.tiers) ? rentRule.tiers.slice() : [];
	if (groupNumber === 1 && tiers.length === 4) tiers.push(tiers[3] * 2);
	while (tiers.length > 0 && tiers.length < 5) tiers.push(tiers[tiers.length - 1]);
	return tiers.slice(0, 5);
	}

	function squareKind(square, squareId) {
	if (squareId === 'go') return 'go';
	if (squareId === 'jail') return 'jail';
	if (squareId === 'free-parking') return 'free-parking';
	if (squareId === 'go-to-jail') return 'go-to-jail';
	if (squareId.indexOf('chance-') === 0) return 'chance';
	if (squareId.indexOf('community-chest-') === 0) return 'community-chest';
	if (squareId === 'city-tax' || squareId === 'luxury-tax') return 'tax';
	if (square.groupNumber === 1) return 'railroad';
	if (square.groupNumber === 2) return 'utility';
	return 'street';
	}

	function buildBoard(editionId, legacyGroups, legacySquares, catalog, options) {
		options = options || {};
		var Board = global.Board;
		var Square = global.Square;
		var Group = global.Group;
		if (!Board || !Square || !Group) throw new Error('Board constructors must load before edition builders.');
		if (!catalog || legacySquares.length !== catalog.squareIds.length) throw new Error('Missing or incomplete canonical board ID catalog for ' + editionId + '.');

		var groupsById = {};
		var squaresById = {};
		var groupIdByNumber = {};
		catalog.groupIds.forEach(function(groupId, index) {
			groupIdByNumber[index + 1] = groupId;
		});

		catalog.groupIds.forEach(function(groupId, index) {
			var groupNumber = index + 1;
			var legacyGroup = legacyGroups[groupNumber];
			var memberIds = [];
			legacySquares.forEach(function(square, squareIndex) {
				if (square.groupNumber === groupNumber) memberIds.push(catalog.squareIds[squareIndex]);
			});
			var kind = groupNumber === 1 ? 'railroad' : groupNumber === 2 ? 'utility' : 'street';
			var tiers = getRentTiers(legacyGroup, groupNumber);
			var rentRule = legacyGroup.rules && legacyGroup.rules.rentRule;
			groupsById[groupId] = new Group({
				groupId: groupId,
				label: legacyGroup.groupName,
				presentation: {
					color: legacyGroup.groupColor,
					tokenImage: legacyGroup.presentation && legacyGroup.presentation.tokenImage,
					rentText: legacyGroup.presentation && legacyGroup.presentation.rentText
				},
				rules: kind === 'street'
					? { monopolyMultiplier: rentRule && rentRule.monopolyMultiplier !== undefined ? rentRule.monopolyMultiplier : 2 }
					: { monopolyMultiplier: 1, rentTiers: tiers },
				squareIds: memberIds
			});
		});

		legacySquares.forEach(function(legacySquare, index) {
			var squareId = catalog.squareIds[index];
			var kind = squareKind(legacySquare, squareId);
			var groupId = legacySquare.groupNumber ? groupIdByNumber[legacySquare.groupNumber] : undefined;
			var purchasePrice = legacySquare.price || 0;
			var rentTiers = [];
			var baseRent = legacySquare.baserent || 0;
			var houseCost = legacySquare.houseprice || 0;
			if (kind === 'street') {
				rentTiers = [legacySquare.rent1, legacySquare.rent2, legacySquare.rent3, legacySquare.rent4, legacySquare.rent5];
			} else if (kind === 'railroad' || kind === 'utility') {
				rentTiers = groupsById[groupId].rules.rentTiers.slice();
				baseRent = 0;
				houseCost = 0;
			}

			var rules = {
				purchasePrice: kind === 'street' || kind === 'railroad' || kind === 'utility' ? purchasePrice : 0,
				baseRent: kind === 'street' ? baseRent : 0,
				rentTiers: rentTiers,
				mortgageValue: kind === 'street' || kind === 'railroad' || kind === 'utility' ? Math.floor(purchasePrice / 2) : 0,
				houseCost: kind === 'street' ? houseCost : 0,
				taxAmount: kind === 'tax' ? options.taxAmountById[squareId] : 0
			};
			if (kind === 'tax' && options.taxPercentById && options.taxPercentById[squareId] !== undefined) {
				rules.taxPercentOfNetWorth = options.taxPercentById[squareId];
			}
			var display = legacySquare.display || {};
			var spec = {
				id: squareId,
				kind: kind,
				nextId: catalog.squareIds[(index + 1) % catalog.squareIds.length],
				previousId: catalog.squareIds[(index + catalog.squareIds.length - 1) % catalog.squareIds.length],
				rules: rules,
				presentation: Object.assign({
					label: legacySquare.name,
					priceText: legacySquare.pricetext,
					color: legacySquare.color,
					boardName: display.boardName,
					tokenImage: display.tokenImage,
					rentText: display.rentText
				}, coordinatesForIndex(index)),
				behavior: legacySquare.onLand ? { onLand: legacySquare.onLand } : {}
			};
			if (groupId) spec.groupId = groupId;
			squaresById[squareId] = new Square(spec);
		});

		return new Board({
			editionId: editionId,
			startSquareId: 'go',
			squaresById: squaresById,
			groupsById: groupsById,
			rules: { startSalary: 200, houseTotal: 32, hotelTotal: 12, bailAmount: 50 }
		});
	}

	var adapter = { buildBoard: buildBoard };
	global.LegacyBoardAdapter = adapter;
	if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof window !== 'undefined' ? window : globalThis);