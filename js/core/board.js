// Shared, edition-agnostic board data types. Editions use these to build their square/card decks.

function Square(spec) {
	var rules = spec.rules || {};
	var presentation = spec.presentation || {};
	var behavior = spec.behavior || {};
	var rentTiers = rules.rentTiers || [];
	this.name = spec.name;
	this.pricetext = presentation.priceText || "";
	this.color = presentation.color;
	this.owner = 0;
	this.mortgage = false;
	this.house = 0;
	this.hotel = 0;
	this.groupNumber = rules.groupNumber || 0;
	this.price = rules.price || 0;
	this.baserent = rules.baseRent || 0;
	this.rent1 = rentTiers[0] || 0;
	this.rent2 = rentTiers[1] || 0;
	this.rent3 = rentTiers[2] || 0;
	this.rent4 = rentTiers[3] || 0;
	this.rent5 = rentTiers[4] || 0;
	this.landcount = 0;
	this.groupName = spec.groupName || null;
	this.display = {
		boardName: presentation.boardName,
		tokenImage: presentation.tokenImage,
		rentText: presentation.rentText
	};
	this.groupProfile = behavior.groupProfile || null;
	this.onLand = behavior.onLand || null;

	if (this.groupNumber === 3 || this.groupNumber === 4) {
		this.houseprice = 50;
	} else if (this.groupNumber === 5 || this.groupNumber === 6) {
		this.houseprice = 100;
	} else if (this.groupNumber === 7 || this.groupNumber === 8) {
		this.houseprice = 150;
	} else if (this.groupNumber === 9 || this.groupNumber === 10) {
		this.houseprice = 200;
	} else {
		this.houseprice = 0;
	}
}

Square.applyGroupDefinitions = function(squares, groups) {
	squares.forEach(function(square) {
		var group = groups[square.groupNumber];
		if (!group) return;
		var squareDisplay = {};
		Object.keys(square.display).forEach(function(key) {
			if (typeof square.display[key] !== "undefined") squareDisplay[key] = square.display[key];
		});

		square.groupName = square.groupName || group.groupName;
		square.color = square.color || group.groupColor;
		if (!square.pricetext) {
			var priceText = group.presentation.priceText;
			square.pricetext = typeof priceText === "function" ? priceText(square.price) : priceText;
		}
		square.display = Object.assign({}, group.presentation, squareDisplay);
		delete square.display.priceText;
		square.groupProfile = square.groupProfile || group.rules;
	});
	return squares;
};

function Card(text, action) {
	this.text = text;
	this.action = action;
}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.Square = Square;
_global.Card = Card;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		Square: Square,
		Card: Card
	};
}
