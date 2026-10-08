// Turn state machine: dice rolls, movement, landing effects, Chance/Community Chest, jail.

function turnFlowUI(method) {
	var ui = typeof game !== 'undefined' && game ? game.ui : null;
	if (!ui || typeof ui[method] !== 'function') return;
	return ui[method].apply(ui, Array.prototype.slice.call(arguments, 1));
}

async function chanceCommunityChest() {
	var p = player[turn];
	var ui = game.ui;
	var isHeadless = ui.isHeadless;

	// Community Chest
	if (p.position === 2 || p.position === 17 || p.position === 33) {
		var communityChestIndex = communityChestCards.deck[communityChestCards.index];

		// Remove the get out of jail free card from the deck.
		if (communityChestIndex === 0) {
			communityChestCards.deck.splice(communityChestCards.index, 1);
		}
		if (isHeadless) {
			communityChestAction(communityChestIndex);
		} else {
			var communityChestAnimation = ui.updateDrawnCard("community-chest", communityChestIndex);
			if (p.human) {
				await communityChestAnimation;
				ui.showCard("community-chest", communityChestCards[communityChestIndex].text, function() {
					communityChestAction(communityChestIndex);
				});
			} else {
				await Promise.all([communityChestAnimation, ui.delay(500)]);
				communityChestAction(communityChestIndex);
			}
		}

		communityChestCards.index++;

		if (communityChestCards.index >= communityChestCards.deck.length) {
			communityChestCards.index = 0;
		}

	// Chance
	} else if (p.position === 7 || p.position === 22 || p.position === 36) {
		var chanceIndex = chanceCards.deck[chanceCards.index];

		// Remove the get out of jail free card from the deck.
		if (chanceIndex === 0) {
			chanceCards.deck.splice(chanceCards.index, 1);
		}
		if (isHeadless) {
			chanceAction(chanceIndex);
		} else {
			var chanceAnimation = ui.updateDrawnCard("chance", chanceIndex);
			if (p.human) {
				await chanceAnimation;
				ui.showCard("chance", chanceCards[chanceIndex].text, function() {
					chanceAction(chanceIndex);
				});
			} else {
				await Promise.all([chanceAnimation, ui.delay(500)]);
				chanceAction(chanceIndex);
			}
		}

		chanceCards.index++;

		if (chanceCards.index >= chanceCards.deck.length) {
			chanceCards.index = 0;
		}
	} else {
		if (!p.human) {
			p.AI.alertList = "";

			if (!p.AI.onLand()) {
				game.next();
			}
		}
	}
}

function chanceAction(chanceIndex) {
	var p = player[turn]; // This is needed for reference in action() method.

	chanceCards[chanceIndex].action(p);

	turnFlowUI("updateOwned");
	turnFlowUI("updateMoney");

	if (chanceIndex !== 15 && !p.human) {
		p.AI.alertList = "";
	}
	if(!p.human && [0, 1, 2, 3, 6, 8, 12].includes(chanceIndex)) {
        game.next();
    }
}

function communityChestAction(communityChestIndex) {
	var p = player[turn]; // This is needed for reference in action() method.

	communityChestCards[communityChestIndex].action(p);

	turnFlowUI("updateOwned");
	turnFlowUI("updateMoney");

	if (communityChestIndex !== 15 && !p.human) {
		p.AI.alertList = "";
	}
	if(!p.human && !([13, 15].includes(communityChestIndex))) {
        game.next();
    }
}

function addamount(amount, cause) {
	var p = player[turn];

	p.money += amount;

	turnFlowUI("alert", p.name + " received $" + amount + " from " + cause + ".");
}

function addTaxToFreeParking(amount) {
	freeParkingPot += amount;
	turnFlowUI("updateFreeParking");
	turnFlowUI("alert", player[turn].name + " added $" + amount + " to Free Parking.");
}

function collectFreeParking() {
	var p = player[turn];
	if (freeParkingPot > 0) {
		p.money += freeParkingPot;
		turnFlowUI("alert", p.name + " collected $" + freeParkingPot + " from Free Parking.");
		freeParkingPot = 0;
		turnFlowUI("updateFreeParking");
	}
}

function subtractamount(amount, cause) {
	var p = player[turn];

	p.pay(amount, 0);
	if (freeParkingTaxes) {
		addTaxToFreeParking(amount);
	} else {
		turnFlowUI("alert", p.name + " lost $" + amount + " from " + cause + ".");
	}
}

async function gotojail() {
	var p = player[turn];
	turnFlowUI("alert", p.name + " was sent directly to jail.");
	turnFlowUI("displayLanded", "You are in jail.");

	p.jail = true;
	doublecount = 0;

	turnFlowUI("updateButtonState", "End turn", "End turn and advance to the next player.");

	if (p.human) turnFlowUI("focusNextButton");

	await turnFlowUI("updatePosition");
	turnFlowUI("updateOwned");

	if (!p.human) {
		p.AI.alertList = "";
		game.next();
	}
}

