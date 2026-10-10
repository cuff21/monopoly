// New York City edition with tax choices and card actions routed through the shared game/UI APIs.
(function(global) {
	if (!global.Board && typeof module !== 'undefined' && module.exports) require('../core/board');
	var GameStateContext = global.GameStateContext || (typeof module !== 'undefined' && module.exports ? require('../core/game-state-context') : null);

	function Card(text, effect) {
		this.text = text;
		this.action = function(context) {
			var player = GameStateContext.getPlayerById(context.state, context.playerId);
			return effect(context.game, player, context);
		};
	}

	function formatUtilityRent(rent) {
		return rent.multiplier + "x dice";
	}

	async function cityTax(context) {
		var game = context.game;
		var state = context.state;
		var player = GameStateContext.getPlayerById(state, context.playerId);
		var taxSquare = global.getSquare(state.board, context.squareId);
		var netWorth = player.money;
		Object.keys(state.board.squaresById).forEach(function(squareId) {
			var propertyState = GameStateContext.getSquareState(state, squareId);
			if (propertyState.ownerId !== player.playerId) return;
			var rules = global.getSquare(state.board, squareId).rules;
			netWorth += propertyState.mortgage ? rules.mortgageValue : rules.purchasePrice;
			netWorth += propertyState.house * rules.houseCost;
		});
		var fixedAmount = taxSquare.rules.taxAmount;
		var percentageAmount = Math.round(netWorth * taxSquare.rules.taxPercentOfNetWorth);

		function payTax(amount) {
			if (state.freeParkingTaxes) game.addTaxToFreeParking(amount);
			player.pay(amount, 0);
			context.ui.alert(player.name + " paid $" + amount + " for landing on City Tax.");
		}

        var action = await game.requestDecision('tax', player.playerId, { fixedAmount: fixedAmount, percentageAmount: percentageAmount });
        payTax(action.amount);
		context.ui.displayLanded("You landed on City Tax. Pay $" + fixedAmount + " or " + (taxSquare.rules.taxPercentOfNetWorth * 100) + "% of total worth.");
	}

	function luxuryTax(context) {
		var state = context.state;
		var player = GameStateContext.getPlayerById(state, context.playerId);
		var amount = global.getSquare(state.board, context.squareId).rules.taxAmount;
		context.ui.alert(player.name + " paid $" + amount + " for landing on Luxury Tax.");
		player.pay(amount, 0);
		context.ui.displayLanded("You landed on Luxury Tax. Pay $" + amount + ".");
	}

	function buildBoard() {
		return new Board({
			editionId: 'NYC',
			neutralColor: 'white',
			groups: [
				{ id: 'railroads', label: 'Transportations', color: 'white', rent: [25, 50, 100, 200, 400] },
				{ id: 'utilities', label: 'Utilities', color: 'white', rent: [4, 10, 10, 10, 10], presentation: { rentText: formatUtilityRent } },
				{ id: 'dark-purple', label: 'Dark Purple', color: '#4B0082' },
				{ id: 'light-blue', label: 'Light Blue', color: '#AACCFF' },
				{ id: 'purple', label: 'Purple', color: 'purple' },
				{ id: 'orange', label: 'Orange', color: 'orange' },
				{ id: 'red', label: 'Red', color: 'red' },
				{ id: 'yellow', label: 'Yellow', color: 'yellow' },
				{ id: 'green', label: 'Green', color: 'green' },
				{ id: 'blue', label: 'Blue', color: 'blue' }
			],
			squares: [
				{ id: 'go', kind: 'go', label: 'GO', text: 'COLLECT $200 SALARY AS YOU PASS.' },
				{ id: 'port-authority-bus-terminal', kind: 'street', group: 'dark-purple', label: 'Port Authority Bus Terminal', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50 },
				{ id: 'community-chest-south', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'lincoln-tunnel', kind: 'street', group: 'dark-purple', label: 'Lincoln Tunnel', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
				{ id: 'city-tax', kind: 'tax', label: 'City Tax', text: 'PAY 10% OR $200', tax: 200, taxPercentOfNetWorth: 0.1, onLand: cityTax },
				{ id: 'lomto', kind: 'railroad', group: 'railroads', label: 'LOMTO', price: 200 },
				{ id: 'statue-of-liberty', kind: 'street', group: 'light-blue', label: 'Statue of Liberty', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
				{ id: 'chance-south', kind: 'card', deckId: 'chance', label: 'Chance', text: 'NEW YORK LOTTERY GAMES' },
				{ id: 'empire-state-building', kind: 'street', group: 'light-blue', label: 'Empire State Building', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
				{ id: 'central-park', kind: 'street', group: 'light-blue', label: 'Central Park', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
				{ id: 'jail', kind: 'jail', label: 'Just Visiting' },
				{ id: '98-7-kiss-fm', kind: 'street', group: 'purple', label: '98.7 Kiss FM', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
				{ id: 'con-edison-electric', kind: 'utility', group: 'utilities', label: 'Con Edison Electric', price: 150 },
				{ id: 'thirteen-wnet', kind: 'street', group: 'purple', label: 'Thirteen WNET', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
				{ id: 'the-new-york-times', kind: 'street', group: 'purple', label: 'The New York Times', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
				{ id: 'new-york-city-transit', kind: 'railroad', group: 'railroads', label: 'New York City Transit', price: 200 },
				{ id: 'new-york-rangers', kind: 'street', group: 'orange', label: 'New York Rangers', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
				{ id: 'community-chest-west', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'new-york-knicks', kind: 'street', group: 'orange', label: 'New York Knicks', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
				{ id: 'madison-square-garden', kind: 'street', group: 'orange', label: 'Madison Square Garden', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
				{ id: 'free-parking', kind: 'free-parking', label: 'Free Parking' },
				{ id: 'macy-s', kind: 'street', group: 'red', label: 'macy*s', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
				{ id: 'chance-east', kind: 'card', deckId: 'chance', label: 'Chance', text: 'NEW YORK LOTTERY GAMES' },
				{ id: 'fao-schwarz', kind: 'street', group: 'red', label: 'FAO Schwarz', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
				{ id: 'bloomingdale-s', kind: 'street', group: 'red', label: "bloomingdale's", price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, presentation: { boardName: 'blooming...' } },
				{ id: 'metro-north-railroad', kind: 'railroad', group: 'railroads', label: 'Metro-North Railroad', price: 200 },
				{ id: 'deloitte-touche-llp', kind: 'street', group: 'yellow', label: 'Deloitte & Touche LLP', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
				{ id: 'smithbarney', kind: 'street', group: 'yellow', label: 'SmithBarney', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
				{ id: 'con-edison-gas', kind: 'utility', group: 'utilities', label: 'Con Edison Gas', price: 150 },
				{ id: 'citibank', kind: 'street', group: 'yellow', label: 'CITIBANK', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
				{ id: 'go-to-jail', kind: 'go-to-jail', label: 'Go to Jail', text: 'Go directly to Jail. Do not pass GO. Do not collect $200.' },
				{ id: 'the-regency-hotel', kind: 'street', group: 'green', label: 'The Regency Hotel', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
				{ id: 'essex-house', kind: 'street', group: 'green', label: 'Essex House', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
				{ id: 'community-chest-east', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'the-plaza', kind: 'street', group: 'green', label: 'The Plaza', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
				{ id: 'united-airlines', kind: 'railroad', group: 'railroads', label: 'United Airlines', price: 200 },
				{ id: 'chance-north', kind: 'card', deckId: 'chance', label: 'Chance', text: 'NEW YORK LOTTERY GAMES' },
				{ id: 'tiffany-co', kind: 'street', group: 'blue', label: 'Tiffany & CO.', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
				{ id: 'luxury-tax', kind: 'tax', label: 'LUXURY TAX', text: 'Pay $75', tax: 75, onLand: luxuryTax },
				{ id: 'trump-tower', kind: 'street', group: 'blue', label: 'TRUMP TOWER', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 }
			]
		});
	}

	function buildCommunityChestCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(game, p, context) { p.heldCards.push(context.cardId); });
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
		cards[13] = new Card("You have won kiss cash! Advance to GO (Collect $200)", function(game) { game.advanceToSquare('go', 'always');});
		cards[14] = new Card("You are assessed for street repairs. $40 per house. $115 per hotel.", function(game) { game.streetRepairs(40, 115, 'Community Chest');});
		cards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass GO. Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	function buildChanceCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail free. This card may be kept until needed or sold.", function(game, p, context) { p.heldCards.push(context.cardId); });
		cards[1] = new Card("Make general repairs on all your property. For each house pay $25. For each hotel $100.", function(game) { game.streetRepairs(25, 100, 'Chance');});
		cards[2] = new Card("Pay poor tax of $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[3] = new Card("You have been elected chairman of Con Edison. Pay each player $50.", function(game) { game.payEachPlayer(50, 'Chance');});
		cards[4] = new Card("Go back 3 spaces.", function(game) { game.moveRelative(-3);});
		cards[5] = new Card("Advance token to the nearest Con Edison utility. If UNOWNED you may buy it from the bank. If OWNED, throw dice and pay owner a total of ten times the amount thrown.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.utilities.groupId);});
		cards[6] = new Card("Citibank pays you interest of $50.", function(game) { game.addAmount(50, 'Chance');});
		cards[7] = new Card("Advance token to the nearest Transportation and pay owner Twice the Rental to which they are otherwise entitled. If Transportation is unowned, you may buy it from the Bank.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.railroads.groupId);});
		cards[8] = new Card("Take a walk past The Essex House. Advance to GO. Collect $200.", function(game) { game.advanceToSquare('go', 'always');});
		cards[9] = new Card("Take a ride to the Regency Hotel! If you pass GO collect $200.", function(game) { game.advanceToSquare('the-regency-hotel', 'onCrossing');});
		cards[10] = new Card("Take a walk on fifth avenue. Advance token to Trump Tower.", function(game) { game.advanceToSquare('trump-tower', 'never');});
		cards[11] = new Card("Advance to thirteen.", function(game) { game.advanceToSquare('thirteen-wnet', 'never');});
		cards[12] = new Card("Your Smith Barney mutual fund pays dividend. Collect $150.", function(game) { game.addAmount(150, 'Chance');});
		cards[13] = new Card("Advance token to the nearest Transportation and pay owner Twice the Rental to which they are otherwise entitled.\n\nIf Transportation is unowned, you may buy it from the Bank.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.railroads.groupId);});
		cards[14] = new Card("Catch a bus to Central Park. If you pass GO, collect $200.", function(game) { game.advanceToSquare('central-park', 'onCrossing');});
		cards[15] = new Card("Go directly to Jail. Do not pass GO, do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	Monopoly.Editions.register("NYC", {
		buildBoard: buildBoard,
		buildCardDecks: function() {
			return {
				'community-chest': { label: 'Community Chest', icon: 'images/community_chest_icon.png', cards: buildCommunityChestCards(), keepable: [0], continueTurn: [13, 15] },
				chance: { label: 'Chance', icon: 'images/chance_icon.png', cards: buildChanceCards(), keepable: [0], continueTurn: [4, 5, 7, 8, 9, 10, 11, 13, 14, 15] }
			};
		}
	});
})(typeof window !== 'undefined' ? window : globalThis);
