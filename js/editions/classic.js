// Classic US edition: standard board, deeds, and card decks.
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

	function fixedTax(context) {
		var game = context.game;
		var state = context.state;
		var player = GameStateContext.getPlayerById(state, context.playerId);
		var square = global.getSquare(state.board, context.squareId);
		var amount = square.rules.taxAmount;
		var name = square.presentation.label;
		if (state.freeParkingTaxes) {
			game.addTaxToFreeParking(amount);
		} else {
			context.ui.alert(player.name + " paid $" + amount + " for landing on " + name + ".");
		}
		player.pay(amount, 0);
		context.ui.displayLanded("You landed on " + name + ". Pay $" + amount + ".");
	}

	function buildBoard() {
		return new Board({
			editionId: 'Classic',
			groups: [
				{ id: 'railroads', label: 'Railroads', color: '#FFFFFF', rent: [25, 50, 100, 200, 400], presentation: { tokenImage: { src: 'images/train_icon.png', height: 60, width: 65 } } },
				{ id: 'utilities', label: 'Utilities', color: '#FFFFFF', rent: [4, 10, 10, 10, 10], presentation: { rentText: formatUtilityRent } },
				{ id: 'brown', label: 'Brown', color: '#8B4513' },
				{ id: 'light-blue', label: 'Light Blue', color: '#87CEEB' },
				{ id: 'pink', label: 'Pink', color: '#D63384' },
				{ id: 'orange', label: 'Orange', color: '#FFA500' },
				{ id: 'red', label: 'Red', color: '#FF0000' },
				{ id: 'yellow', label: 'Yellow', color: '#FFFF00' },
				{ id: 'green', label: 'Green', color: '#008000' },
				{ id: 'blue', label: 'Blue', color: '#0000FF' }
			],
			squares: [
				{ id: 'go', kind: 'go', label: 'GO', text: 'COLLECT $200 SALARY AS YOU PASS.' },
				{ id: 'mediterranean-avenue', kind: 'street', group: 'brown', label: 'Mediterranean Avenue', price: 60, rent: [2, 10, 30, 90, 160, 250], houseCost: 50, presentation: { boardName: 'Mediter-ranean Avenue' } },
				{ id: 'community-chest-south', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'baltic-avenue', kind: 'street', group: 'brown', label: 'Baltic Avenue', price: 60, rent: [4, 20, 60, 180, 320, 450], houseCost: 50 },
				{ id: 'city-tax', kind: 'tax', label: 'City Tax', text: 'Pay $200', tax: 200, onLand: fixedTax },
				{ id: 'reading-railroad', kind: 'railroad', group: 'railroads', label: 'Reading Railroad', price: 200 },
				{ id: 'oriental-avenue', kind: 'street', group: 'light-blue', label: 'Oriental Avenue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
				{ id: 'chance-south', kind: 'card', deckId: 'chance', label: 'Chance', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'vermont-avenue', kind: 'street', group: 'light-blue', label: 'Vermont Avenue', price: 100, rent: [6, 30, 90, 270, 400, 550], houseCost: 50 },
				{ id: 'connecticut-avenue', kind: 'street', group: 'light-blue', label: 'Connecticut Avenue', price: 120, rent: [8, 40, 100, 300, 450, 600], houseCost: 50 },
				{ id: 'jail', kind: 'jail', label: 'Just Visiting' },
				{ id: 'st-charles-place', kind: 'street', group: 'pink', label: 'St. Charles Place', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
				{ id: 'electric-company', kind: 'utility', group: 'utilities', label: 'Electric Company', price: 150, presentation: { tokenImage: { src: 'images/electric_icon.png', height: 60, width: 48 } } },
				{ id: 'states-avenue', kind: 'street', group: 'pink', label: 'States Avenue', price: 140, rent: [10, 50, 150, 450, 625, 750], houseCost: 100 },
				{ id: 'virginia-avenue', kind: 'street', group: 'pink', label: 'Virginia Avenue', price: 160, rent: [12, 60, 180, 500, 700, 900], houseCost: 100 },
				{ id: 'pennsylvania-railroad', kind: 'railroad', group: 'railroads', label: 'Pennsylvania Railroad', price: 200 },
				{ id: 'st-james-place', kind: 'street', group: 'orange', label: 'St. James Place', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
				{ id: 'community-chest-west', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'tennessee-avenue', kind: 'street', group: 'orange', label: 'Tennessee Avenue', price: 180, rent: [14, 70, 200, 550, 750, 950], houseCost: 100 },
				{ id: 'new-york-avenue', kind: 'street', group: 'orange', label: 'New York Avenue', price: 200, rent: [16, 80, 220, 600, 800, 1000], houseCost: 100 },
				{ id: 'free-parking', kind: 'free-parking', label: 'Free Parking' },
				{ id: 'kentucky-avenue', kind: 'street', group: 'red', label: 'Kentucky Avenue', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
				{ id: 'chance-east', kind: 'card', deckId: 'chance', label: 'Chance', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'indiana-avenue', kind: 'street', group: 'red', label: 'Indiana Avenue', price: 220, rent: [18, 90, 250, 700, 875, 1050], houseCost: 150 },
				{ id: 'illinois-avenue', kind: 'street', group: 'red', label: 'Illinois Avenue', price: 240, rent: [20, 100, 300, 750, 925, 1100], houseCost: 150 },
				{ id: 'b-o-railroad', kind: 'railroad', group: 'railroads', label: 'B&O Railroad', price: 200 },
				{ id: 'atlantic-avenue', kind: 'street', group: 'yellow', label: 'Atlantic Avenue', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
				{ id: 'ventnor-avenue', kind: 'street', group: 'yellow', label: 'Ventnor Avenue', price: 260, rent: [22, 110, 330, 800, 975, 1150], houseCost: 150 },
				{ id: 'water-works', kind: 'utility', group: 'utilities', label: 'Water Works', price: 150, presentation: { tokenImage: { src: 'images/water_icon.png', height: 60, width: 78 } } },
				{ id: 'marvin-gardens', kind: 'street', group: 'yellow', label: 'Marvin Gardens', price: 280, rent: [24, 120, 360, 850, 1025, 1200], houseCost: 150 },
				{ id: 'go-to-jail', kind: 'go-to-jail', label: 'Go to Jail', text: 'Go directly to Jail. Do not pass GO. Do not collect $200.' },
				{ id: 'pacific-avenue', kind: 'street', group: 'green', label: 'Pacific Avenue', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
				{ id: 'north-carolina-avenue', kind: 'street', group: 'green', label: 'North Carolina Avenue', price: 300, rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200 },
				{ id: 'community-chest-east', kind: 'card', deckId: 'community-chest', label: 'Community Chest', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'pennsylvania-avenue', kind: 'street', group: 'green', label: 'Pennsylvania Avenue', price: 320, rent: [28, 150, 450, 1000, 1200, 1400], houseCost: 200 },
				{ id: 'short-line', kind: 'railroad', group: 'railroads', label: 'Short Line', price: 200 },
				{ id: 'chance-north', kind: 'card', deckId: 'chance', label: 'Chance', text: 'FOLLOW INSTRUCTIONS ON TOP CARD' },
				{ id: 'park-place', kind: 'street', group: 'blue', label: 'Park Place', price: 350, rent: [35, 175, 500, 1100, 1300, 1500], houseCost: 200 },
				{ id: 'luxury-tax', kind: 'tax', label: 'LUXURY TAX', text: 'Pay $100', tax: 100, onLand: fixedTax },
				{ id: 'boardwalk', kind: 'street', group: 'blue', label: 'Boardwalk', price: 400, rent: [50, 200, 600, 1400, 1700, 2000], houseCost: 200 }
			]
		});
	}

	function buildCommunityChestCards() {
		var cards = [];

		cards[0] = new Card("Get out of Jail, Free. This card may be kept until needed or sold.", function(game, p, context) {
			p.heldCards.push(context.cardId);
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
		cards[13] = new Card("Advance to \"GO\" (Collect $200).", function(game) { game.advanceToSquare('go', 'always');});
		cards[14] = new Card("You are assessed for street repairs. $40 per house. $115 per hotel.", function(game) { game.streetRepairs(40, 115, 'Community Chest');});
		cards[15] = new Card("Go to Jail. Go directly to Jail. Do not pass \"GO\". Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	function buildChanceCards() {
		var cards = [];

		cards[0] = new Card("GET OUT OF JAIL FREE. This card may be kept until needed or traded.", function(game, p, context) {
			p.heldCards.push(context.cardId);
		});
		cards[1] = new Card("Make General Repairs on All Your Property. For each house pay $25. For each hotel $100.", function(game) { game.streetRepairs(25, 100, 'Chance');});
		cards[2] = new Card("Speeding fine $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[3] = new Card("You have been elected chairman of the board. Pay each player $50.", function(game) { game.payEachPlayer(50, 'Chance');});
		cards[4] = new Card("Go back three spaces.", function(game) { game.moveRelative(-3);});
		cards[5] = new Card("ADVANCE TO THE NEAREST UTILITY. IF UNOWNED, you may buy it from the Bank. IF OWNED, throw dice and pay owner a total ten times the amount thrown.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.utilities.groupId);});
		cards[6] = new Card("Bank pays you dividend of $50.", function(game) { game.addAmount(50, 'Chance');});
		cards[7] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.railroads.groupId);});
		cards[8] = new Card("Pay poor tax of $15.", function(game) { game.subtractAmount(15, 'Chance');});
		cards[9] = new Card("Take a trip to Reading Rail Road. If you pass \"GO\" collect $200.", function(game) { game.advanceToSquare('reading-railroad', 'onCrossing');});
		cards[10] = new Card("ADVANCE to Boardwalk.", function(game) { game.advanceToSquare('boardwalk', 'never');});
		cards[11] = new Card("ADVANCE to Illinois Avenue. If you pass \"GO\" collect $200.", function(game) { game.advanceToSquare('illinois-avenue', 'onCrossing');});
		cards[12] = new Card("Your building loan matures. Collect $150.", function(game) { game.addAmount(150, 'Chance');});
		cards[13] = new Card("ADVANCE TO THE NEAREST RAILROAD. If UNOWNED, you may buy it from the Bank. If OWNED, pay owner twice the rental to which they are otherwise entitled.", function(game) { game.advanceToGroupNearest(game.state.board.groupsById.railroads.groupId);});
		cards[14] = new Card("ADVANCE to St. Charles Place. If you pass \"GO\" collect $200.", function(game) { game.advanceToSquare('st-charles-place', 'onCrossing');});
		cards[15] = new Card("Go to Jail. Go Directly to Jail. Do not pass \"GO\". Do not collect $200.", function(game) { game.goToJail();});

		return cards;
	}

	var _Monopoly = (typeof Monopoly !== 'undefined') ? Monopoly : global.Monopoly;
	if (_Monopoly && _Monopoly.Editions) {
		_Monopoly.Editions.register("Classic", {
			buildBoard: buildBoard,
			buildCardDecks: function() {
				return {
					'community-chest': { label: 'Community Chest', icon: 'images/community_chest_icon.png', cards: buildCommunityChestCards(), keepable: [0], continueTurn: [13, 15] },
					chance: { label: 'Chance', icon: 'images/chance_icon.png', cards: buildChanceCards(), keepable: [0], continueTurn: [4, 5, 7, 9, 10, 11, 13, 14, 15] }
				};
			}
		});
	}
})(typeof window !== 'undefined' ? window : globalThis);
