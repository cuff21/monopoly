// Computes the rent a property would currently charge, for board hover tooltips.
function calculateGroupProfileRent(property, squares) {
	var profile = property.groupProfile;
	if (typeof profile.calculateRent === "function") {
		return profile.calculateRent(property, squares);
	}

	var rule = profile.rentRule;
	if (!rule) return null;
	if (rule.mode === "colorGroup") {
		if (property.house > 0) {
			return property.house === 5 ? property.rent5 : property["rent" + property.house];
		}
		var ownsGroup = property.owner !== 0 && property.group && property.group.every(function(index) {
			return squares[index] && squares[index].owner === property.owner;
		});
		return ownsGroup ? property.baserent * rule.monopolyMultiplier : property.baserent;
	}
	if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) return null;

	var ownedCount = property.owner === 0 ? 0 : (property.group || []).filter(function(index) {
		return squares[index] && squares[index].owner === property.owner;
	}).length;
	var tierIndex = Math.min(rule.tiers.length - 1, Math.max(0, ownedCount - 1));
	var rent = rule.tiers[tierIndex];
	return rule.mode === "diceMultiplier" ? { type: "diceMultiplier", multiplier: rent } : rent;
}

function getCurrentRent(property) {
	var sq = square[property];
	if (!sq || !sq.price || sq.mortgage) {
		return null;
	}

	if (sq.groupProfile) {
		var profileRent = calculateGroupProfileRent(sq, square);
		if (profileRent !== null) return profileRent;
	}

	var ownsGroup = sq.owner !== 0 && sq.group && sq.group.every(function(index) { return square[index].owner === sq.owner; });
	if (sq.house > 0) {
		return sq.house === 5 ? sq.rent5 : sq["rent" + sq.house];
	}
	return ownsGroup ? sq.baserent * 2 : sq.baserent;
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = getCurrentRent;
}
