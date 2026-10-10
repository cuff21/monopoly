// Computes current property rent from one Game's structured Board and ID-keyed state.
function getCurrentRent(game, squareId) {
	if (!game || !game.state || !game.state.board || !game.state.squareStateById) {
		throw new TypeError('Rent calculation requires a structured Game.');
	}
	var board = game.state.board;
	var square = getSquare(board, squareId);
	var state = game.state.squareStateById[squareId];
	if (!square.rules.purchasePrice || state.mortgage || !square.groupId) return null;
	var group = getGroup(board, square.groupId);
	var members = group.squareIds.map(function(id) { return game.state.squareStateById[id]; });
	if (square.kind === 'street') {
		if (state.house > 0) return square.rules.rentTiers[state.house - 1];
		var monopoly = state.ownerId !== null && members.every(function(member) { return member.ownerId === state.ownerId; });
		return square.rules.baseRent * (monopoly ? (group.rules.monopolyMultiplier || 2) : 1);
	}
	var ownedCount = state.ownerId === null ? 0 : members.filter(function(member) { return member.ownerId === state.ownerId; }).length;
	var tiers = group.rules.rentTiers || [];
	if (!tiers.length) return null;
	var rent = tiers[Math.min(tiers.length - 1, Math.max(0, ownedCount - 1))];
	return square.kind === 'utility' ? { type: 'diceMultiplier', multiplier: rent } : rent;
}

if (typeof module !== 'undefined' && module.exports) module.exports = getCurrentRent;