async function gobackthreespaces() {
	var p = player[turn];

	p.position -= 3;
	nextMoveDirection = -1;

	await land();
}

function payeachplayer(amount, cause) {
	var p = player[turn];
	var total = 0;
	var creditor;

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			player[i].money += amount;
			total += amount;
			creditor = p.money >= 0 ? i : creditor;

			p.pay(amount, creditor);
		}
	}

	turnFlowUI("alert", p.name + " lost $" + total + " from " + cause + ".");
}

function collectfromeachplayer(amount, cause) {
	var p = player[turn];
	var total = 0;

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			var money = player[i].money;
			if (money < amount) {
				p.money += money;
				total += money;
				player[i].money = 0;
			} else {
				player[i].pay(amount, turn);
				p.money += amount;
				total += amount;
			}
		}
	}

	turnFlowUI("alert", p.name + " received $" + total + " from " + cause + ".");
}

async function advance(destination, pass) {
	var p = player[turn];

	if (typeof pass === "number") {
		if (p.position < pass) {
			p.position = pass;
		} else {
			p.position = pass;
			p.money += 200;
			turnFlowUI("alert", p.name + " collected a $200 salary for passing GO.");
		}
	}
	if (p.position < destination) {
		p.position = destination;
	} else {
		p.position = destination;
		p.money += 200;
		turnFlowUI("alert", p.name + " collected a $200 salary for passing GO.");
	}

	await land();
}

async function advanceToNearestUtility() {
	var p = player[turn];

	if (p.position < 12) {
		p.position = 12;
	} else if (p.position >= 12 && p.position < 28) {
		p.position = 28;
	} else if (p.position >= 28) {
		p.position = 12;
		p.money += 200;
		turnFlowUI("alert", p.name + " collected a $200 salary for passing GO.");
	}

	await land(true);
}

async function advanceToNearestRailroad() {
	var p = player[turn];

	await turnFlowUI("updatePosition");

	if (p.position < 15) {
		p.position = 15;
	} else if (p.position >= 15 && p.position < 25) {
		p.position = 25;
	} else if (p.position >= 35) {
		p.position = 5;
		p.money += 200;
		turnFlowUI("alert", p.name + " collected a $200 salary for passing GO.");
	}

	await land(true);
}

function streetrepairs(houseprice, hotelprice) {
	var cost = 0;
	for (var i = 0; i < 40; i++) {
		var s = square[i];
		if (s.owner == turn) {
			if (s.hotel == 1)
				cost += hotelprice;
			else
				cost += s.house * houseprice;
		}
	}

	var p = player[turn];

	if (cost > 0) {
		p.pay(cost, 0);

		if (freeParkingTaxes) {
			addTaxToFreeParking(cost);
		} else if (houseprice === 40) {
			turnFlowUI("alert", p.name + " lost $" + cost + " to Community Chest.");
		} else {
			turnFlowUI("alert", p.name + " lost $" + cost + " to Chance.");
		}
	}

}

async function payfifty() {
	var p = player[turn];

	turnFlowUI("onLeaveJail", p.color);
	doublecount = 0;

	p.jail = false;
	p.jailroll = 0;
	p.position = 10;
	p.pay(50, 0);

	turnFlowUI("alert", p.name + " paid the $50 fine to get out of jail.");
	turnFlowUI("updateMoney");
	await turnFlowUI("updatePosition");
}

async function useJailCard() {
	var p = player[turn];

	turnFlowUI("onLeaveJail", p.color);
	p.jail = false;
	p.jailroll = 0;

	p.position = 10;

	doublecount = 0;

	if (p.communityChestJailCard) {
		p.communityChestJailCard = false;

		// Insert the get out of jail free card back into the community chest deck.
		communityChestCards.deck.splice(communityChestCards.index, 0, 0);

		communityChestCards.index++;

		if (communityChestCards.index >= communityChestCards.deck.length) {
			communityChestCards.index = 0;
		}
	} else if (p.chanceJailCard) {
		p.chanceJailCard = false;

		// Insert the get out of jail free card back into the chance deck.
		chanceCards.deck.splice(chanceCards.index, 0, 0);

		chanceCards.index++;

		if (chanceCards.index >= chanceCards.deck.length) {
			chanceCards.index = 0;
		}
	}

	turnFlowUI("alert", p.name + " used a \"Get Out of Jail Free\" card.");
	turnFlowUI("updateOwned");
	await turnFlowUI("updatePosition");
}

