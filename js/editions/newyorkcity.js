// New York City edition with tax choices and card actions routed through the shared game/UI APIs.
(function(global) {
	if (!global.Board && typeof module !== 'undefined' && module.exports) require('../core/board');
	var LegacyBoardAdapter = global.LegacyBoardAdapter || (typeof module !== 'undefined' && module.exports ? require('./legacy-board-adapter') : null);
	var BoardIdCatalogs = global.BoardIdCatalogs || (typeof module !== 'undefined' && module.exports ? require('./board-id-catalogs') : null);
	var utilityRentTiers = [4, 10];
	var transitRentTiers = [25, 50, 100, 200];
	var colorGroupRentRule = { mode: "colorGroup", monopolyMultiplier: 2 };

	function formatPrice(price) {
		return "$" + price;
	}

	function formatUtilityRent(rent) {
		return rent.multiplier + "x dice";
	}

	function colorGroup(groupName, groupColor) {
		return {
			groupName: groupName,
			groupColor: groupColor,
			presentation: { priceText: formatPrice },
			rules: { kind: "color", rentRule: colorGroupRentRule }
		};
	}

	function buildGroups() {
		var groups = [];
		groups[1] = {
			groupName: "railroads",
			groupColor: "white",
			presentation: { priceText: formatPrice },
			rules: { kind: "transit", deed: { groupName: "Transportations", rents: transitRentTiers }, rentRule: { mode: "fixed", tiers: transitRentTiers } }
		};
		groups[2] = {
			groupName: "utilities",
			groupColor: "white",
			presentation: { priceText: formatPrice, rentText: formatUtilityRent },
			rules: { kind: "utility", deed: { multipliers: utilityRentTiers }, rentRule: { mode: "diceMultiplier", tiers: utilityRentTiers } }
		};
		groups[3] = colorGroup("dark purple", "#4B0082");
		groups[4] = colorGroup("light blue", "#AACCFF");
		groups[5] = colorGroup("purple", "purple");
		groups[6] = colorGroup("orange", "orange");
		groups[7] = colorGroup("red", "red");
		groups[8] = colorGroup("yellow", "yellow");
		groups[9] = colorGroup("green", "green");
		groups[10] = colorGroup("blue", "blue");
		return groups;
	}

	function cityTax(context) {
		var p = context.player;
		var percentageCost = p.money;
		for (var i = 0; i < context.squares.length; i++) {
			var property = context.squares[i];
			if (property.owner === p.index) {
				percentageCost += property.mortgage ? property.price * 0.5 : property.price;
				percentageCost += property.house * property.houseprice;
			}
		}
		percentageCost = Math.round(percentageCost * 0.1);

		function payTax(amount) {
			if (context.freeParkingTaxes) context.addTaxToFreeParking(amount);
			p.pay(amount, 0);
			context.ui.alert(p.name + " paid $" + amount + " for landing on City Tax.");
		}

		if (p.human && typeof context.ui.chooseTax === 'function') {
			context.ui.chooseTax(200, percentageCost, payTax);
		} else {
			payTax(200);
		}
		context.ui.displayLanded("You landed on City Tax. Pay $200 or 10% of total worth.");
	}

	function luxuryTax(context) {
		var p = context.player;
		context.ui.alert(p.name + " paid $75 for landing on Luxury Tax.");
		p.pay(75, 0);
		context.ui.displayLanded("You landed on Luxury Tax. Pay $75.");
	}

	function buildSquares(groups) {
		groups = groups || buildGroups();
		var squares = [];

		squares[0] = new Square({ name: "GO", presentation: { priceText: "COLLECT $200 SALARY AS YOU PASS.", color: "white" } });
		squares[1] = new Square({
			name: "Port Authority Bus Terminal",
			rules: { price: 60, groupNumber: 3, baseRent: 2, rentTiers: [10, 30, 90, 160, 250] }
		});
		squares[2] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "white" } });
		squares[3] = new Square({
			name: "Lincoln Tunnel",
			rules: { price: 60, groupNumber: 3, baseRent: 4, rentTiers: [20, 60, 180, 320, 450] }
		});
		squares[4] = new Square({ name: "City Tax", presentation: { priceText: "PAY 10% OR $200", color: "white" }, behavior: { onLand: cityTax } });
		squares[5] = new Square({
			name: "LOMTO",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[6] = new Square({
			name: "Statue of Liberty",
			rules: { price: 100, groupNumber: 4, baseRent: 6, rentTiers: [30, 90, 270, 400, 550] }
		});
		squares[7] = new Square({ name: "Chance", presentation: { priceText: "NEW YORK LOTTERY GAMES", color: "white" } });
		squares[8] = new Square({
			name: "Empire State Building",
			rules: { price: 100, groupNumber: 4, baseRent: 6, rentTiers: [30, 90, 270, 400, 550] }
		});
		squares[9] = new Square({
			name: "Central Park",
			rules: { price: 120, groupNumber: 4, baseRent: 8, rentTiers: [40, 100, 300, 450, 600] }
		});
		squares[10] = new Square({ name: "Just Visiting", presentation: { priceText: "", color: "white" } });
		squares[11] = new Square({
			name: "98.7 Kiss FM",
			rules: { price: 140, groupNumber: 5, baseRent: 10, rentTiers: [50, 150, 450, 625, 750] }
		});
		squares[12] = new Square({
			name: "Con Edison Electric",
			rules: { price: 150, groupNumber: 2 }
		});
		squares[13] = new Square({
			name: "Thirteen WNET",
			rules: { price: 140, groupNumber: 5, baseRent: 10, rentTiers: [50, 150, 450, 625, 750] }
		});
		squares[14] = new Square({
			name: "The New York Times",
			rules: { price: 160, groupNumber: 5, baseRent: 12, rentTiers: [60, 180, 500, 700, 900] }
		});
		squares[15] = new Square({
			name: "New York City Transit",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[16] = new Square({
			name: "New York Rangers",
			rules: { price: 180, groupNumber: 6, baseRent: 14, rentTiers: [70, 200, 550, 750, 950] }
		});
		squares[17] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "white" } });
		squares[18] = new Square({
			name: "New York Knicks",
			rules: { price: 180, groupNumber: 6, baseRent: 14, rentTiers: [70, 200, 550, 750, 950] }
		});
		squares[19] = new Square({
			name: "Madison Square Garden",
			rules: { price: 200, groupNumber: 6, baseRent: 16, rentTiers: [80, 220, 600, 800, 1000] }
		});
		squares[20] = new Square({ name: "Free Parking", presentation: { priceText: "", color: "white" } });
		squares[21] = new Square({
			name: "macy*s",
			rules: { price: 220, groupNumber: 7, baseRent: 18, rentTiers: [90, 250, 700, 875, 1050] }
		});
		squares[22] = new Square({ name: "Chance", presentation: { priceText: "NEW YORK LOTTERY GAMES", color: "white" } });
		squares[23] = new Square({
			name: "FAO Schwarz",
			rules: { price: 220, groupNumber: 7, baseRent: 18, rentTiers: [90, 250, 700, 875, 1050] }
		});
		squares[24] = new Square({
			name: "bloomingdale's",
			presentation: { boardName: "blooming..." },
			rules: { price: 240, groupNumber: 7, baseRent: 20, rentTiers: [100, 300, 750, 925, 1100] }
		});
		squares[25] = new Square({
			name: "Metro-North Railroad",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[26] = new Square({
			name: "Deloitte & Touche LLP",
			rules: { price: 260, groupNumber: 8, baseRent: 22, rentTiers: [110, 330, 800, 975, 1150] }
		});
		squares[27] = new Square({
			name: "SmithBarney",
			rules: { price: 260, groupNumber: 8, baseRent: 22, rentTiers: [110, 330, 800, 975, 1150] }
		});
		squares[28] = new Square({
			name: "Con Edison Gas",
			rules: { price: 150, groupNumber: 2 }
		});
		squares[29] = new Square({
			name: "CITIBANK",
			rules: { price: 280, groupNumber: 8, baseRent: 24, rentTiers: [120, 360, 850, 1025, 1200] }
		});
		squares[30] = new Square({ name: "Go to Jail", presentation: { priceText: "Go directly to Jail. Do not pass GO. Do not collect $200.", color: "white" } });
		squares[31] = new Square({
			name: "The Regency Hotel",
			rules: { price: 300, groupNumber: 9, baseRent: 26, rentTiers: [130, 390, 900, 1100, 1275] }
		});
		squares[32] = new Square({
			name: "Essex House",
			rules: { price: 300, groupNumber: 9, baseRent: 26, rentTiers: [130, 390, 900, 1100, 1275] }
		});
		squares[33] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "white" } });
		squares[34] = new Square({
			name: "The Plaza",
			rules: { price: 320, groupNumber: 9, baseRent: 28, rentTiers: [150, 450, 1000, 1200, 1400] }
		});
		squares[35] = new Square({
			name: "United Airlines",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[36] = new Square({ name: "Chance", presentation: { priceText: "NEW YORK LOTTERY GAMES", color: "white" } });
		squares[37] = new Square({
			name: "Tiffany & CO.",
			rules: { price: 350, groupNumber: 10, baseRent: 35, rentTiers: [175, 500, 1100, 1300, 1500] }
		});
		squares[38] = new Square({ name: "LUXURY TAX", presentation: { priceText: "Pay $75", color: "white" }, behavior: { onLand: luxuryTax } });
		squares[39] = new Square({
			name: "TRUMP TOWER",
			rules: { price: 400, groupNumber: 10, baseRent: 50, rentTiers: [200, 600, 1400, 1700, 2000] }
		});

		return Square.applyGroupDefinitions(squares, groups);
	}

	function buildBoard() {
		var groups = buildGroups();
		return LegacyBoardAdapter.buildBoard('NYC', groups, buildSquares(groups), BoardIdCatalogs.NYC, {
			taxAmountById: { 'city-tax': 200, 'luxury-tax': 75 },
			taxPercentById: { 'city-tax': 0.1 }
		});
	}

	function buildCommunityChestCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(game, p) { p.communityChestJailCard = true; });
		cards[1] = new Card("You have won lifetime home delivery of the New York Times. Collect $10", function(game) { game.addAmount(10, 'Community Chest');});
		cards[2] = new Card("From sale of Macy's stock, you get $45", function(game) { game.addAmount(45, 'Community Chest');});
		cards[3] = new Card("Life insurance matures. Collect $100", function(game) { game.addAmount(100, 'Community Chest');});
		cards[4] = new Card("Deloitte & Touche LLP tax return Collect $20", function(game) { game.addAmount(20, 'Community Chest');});
		cards[5] = new Card("FAO Schwarz Xmas fund matures. Collect $100", function(game) { game.addAmount(100, 'Community Chest');});
		cards[6] = new Card("You have won a United Airlines trip around the world! Collect $100", function(game) { game.addAmount(100, 'Community Chest');});
		cards[7] = new Card("Performed a wedding at the Plaza Hotel. Receive $25", function(game) { game.addAmount(25, 'Community Chest');});
		cards[8] = new Card("Pay hospital $100", function(game) { game.subtractAmount(100, 'Community Chest');});
		cards[9] = new Card("You won the Lottery! Collect $200", function(game) { game.addAmount(200, 'Community Chest');});
		cards[10] = new Card("Pay school tax of $150", function(game) { game.subtractAmount(150, 'Community Chest');});
		cards[11] = new Card("Doctor's fee. Pay $50", function(game) { game.subtractAmount(50, 'Community Chest');});
		cards[12] = new Card("Madison Square Garden opening tonight. Collect $50 from every player for opening night seats.", function(game) { game.collectFromEachPlayer(50, 'Community Chest');});
		cards[13] = new Card("You have won kiss cash! Advance to GO (Collect $200)", function(game) { game.advance(0);});
		cards[14] = new Card("You are assessed for street repairs. $40 per house. $115 per hotel.", function(game) { game.streetRepairs(40, 115);});
		cards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass GO. Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	function buildChanceCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail free. This card may be kept until needed or sold.", function(game, p) { p.chanceJailCard = true; });
		cards[1] = new Card("Make general repairs on all your property. For each house pay $25. For each hotel $100.", function(game) { game.streetRepairs(25, 100);});
		cards[2] = new Card("Pay poor tax of $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[3] = new Card("You have been elected chairman of Con Edison. Pay each player $50.", function(game) { game.payEachPlayer(50, 'Chance');});
		cards[4] = new Card("Go back 3 spaces.", function(game) { game.goBackThreeSpaces();});
		cards[5] = new Card("Advance token to the nearest Con Edison utility. If UNOWNED you may buy it from the bank. If OWNED, throw dice and pay owner a total of ten times the amount thrown.", function(game) { game.advanceToNearestUtility();});
		cards[6] = new Card("Citibank pays you interest of $50.", function(game) { game.addAmount(50, 'Chance');});
		cards[7] = new Card("Advance token to the nearest Transportation and pay owner Twice the Rental to which they are otherwise entitled. If Transportation is unowned, you may buy it from the Bank.", function(game) { game.advanceToNearestRailroad();});
		cards[8] = new Card("Take a walk past The Essex House. Advance to GO. Collect $200.", function(game) { game.advance(0, 32);});
		cards[9] = new Card("Take a ride to the Regency Hotel! If you pass GO collect $200.", function(game) { game.advance(31);});
		cards[10] = new Card("Take a walk on fifth avenue. Advance token to Trump Tower.", function(game) { game.advance(39);});
		cards[11] = new Card("Advance to thirteen.", function(game) { game.advance(13);});
		cards[12] = new Card("Your Smith Barney mutual fund pays dividend. Collect $150.", function(game) { game.addAmount(150, 'Chance');});
		cards[13] = new Card("Advance token to the nearest Transportation and pay owner Twice the Rental to which they are otherwise entitled.\n\nIf Transportation is unowned, you may buy it from the Bank.", function(game) { game.advanceToNearestRailroad();});
		cards[14] = new Card("Catch a bus to Central Park. If you pass GO, collect $200.", function(game) { game.advance(9);});
		cards[15] = new Card("Go directly to Jail. Do not pass GO, do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	Monopoly.Editions.register("NYC", {
		buildBoard: buildBoard,
		buildGroups: buildGroups,
		buildSquares: buildSquares,
		buildCommunityChestCards: buildCommunityChestCards,
		buildChanceCards: buildChanceCards
	});
})(typeof window !== 'undefined' ? window : globalThis);
