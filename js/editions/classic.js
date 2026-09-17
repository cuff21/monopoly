// Classic US edition: standard board, deeds, and card decks.
(function() {
	function corrections() {
		document.getElementById("cell1name").textContent = "Mediter-ranean Avenue";

		// Add images to enlarges.
		document.getElementById("enlarge5token").innerHTML = '<img src="images/train_icon.png" height="60" width="65" alt="" />';
		document.getElementById("enlarge15token").innerHTML = '<img src="images/train_icon.png" height="60" width="65" alt="" />';
		document.getElementById("enlarge25token").innerHTML = '<img src="images/train_icon.png" height="60" width="65" alt="" />';
		document.getElementById("enlarge35token").innerHTML = '<img src="images/train_icon.png" height="60" width="65" alt="" />';
		document.getElementById("enlarge12token").innerHTML = '<img src="images/electric_icon.png" height="60" width="48" alt="" />';
		document.getElementById("enlarge28token").innerHTML = '<img src="images/water_icon.png" height="60" width="78" alt="" />';
	}

	function utilityText() {
		return '&nbsp;&nbsp;&nbsp;&nbsp;If one "Utility" is owned rent is 4 times amount shown on dice.<br /><br />&nbsp;&nbsp;&nbsp;&nbsp;If both "Utilitys" are owned rent is 10 times amount shown on dice.';
	}

	function transitText() {
		return '<div style="font-size: 14px; line-height: 1.5;">Rent<span style="float: right;">$25.</span><br />If 2 Railroads are owned<span style="float: right;">50.</span><br />If 3 &nbsp; &nbsp; " &nbsp; &nbsp; " &nbsp; &nbsp; "<span style="float: right;">100.</span><br />If 4 &nbsp; &nbsp; " &nbsp; &nbsp; " &nbsp; &nbsp; "<span style="float: right;">200.</span></div>';
	}

	function luxuryTax() {
		if (freeParkingTaxes) {
			addTaxToFreeParking(100);
		} else {
			addAlert(player[turn].name + " paid $100 for landing on Luxury Tax.");
		}
		player[turn].pay(100, 0);

		$("#landed").show().text("You landed on Luxury Tax. Pay $100.");
	}

	function cityTax() {
		if (freeParkingTaxes) {
			addTaxToFreeParking(200);
		} else {
			addAlert(player[turn].name + " paid $200 for landing on City Tax.");
		}
		player[turn].pay(200, 0);

		$("#landed").show().text("You landed on City Tax. Pay $200.");
	}

	function buildSquares() {
		var squares = [];

		squares[0] = new Square("GO", "COLLECT $200 SALARY AS YOU PASS.", "#FFFFFF");
		squares[1] = new Square("Mediterranean Avenue", "$60", "#8B4513", 60, 3, 2, 10, 30, 90, 160, 250);
		squares[2] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[3] = new Square("Baltic Avenue", "$60", "#8B4513", 60, 3, 4, 20, 60, 180, 320, 450);
		squares[4] = new Square("City Tax", "Pay $200", "#FFFFFF");
		squares[5] = new Square("Reading Railroad", "$200", "#FFFFFF", 200, 1);
		squares[6] = new Square("Oriental Avenue", "$100", "#87CEEB", 100, 4, 6, 30, 90, 270, 400, 550);
		squares[7] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[8] = new Square("Vermont Avenue", "$100", "#87CEEB", 100, 4, 6, 30, 90, 270, 400, 550);
		squares[9] = new Square("Connecticut Avenue", "$120", "#87CEEB", 120, 4, 8, 40, 100, 300, 450, 600);
		squares[10] = new Square("Just Visiting", "", "#FFFFFF");
		squares[11] = new Square("St. Charles Place", "$140", "#D63384", 140, 5, 10, 50, 150, 450, 625, 750);
		squares[12] = new Square("Electric Company", "$150", "#FFFFFF", 150, 2);
		squares[13] = new Square("States Avenue", "$140", "#D63384", 140, 5, 10, 50, 150, 450, 625, 750);
		squares[14] = new Square("Virginia Avenue", "$160", "#D63384", 160, 5, 12, 60, 180, 500, 700, 900);
		squares[15] = new Square("Pennsylvania Railroad", "$200", "#FFFFFF", 200, 1);
		squares[16] = new Square("St. James Place", "$180", "#FFA500", 180, 6, 14, 70, 200, 550, 750, 950);
		squares[17] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[18] = new Square("Tennessee Avenue", "$180", "#FFA500", 180, 6, 14, 70, 200, 550, 750, 950);
		squares[19] = new Square("New York Avenue", "$200", "#FFA500", 200, 6, 16, 80, 220, 600, 800, 1000);
		squares[20] = new Square("Free Parking", "", "#FFFFFF");
		squares[21] = new Square("Kentucky Avenue", "$220", "#FF0000", 220, 7, 18, 90, 250, 700, 875, 1050);
		squares[22] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[23] = new Square("Indiana Avenue", "$220", "#FF0000", 220, 7, 18, 90, 250, 700, 875, 1050);
		squares[24] = new Square("Illinois Avenue", "$240", "#FF0000", 240, 7, 20, 100, 300, 750, 925, 1100);
		squares[25] = new Square("B&O Railroad", "$200", "#FFFFFF", 200, 1);
		squares[26] = new Square("Atlantic Avenue", "$260", "#FFFF00", 260, 8, 22, 110, 330, 800, 975, 1150);
		squares[27] = new Square("Ventnor Avenue", "$260", "#FFFF00", 260, 8, 22, 110, 330, 800, 975, 1150);
		squares[28] = new Square("Water Works", "$150", "#FFFFFF", 150, 2);
		squares[29] = new Square("Marvin Gardens", "$280", "#FFFF00", 280, 8, 24, 120, 360, 850, 1025, 1200);
		squares[30] = new Square("Go to Jail", "Go directly to Jail. Do not pass GO. Do not collect $200.", "#FFFFFF");
		squares[31] = new Square("Pacific Avenue", "$300", "#008000", 300, 9, 26, 130, 390, 900, 110, 1275);
		squares[32] = new Square("North Carolina Avenue", "$300", "#008000", 300, 9, 26, 130, 390, 900, 110, 1275);
		squares[33] = new Square("Community Chest", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[34] = new Square("Pennsylvania Avenue", "$320", "#008000", 320, 9, 28, 150, 450, 1000, 1200, 1400);
		squares[35] = new Square("Short Line", "$200", "#FFFFFF", 200, 1);
		squares[36] = new Square("Chance", "FOLLOW INSTRUCTIONS ON TOP CARD", "#FFFFFF");
		squares[37] = new Square("Park Place", "$350", "#0000FF", 350, 10, 35, 175, 500, 1100, 1300, 1500);
		squares[38] = new Square("LUXURY TAX", "Pay $100", "#FFFFFF");
		squares[39] = new Square("Boardwalk", "$400", "#0000FF", 400, 10, 50, 200, 600, 1400, 1700, 2000);

		return squares;
	}

	function buildCommunityChestCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(p) { p.communityChestJailCard = true; updateOwned();});
		cards[1] = new Card("You have won second prize in a beauty contest. Collect $10.", function() { addamount(10, 'Community Chest');});
		cards[2] = new Card("From sale of stock, you get $50.", function() { addamount(50, 'Community Chest');});
		cards[3] = new Card("Life insurance matures. Collect $100.", function() { addamount(100, 'Community Chest');});
		cards[4] = new Card("Income tax refund. Collect $20.", function() { addamount(20, 'Community Chest');});
		cards[5] = new Card("Holiday fund matures. Receive $100.", function() { addamount(100, 'Community Chest');});
		cards[6] = new Card("You inherit $100.", function() { addamount(100, 'Community Chest');});
		cards[7] = new Card("Receive $25 consultancy fee.", function() { addamount(25, 'Community Chest');});
		cards[8] = new Card("Pay hospital fees of $100.", function() { subtractamount(100, 'Community Chest');});
		cards[9] = new Card("Bank error in your favor. Collect $200.", function() { addamount(200, 'Community Chest');});
		cards[10] = new Card("Pay school fees of $50.", function() { subtractamount(50, 'Community Chest');});
		cards[11] = new Card("Doctor's fee. Pay $50.", function() { subtractamount(50, 'Community Chest');});
		cards[12] = new Card("It is your birthday. Collect $10 from every player.", function() { collectfromeachplayer(10, 'Community Chest');});
		cards[13] = new Card("Advance to \"GO\" (Collect $200).", function() { advance(0);});
		cards[14] = new Card("You are assessed for street repairs. $40 per house. $115 per hotel.", function() { streetrepairs(40, 115);});
		cards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass \"GO\". Do not collect $200.", function() { gotojail();});

		return cards;
	}

	function buildChanceCards() {
		var cards = [];

		cards[0] = new Card("GET OUT OF JAIL FREE. This card may be kept until needed or traded.", function(p) { p.chanceJailCard=true; updateOwned();});
		cards[1] = new Card("Make General Repairs on All Your Property. For each house pay $25. For each hotel $100.", function() { streetrepairs(25, 100);});
		cards[2] = new Card("Speeding fine $15.", function() { subtractamount(15, 'Chance');});
		cards[3] = new Card("You have been elected chairman of the board. Pay each player $50.", function() { payeachplayer(50, 'Chance');});
		cards[4] = new Card("Go back three spaces.", function() { gobackthreespaces();});
		cards[5] = new Card("ADVANCE TO THE NEAREST UTILITY. IF UNOWNED, you may buy it from the Bank. IF OWNED, throw dice and pay owner a total ten times the amount thrown.", function() { advanceToNearestUtility();});
		cards[6] = new Card("Bank pays you dividend of $50.", function() { addamount(50, 'Chance');});
		cards[7] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function() { advanceToNearestRailroad();});
		cards[8] = new Card("Pay poor tax of $15.", function() { subtractamount(15, 'Chance');});
		cards[9] = new Card("Take a trip to Reading Rail Road. If you pass \"GO\" collect $200.", function() { advance(5);});
		cards[10] = new Card("ADVANCE to Boardwalk.", function() { advance(39);});
		cards[11] = new Card("ADVANCE to Illinois Avenue. If you pass \"GO\" collect $200.", function() { advance(24);});
		cards[12] = new Card("Your building loan matures. Collect $150.", function() { addamount(150, 'Chance');});
		cards[13] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function() { advanceToNearestRailroad();});
		cards[14] = new Card("ADVANCE to St. Charles Place. If you pass \"GO\" collect $200.", function() { advance(11);});
		cards[15] = new Card("Go to Jail. Go Directly to Jail. Do not pass \"GO\". Do not collect $200.", function() { gotojail();});

		return cards;
	}

	Monopoly.Editions.register("Classic", {
		buildSquares: buildSquares,
		buildCommunityChestCards: buildCommunityChestCards,
		buildChanceCards: buildChanceCards,
		corrections: corrections,
		text: { utility: utilityText, transit: transitText },
		tax: { city: cityTax, luxury: luxuryTax }
	});
})();