async function land(increasedRent) {
	increasedRent = !!increasedRent; // Cast increasedRent to a boolean value. It is used for the ADVANCE TO THE NEAREST RAILROAD/UTILITY Chance cards.

	var p = player[turn];
	var s = square[p.position];

	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	turnFlowUI("displayLanded", "You landed on " + s.name + ".");
	s.landcount++;
	turnFlowUI("alert", p.name + " landed on " + s.name + ".");

	// Allow player to buy the property on which he landed.
	if (s.price !== 0 && s.owner === 0) {

		if (!p.human) {

			if (p.AI.buyProperty(p.position)) {
				buy();
			} else if (auctionEnabled) {
				pendingAuction = p.position;
			}
		} else {
			turnFlowUI("displayPropertyPurchase", p.position, s);
			if (auctionEnabled) {
				pendingAuction = p.position;
				turnFlowUI("updateButtonState", "Auction property", "Send the declined property to auction and advance the turn.");
			}
		}


	}

	// Collect rent
	if (s.owner !== 0 && s.owner != turn && !s.mortgage) {
		var groupowned = true;
		var rent;

		// Railroads
		if (p.position == 5 || p.position == 15 || p.position == 25 || p.position == 35) {
			if (increasedRent) {
				rent = 25;
			} else {
				rent = 12.5;
			}

			if (s.owner == square[5].owner) {
				rent *= 2;
			}
			if (s.owner == square[15].owner) {
				rent *= 2;
			}
			if (s.owner == square[25].owner) {
				rent *= 2;
			}
			if (s.owner == square[35].owner) {
				rent *= 2;
			}

		} else if (p.position === 12) {
			if (increasedRent || square[28].owner == s.owner) {
				rent = (die1 + die2) * 10;
			} else {
				rent = (die1 + die2) * 4;
			}

		} else if (p.position === 28) {
			if (increasedRent || square[12].owner == s.owner) {
				rent = (die1 + die2) * 10;
			} else {
				rent = (die1 + die2) * 4;
			}

		} else {

			for (var i = 0; i < 40; i++) {
				var sq = square[i];
				if (sq.groupNumber == s.groupNumber && sq.owner != s.owner) {
					groupowned = false;
				}
			}

			if (!groupowned) {
				rent = s.baserent;
			} else {
				if (s.house === 0) {
					rent = s.baserent * 2;
				} else {
					rent = s["rent" + s.house];
				}
			}
		}

		turnFlowUI("alert", p.name + " paid $" + rent + " rent to " + player[s.owner].name + ".");
		p.pay(rent, s.owner);
		player[s.owner].money += rent;

		turnFlowUI("displayLanded", "You landed on " + s.name + ". " + player[s.owner].name + " collected $" + rent + " rent.");
	} else if (s.owner > 0 && s.owner != turn && s.mortgage) {
		turnFlowUI("displayLanded", "You landed on " + s.name + ". Property is mortgaged; no rent was collected.");
	}

	if (typeof s.onLand === 'function') {
		await s.onLand({
			game: game,
			player: p,
			square: s,
			squares: square,
			ui: game.ui,
			freeParkingTaxes: freeParkingTaxes,
			addTaxToFreeParking: addTaxToFreeParking
		});
	}

	// Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.
	if (p.position === 30) {
		turnFlowUI("updateMoney");
		await turnFlowUI("updatePosition");

		if (p.human) {
			turnFlowUI("showMessage", "Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.", gotojail);
		} else {
			await gotojail();
		}

		return;
	}

	// Free Parking
	if (p.position === 20) {
		collectFreeParking();
	}

	turnFlowUI("updateMoney");
	await turnFlowUI("updatePosition");
	turnFlowUI("updateOwned");

	if (!p.human) {
		p.AI.alertList = "";
		await chanceCommunityChest();
	} else {
		await chanceCommunityChest();
	}
}

