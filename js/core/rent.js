// Computes the rent a property would currently charge, for board hover tooltips.
function getCurrentRent(property) {
	var sq = square[property];
	if (!sq || !sq.price || sq.mortgage) {
		return null;
	}

	if (sq.groupNumber === 1) {
		var railroads = [5, 15, 25, 35].filter(function(index) { return square[index].owner === sq.owner && sq.owner !== 0; }).length;
		return railroads ? 25 * Math.pow(2, railroads - 1) : 25;
	}
	if (sq.groupNumber === 2) {
		var utilities = [12, 28].filter(function(index) { return square[index].owner === sq.owner && sq.owner !== 0; }).length;
		return utilities === 2 ? "10x dice" : "4x dice";
	}

	var ownsGroup = sq.owner !== 0 && sq.group.every(function(index) { return square[index].owner === sq.owner; });
	if (sq.house > 0) {
		return sq.house === 5 ? sq.rent5 : sq["rent" + sq.house];
	}
	return ownsGroup ? sq.baserent * 2 : sq.baserent;
}
