// Classic US edition: standard board, deeds, and card decks.
(function(global) {
	var utilityRentTiers = [4, 10];
	var transitRentTiers = [25, 50, 100, 200];

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
			rules: { kind: "color", rentRule: { mode: "colorGroup", monopolyMultiplier: 2 } }
		};
	}

	function buildGroups() {
		var groups = [];
		groups[1] = {
			groupName: "railroads",
			groupColor: "#FFFFFF",
			presentation: { priceText: formatPrice, tokenImage: { src: "images/train_icon.png", height: 60, width: 65 } },
			rules: { kind: "transit", deed: { groupName: "Railroads", rents: transitRentTiers }, rentRule: { mode: "fixed", tiers: transitRentTiers } }
		};
		groups[2] = {
			groupName: "utilities",
			groupColor: "#FFFFFF",
			presentation: { priceText: formatPrice, rentText: formatUtilityRent },
			rules: { kind: "utility", deed: { multipliers: utilityRentTiers }, rentRule: { mode: "diceMultiplier", tiers: utilityRentTiers } }
		};
		groups[3] = colorGroup("brown", "#8B4513");
		groups[4] = colorGroup("light blue", "#87CEEB");
		groups[5] = colorGroup("pink", "#D63384");
		groups[6] = colorGroup("orange", "#FFA500");
		groups[7] = colorGroup("red", "#FF0000");
		groups[8] = colorGroup("yellow", "#FFFF00");
		groups[9] = colorGroup("green", "#008000");
		groups[10] = colorGroup("blue", "#0000FF");
		return groups;
	}

	function fixedTax(context, amount, name) {
		if (context.freeParkingTaxes) {
			context.addTaxToFreeParking(amount);
		} else {
			context.ui.alert(context.player.name + " paid $" + amount + " for landing on " + name + ".");
		}
		context.player.pay(amount, 0);
		context.ui.displayLanded("You landed on " + name + ". Pay $" + amount + ".");
	}

	function cityTax(context) {
		fixedTax(context, 200, "City Tax");
	}

	function luxuryTax(context) {
		fixedTax(context, 100, "Luxury Tax");
	}

	function buildSquares(groups) {
		groups = groups || buildGroups();
		var squares = [];

		squares[0] = new Square({ name: "GO", presentation: { priceText: "COLLECT $200 SALARY AS YOU PASS.", color: "#FFFFFF" } });
		squares[1] = new Square({
			name: "Mediterranean Avenue",
			presentation: { boardName: "Mediter-ranean Avenue" },
			rules: { price: 60, groupNumber: 3, baseRent: 2, rentTiers: [10, 30, 90, 160, 250] }
		});
		squares[2] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[3] = new Square({
			name: "Baltic Avenue",
			rules: { price: 60, groupNumber: 3, baseRent: 4, rentTiers: [20, 60, 180, 320, 450] }
		});
		squares[4] = new Square({ name: "City Tax", presentation: { priceText: "Pay $200", color: "#FFFFFF" }, behavior: { onLand: cityTax } });
		squares[5] = new Square({
			name: "Reading Railroad",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[6] = new Square({
			name: "Oriental Avenue",
			rules: { price: 100, groupNumber: 4, baseRent: 6, rentTiers: [30, 90, 270, 400, 550] }
		});
		squares[7] = new Square({ name: "Chance", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[8] = new Square({
			name: "Vermont Avenue",
			rules: { price: 100, groupNumber: 4, baseRent: 6, rentTiers: [30, 90, 270, 400, 550] }
		});
		squares[9] = new Square({
			name: "Connecticut Avenue",
			rules: { price: 120, groupNumber: 4, baseRent: 8, rentTiers: [40, 100, 300, 450, 600] }
		});
		squares[10] = new Square({ name: "Just Visiting", presentation: { priceText: "", color: "#FFFFFF" } });
		squares[11] = new Square({
			name: "St. Charles Place",
			rules: { price: 140, groupNumber: 5, baseRent: 10, rentTiers: [50, 150, 450, 625, 750] }
		});
		squares[12] = new Square({
			name: "Electric Company",
			presentation: { tokenImage: { src: "images/electric_icon.png", height: 60, width: 48 } },
			rules: { price: 150, groupNumber: 2 }
		});
		squares[13] = new Square({
			name: "States Avenue",
			rules: { price: 140, groupNumber: 5, baseRent: 10, rentTiers: [50, 150, 450, 625, 750] }
		});
		squares[14] = new Square({
			name: "Virginia Avenue",
			rules: { price: 160, groupNumber: 5, baseRent: 12, rentTiers: [60, 180, 500, 700, 900] }
		});
		squares[15] = new Square({
			name: "Pennsylvania Railroad",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[16] = new Square({
			name: "St. James Place",
			rules: { price: 180, groupNumber: 6, baseRent: 14, rentTiers: [70, 200, 550, 750, 950] }
		});
		squares[17] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[18] = new Square({
			name: "Tennessee Avenue",
			rules: { price: 180, groupNumber: 6, baseRent: 14, rentTiers: [70, 200, 550, 750, 950] }
		});
		squares[19] = new Square({
			name: "New York Avenue",
			rules: { price: 200, groupNumber: 6, baseRent: 16, rentTiers: [80, 220, 600, 800, 1000] }
		});
		squares[20] = new Square({ name: "Free Parking", presentation: { priceText: "", color: "#FFFFFF" } });
		squares[21] = new Square({
			name: "Kentucky Avenue",
			rules: { price: 220, groupNumber: 7, baseRent: 18, rentTiers: [90, 250, 700, 875, 1050] }
		});
		squares[22] = new Square({ name: "Chance", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[23] = new Square({
			name: "Indiana Avenue",
			rules: { price: 220, groupNumber: 7, baseRent: 18, rentTiers: [90, 250, 700, 875, 1050] }
		});
		squares[24] = new Square({
			name: "Illinois Avenue",
			rules: { price: 240, groupNumber: 7, baseRent: 20, rentTiers: [100, 300, 750, 925, 1100] }
		});
		squares[25] = new Square({
			name: "B&O Railroad",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[26] = new Square({
			name: "Atlantic Avenue",
			rules: { price: 260, groupNumber: 8, baseRent: 22, rentTiers: [110, 330, 800, 975, 1150] }
		});
		squares[27] = new Square({
			name: "Ventnor Avenue",
			rules: { price: 260, groupNumber: 8, baseRent: 22, rentTiers: [110, 330, 800, 975, 1150] }
		});
		squares[28] = new Square({
			name: "Water Works",
			presentation: { tokenImage: { src: "images/water_icon.png", height: 60, width: 78 } },
			rules: { price: 150, groupNumber: 2 }
		});
		squares[29] = new Square({
			name: "Marvin Gardens",
			rules: { price: 280, groupNumber: 8, baseRent: 24, rentTiers: [120, 360, 850, 1025, 1200] }
		});
		squares[30] = new Square({ name: "Go to Jail", presentation: { priceText: "Go directly to Jail. Do not pass GO. Do not collect $200.", color: "#FFFFFF" } });
		squares[31] = new Square({
			name: "Pacific Avenue",
			rules: { price: 300, groupNumber: 9, baseRent: 26, rentTiers: [130, 390, 900, 1100, 1275] }
		});
		squares[32] = new Square({
			name: "North Carolina Avenue",
			rules: { price: 300, groupNumber: 9, baseRent: 26, rentTiers: [130, 390, 900, 1100, 1275] }
		});
		squares[33] = new Square({ name: "Community Chest", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[34] = new Square({
			name: "Pennsylvania Avenue",
			rules: { price: 320, groupNumber: 9, baseRent: 28, rentTiers: [150, 450, 1000, 1200, 1400] }
		});
		squares[35] = new Square({
			name: "Short Line",
			rules: { price: 200, groupNumber: 1 }
		});
		squares[36] = new Square({ name: "Chance", presentation: { priceText: "FOLLOW INSTRUCTIONS ON TOP CARD", color: "#FFFFFF" } });
		squares[37] = new Square({
			name: "Park Place",
			rules: { price: 350, groupNumber: 10, baseRent: 35, rentTiers: [175, 500, 1100, 1300, 1500] }
		});
		squares[38] = new Square({ name: "LUXURY TAX", presentation: { priceText: "Pay $100", color: "#FFFFFF" }, behavior: { onLand: luxuryTax } });
		squares[39] = new Square({
			name: "Boardwalk",
			rules: { price: 400, groupNumber: 10, baseRent: 50, rentTiers: [200, 600, 1400, 1700, 2000] }
		});

		return Square.applyGroupDefinitions(squares, groups);
	}

	function buildCommunityChestCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(game, p) {
			p.communityChestJailCard = true;
		});
		cards[1] = new Card("You have won second prize in a beauty contest. Collect $10.", function(game) { game.addAmount(10, 'Community Chest');});
		cards[2] = new Card("From sale of stock, you get $50.", function(game) { game.addAmount(50, 'Community Chest');});
		cards[3] = new Card("Life insurance matures. Collect $100.", function(game) { game.addAmount(100, 'Community Chest');});
		cards[4] = new Card("Income tax refund. Collect $20.", function(game) { game.addAmount(20, 'Community Chest');});
		cards[5] = new Card("Holiday fund matures. Receive $100.", function(game) { game.addAmount(100, 'Community Chest');});
		cards[6] = new Card("You inherit $100.", function(game) { game.addAmount(100, 'Community Chest');});
		cards[7] = new Card("Receive $25 consultancy fee.", function(game) { game.addAmount(25, 'Community Chest');});
		cards[8] = new Card("Pay hospital fees of $100.", function(game) { game.subtractAmount(100, 'Community Chest');});
		cards[9] = new Card("Bank error in your favor. Collect $200.", function(game) { game.addAmount(200, 'Community Chest');});
		cards[10] = new Card("Pay school fees of $50.", function(game) { game.subtractAmount(50, 'Community Chest');});
		cards[11] = new Card("Doctor's fee. Pay $50.", function(game) { game.subtractAmount(50, 'Community Chest');});
		cards[12] = new Card("It is your birthday. Collect $10 from every player.", function(game) { game.collectFromEachPlayer(10, 'Community Chest');});
		cards[13] = new Card("Advance to \"GO\" (Collect $200).", function(game) { game.advance(0);});
		cards[14] = new Card("You are assessed for street repairs. $40 per house. $115 per hotel.", function(game) { game.streetRepairs(40, 115);});
		cards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass \"GO\". Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	function buildChanceCards() {
		var cards = [];

		cards[0] = new Card("GET OUT OF JAIL FREE. This card may be kept until needed or traded.", function(game, p) {
			p.chanceJailCard = true;
		});
		cards[1] = new Card("Make General Repairs on All Your Property. For each house pay $25. For each hotel $100.", function(game) { game.streetRepairs(25, 100);});
		cards[2] = new Card("Speeding fine $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[3] = new Card("You have been elected chairman of the board. Pay each player $50.", function(game) { game.payEachPlayer(50, 'Chance');});
		cards[4] = new Card("Go back three spaces.", function(game) { game.goBackThreeSpaces();});
		cards[5] = new Card("ADVANCE TO THE NEAREST UTILITY. IF UNOWNED, you may buy it from the Bank. IF OWNED, throw dice and pay owner a total ten times the amount thrown.", function(game) { game.advanceToNearestUtility();});
		cards[6] = new Card("Bank pays you dividend of $50.", function(game) { game.addAmount(50, 'Chance');});
		cards[7] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function(game) { game.advanceToNearestRailroad();});
		cards[8] = new Card("Pay poor tax of $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[9] = new Card("Take a trip to Reading Rail Road. If you pass \"GO\" collect $200.", function(game) { game.advance(5);});
		cards[10] = new Card("ADVANCE to Boardwalk.", function(game) { game.advance(39);});
		cards[11] = new Card("ADVANCE to Illinois Avenue. If you pass \"GO\" collect $200.", function(game) { game.advance(24);});
		cards[12] = new Card("Your building loan matures. Collect $150.", function(game) { game.addAmount(150, 'Chance');});
		cards[13] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function(game) { game.advanceToNearestRailroad();});
		cards[14] = new Card("ADVANCE to St. Charles Place. If you pass \"GO\" collect $200.", function(game) { game.advance(11);});
		cards[15] = new Card("Go to Jail. Go Directly to Jail. Do not pass \"GO\". Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	var _Monopoly = (typeof Monopoly !== 'undefined') ? Monopoly : global.Monopoly;
	if (_Monopoly && _Monopoly.Editions) {
		_Monopoly.Editions.register("Classic", {
			buildGroups: buildGroups,
			buildSquares: buildSquares,
			buildCommunityChestCards: buildCommunityChestCards,
			buildChanceCards: buildChanceCards
		});
	}
})(typeof window !== 'undefined' ? window : globalThis);