async function roll() {
	var p = player[turn];

	turnFlowUI("onRollStart");

	if (p.human) turnFlowUI("focusNextButton");
	turnFlowUI("updateButtonState", "End turn", "End turn and advance to the next player.");

	game.rollDice();
	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	doublecount++;

	if (die1 == die2) {
		turnFlowUI("alert", p.name + " rolled " + (die1 + die2) + " - doubles.");
	} else {
		turnFlowUI("alert", p.name + " rolled " + (die1 + die2) + ".");
	}

	if (die1 == die2 && !p.jail) {
		turnFlowUI("updateDice", die1, die2);

		if (doublecount < 3) {
			turnFlowUI("updateButtonState", "Roll again", "You threw doubles. Roll again.");

		// If player rolls doubles three times in a row, send him to jail
		} else if (doublecount === 3) {
			p.jail = true;
			doublecount = 0;
			turnFlowUI("alert", p.name + " rolled doubles three times in a row.");
			turnFlowUI("updateMoney");

			if (p.human) {
				turnFlowUI("popup", "You rolled doubles three times in a row. Go to jail.", gotojail);
			} else {
				await gotojail();
			}

			return;
		}
	} else {
		turnFlowUI("updateButtonState", "End turn", "End turn and advance to the next player.");
		doublecount = 0;
	}

	await turnFlowUI("updatePosition");
	turnFlowUI("updateMoney");
	turnFlowUI("updateOwned");

	if (p.jail === true) {
		p.jailroll++;

		turnFlowUI("updateDice", die1, die2);
		if (die1 == die2) {
			turnFlowUI("onLeaveJail", p.color);

			p.jail = false;
			p.jailroll = 0;
			p.position = 10 + die1 + die2;
			doublecount = 0;

			turnFlowUI("alert", p.name + " rolled doubles to get out of jail.");

			await land();
		} else {
			if (p.jailroll === 3) {

				if (p.human) {
					turnFlowUI("showMessage", "You must pay the $50 fine.", async function() {
						await payfifty();
						player[turn].position=10 + die1 + die2;
						await land();
					});
				} else {
					await payfifty();
					p.position = 10 + die1 + die2;
					await land();
				}
			} else {
				turnFlowUI("displayLanded", "You are in jail.");

				if (!p.human) {
					p.AI.alertList = "";
					game.next();
				}
			}
		}


	} else {
		turnFlowUI("updateDice", die1, die2);

		// Move player
		p.position += die1 + die2;

		// Collect $200 salary as you pass GO
		if (p.position >= 40) {
			p.position -= 40;
			p.money += 200;
			turnFlowUI("alert", p.name + " collected a $200 salary for passing GO.");
		}

		await land();
	}
}

async function play() {
	if (typeof game !== 'undefined' && game) {
		if (game.isOver) {
			if (typeof game.onGameCompleted === 'function') game.onGameCompleted();
			return;
		}
		game.turnCount = (game.turnCount || 0) + 1;
		if (game.maxTurns && game.turnCount > game.maxTurns) {
			game.isOver = true;
			if (typeof game.onGameCompleted === 'function') game.onGameCompleted();
			return;
		}
	}

	if (game.auction()) {
		return;
	}

	turn++;
	if (turn > pcount) {
		turn -= pcount;
	}

	var p = player[turn];
	game.resetDice();

	if (typeof game !== 'undefined' && game && game.ui && typeof game.ui.updateTurnDisplay === 'function') {
		game.ui.updateTurnDisplay(p);
	}

	turnFlowUI("alert", "It is " + p.name + "'s turn.");

	// Check for bankruptcy.
	p.pay(0, p.creditor);

	turnFlowUI("onTurnStart", turn);

	doublecount = 0;
	turnFlowUI("updateButtonState", "Roll Dice", "Roll the dice and move your token accordingly.");
	turnFlowUI("setDiceVisible", false);

	if (p.jail) {
		turnFlowUI("displayJailOptions", p.communityChestJailCard || p.chanceJailCard, p.jailroll === 2);

		turnFlowUI("updateButtonState", undefined, "Roll the dice. If you throw doubles, you will get out of jail.");

		if (p.jailroll === 0)
			turnFlowUI("alert", "This is " + p.name + "'s first turn in jail.");
		else if (p.jailroll === 1)
			turnFlowUI("alert", "This is " + p.name + "'s second turn in jail.");
		else if (p.jailroll === 2) {
			turnFlowUI("alert", "This is " + p.name + "'s third turn in jail.");
		}

		if (!p.human && p.AI.postBail()) {
			if (p.communityChestJailCard || p.chanceJailCard) {
				await useJailCard();
			} else {
				await payfifty();
			}
		}
	}

	turnFlowUI("updateMoney");
	await turnFlowUI("updatePosition");
	turnFlowUI("updateOwned");

	if (!p.human) {
		if (!p.AI.beforeTurn()) {
			game.next();
		}
	}
}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.chanceCommunityChest = chanceCommunityChest;
_global.chanceAction = chanceAction;
_global.communityChestAction = communityChestAction;
_global.addamount = addamount;
_global.addTaxToFreeParking = addTaxToFreeParking;
_global.collectFreeParking = collectFreeParking;
_global.subtractamount = subtractamount;
_global.streetrepairs = streetrepairs;
_global.gotojail = gotojail;
_global.gobackthreespaces = gobackthreespaces;
_global.payeachplayer = payeachplayer;
_global.collectfromeachplayer = collectfromeachplayer;
_global.advance = advance;
_global.advanceToNearestUtility = advanceToNearestUtility;
_global.advanceToNearestRailroad = advanceToNearestRailroad;
_global.payfifty = payfifty;
_global.useJailCard = useJailCard;
_global.land = land;
_global.roll = roll;
_global.play = play;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		chanceCommunityChest: chanceCommunityChest,
		chanceAction: chanceAction,
		communityChestAction: communityChestAction,
		gotojail: gotojail,
		land: land,
		roll: roll,
		play: play
	};
}
