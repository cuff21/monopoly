// Turn state machine: dice rolls, movement, landing effects, Chance/Community Chest, jail.

async function chanceCommunityChest() {
	var p = player[turn];

	// Community Chest
	if (p.position === 2 || p.position === 17 || p.position === 33) {
		var communityChestIndex = communityChestCards.deck[communityChestCards.index];

		// Remove the get out of jail free card from the deck.
		if (communityChestIndex === 0) {
			communityChestCards.deck.splice(communityChestCards.index, 1);
		}
		var communityChestAnimation = updateDrawnCard("community-chest", communityChestIndex);
		if (p.human) {
			await communityChestAnimation;
		} else {
			await Promise.all([communityChestAnimation, sleep(500)]);
		}

		if (p.human) {
			popup("<img src='images/community_chest_icon.png' style='height: 50px; width: 53px; float: left; margin: 8px 8px 0px 0px;' /><div style='font-weight: bold; font-size: 16px; '>Community Chest:</div><div style='text-align: justify;'>" + communityChestCards[communityChestIndex].text + "</div>", function() {
				communityChestAction(communityChestIndex);
			});
		} else {
			communityChestAction(communityChestIndex);
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
		var chanceAnimation = updateDrawnCard("chance", chanceIndex);
		if (p.human) {
			await chanceAnimation;
		} else {
			await Promise.all([chanceAnimation, sleep(500)]);
		}

		if (p.human) {
			popup("<img src='images/chance_icon.png' style='height: 50px; width: 26px; float: left; margin: 8px 8px 0px 0px;' /><div style='font-weight: bold; font-size: 16px; '>Chance:</div><div style='text-align: justify;'>" + chanceCards[chanceIndex].text + "</div>", function() {
				chanceAction(chanceIndex);
			});
		} else {
			chanceAction(chanceIndex);
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

	updateMoney();

    console.log("CHANCE INDEX!!!!! " + chanceIndex);

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

	updateMoney();

    console.log("COMMUNITY INDEX!!!!! " + communityChestIndex);
    
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

	addAlert(p.name + " received $" + amount + " from " + cause + ".");
}

function addTaxToFreeParking(amount) {
	freeParkingPot += amount;
	updateFreeParkingDisplay();
	addAlert(player[turn].name + " added $" + amount + " to Free Parking.");
}

function collectFreeParking() {
	var p = player[turn];
	if (freeParkingPot > 0) {
		p.money += freeParkingPot;
		addAlert(p.name + " collected $" + freeParkingPot + " from Free Parking.");
		freeParkingPot = 0;
		updateFreeParkingDisplay();
	}
}

function subtractamount(amount, cause) {
	var p = player[turn];

	p.pay(amount, 0);
	if (freeParkingTaxes) {
		addTaxToFreeParking(amount);
	} else {
		addAlert(p.name + " lost $" + amount + " from " + cause + ".");
	}
}

async function gotojail() {
	var p = player[turn];
	addAlert(p.name + " was sent directly to jail.");
	document.getElementById("landed").innerHTML = "You are in jail.";

	p.jail = true;
	doublecount = 0;

	document.getElementById("nextbutton").value = "End turn";
	document.getElementById("nextbutton").title = "End turn and advance to the next player.";

	if (p.human) {
		document.getElementById("nextbutton").focus();
	}

	await updatePosition();
	updateOwned();

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

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			player[i].money += amount;
			total += amount;
			creditor = p.money >= 0 ? i : creditor;

			p.pay(amount, creditor);
		}
	}

	addAlert(p.name + " lost $" + total + " from " + cause + ".");
}

function collectfromeachplayer(amount, cause) {
	var p = player[turn];
	var total = 0;

	for (var i = 1; i <= pcount; i++) {
		if (i != turn) {
			money = player[i].money;
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

	addAlert(p.name + " received $" + total + " from " + cause + ".");
}

async function advance(destination, pass) {
	var p = player[turn];

	if (typeof pass === "number") {
		if (p.position < pass) {
			p.position = pass;
		} else {
			p.position = pass;
			p.money += 200;
			addAlert(p.name + " collected a $200 salary for passing GO.");
		}
	}
	if (p.position < destination) {
		p.position = destination;
	} else {
		p.position = destination;
		p.money += 200;
		addAlert(p.name + " collected a $200 salary for passing GO.");
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
		addAlert(p.name + " collected a $200 salary for passing GO.");
	}

	await land(true);
}

async function advanceToNearestRailroad() {
	var p = player[turn];

	await updatePosition();

	if (p.position < 15) {
		p.position = 15;
	} else if (p.position >= 15 && p.position < 25) {
		p.position = 25;
	} else if (p.position >= 35) {
		p.position = 5;
		p.money += 200;
		addAlert(p.name + " collected a $200 salary for passing GO.");
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
			addAlert(p.name + " lost $" + cost + " to Community Chest.");
		} else {
			addAlert(p.name + " lost $" + cost + " to Chance.");
		}
	}

}

async function payfifty() {
	var p = player[turn];

	document.getElementById("jail").style.border = '1px solid black';
	document.getElementById("cell11").style.border = '2px solid ' + p.color;

	$("#landed").hide();
	doublecount = 0;

	p.jail = false;
	p.jailroll = 0;
	p.position = 10;
	p.pay(50, 0);

	addAlert(p.name + " paid the $50 fine to get out of jail.");
	updateMoney();
	await updatePosition();
}

async function useJailCard() {
	var p = player[turn];

	document.getElementById("jail").style.border = '1px solid black';
	document.getElementById("cell11").style.border = '2px solid ' + p.color;

	$("#landed").hide();
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

	addAlert(p.name + " used a \"Get Out of Jail Free\" card.");
	updateOwned();
	await updatePosition();
}

async function land(increasedRent) {
	increasedRent = !!increasedRent; // Cast increasedRent to a boolean value. It is used for the ADVANCE TO THE NEAREST RAILROAD/UTILITY Chance cards.

	var p = player[turn];
	var s = square[p.position];

	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	$("#landed").show();
	document.getElementById("landed").innerHTML = "You landed on " + s.name + ".";
	s.landcount++;
	addAlert(p.name + " landed on " + s.name + ".");

	// Allow player to buy the property on which he landed.
	if (s.price !== 0 && s.owner === 0) {

		if (!p.human) {

			if (p.AI.buyProperty(p.position)) {
				buy();
			} else if (auctionEnabled) {
				pendingAuction = p.position;
			}
		} else {
			document.getElementById("landed").innerHTML = "<div>You landed on <a href='javascript:void(0);' onmouseover='showdeed(" + p.position + ");' onmouseout='hidedeed();' class='statscellcolor'>" + s.name + "</a>.<input type='button' id='buypropertybutton' onclick='buy();' value='Buy ($" + s.price + ")' title='Buy " + s.name + " for " + s.pricetext + ".'/></div>";
			if (auctionEnabled) {
				pendingAuction = p.position;
				document.getElementById("nextbutton").value = "Auction property";
				document.getElementById("nextbutton").title = "Send the declined property to auction and advance the turn.";
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
				sq = square[i];
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

		addAlert(p.name + " paid $" + rent + " rent to " + player[s.owner].name + ".");
		p.pay(rent, s.owner);
		player[s.owner].money += rent;

		document.getElementById("landed").innerHTML = "You landed on " + s.name + ". " + player[s.owner].name + " collected $" + rent + " rent.";
	} else if (s.owner > 0 && s.owner != turn && s.mortgage) {
		document.getElementById("landed").innerHTML = "You landed on " + s.name + ". Property is mortgaged; no rent was collected.";
	}

	// City Tax
	if (p.position === 4) {
		Monopoly.Editions.getActive().tax.city();
	}

	// Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.
	if (p.position === 30) {
		updateMoney();
		await updatePosition();

		if (p.human) {
			popup("<div>Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.</div>", gotojail);
		} else {
			await gotojail();
		}

		return;
	}

	// Luxury Tax
	if (p.position === 38) {
		Monopoly.Editions.getActive().tax.luxury();
	}

	// Free Parking
	if (p.position === 20) {
		collectFreeParking();
	}

	updateMoney();
	await updatePosition();
	updateOwned();

	if (!p.human) {
		p.AI.alertList = "";
		await chanceCommunityChest();
	} else {
		await chanceCommunityChest();
	}
}

async function roll() {
	var p = player[turn];

	$("#option").hide();
	$("#buy").show();
	$("#manage").hide();

	if (p.human) {
		document.getElementById("nextbutton").focus();
	}
	document.getElementById("nextbutton").value = "End turn";
	document.getElementById("nextbutton").title = "End turn and advance to the next player.";

	game.rollDice();
	var die1 = game.getDie(1);
	var die2 = game.getDie(2);

	doublecount++;

	if (die1 == die2) {
		addAlert(p.name + " rolled " + (die1 + die2) + " - doubles.");
	} else {
		addAlert(p.name + " rolled " + (die1 + die2) + ".");
	}

	if (die1 == die2 && !p.jail) {
		updateDice(die1, die2);

		if (doublecount < 3) {
			document.getElementById("nextbutton").value = "Roll again";
			document.getElementById("nextbutton").title = "You threw doubles. Roll again.";

		// If player rolls doubles three times in a row, send him to jail
		} else if (doublecount === 3) {
			p.jail = true;
			doublecount = 0;
			addAlert(p.name + " rolled doubles three times in a row.");
			updateMoney();


			if (p.human) {
				popup("You rolled doubles three times in a row. Go to jail.", gotojail);
			} else {
				await gotojail();
			}

			return;
		}
	} else {
		document.getElementById("nextbutton").value = "End turn";
		document.getElementById("nextbutton").title = "End turn and advance to the next player.";
		doublecount = 0;
	}

	await updatePosition();
	updateMoney();
	updateOwned();

	if (p.jail === true) {
		p.jailroll++;

		updateDice(die1, die2);
		if (die1 == die2) {
			document.getElementById("jail").style.border = "1px solid black";
			document.getElementById("cell11").style.border = "2px solid " + p.color;
			$("#landed").hide();

			p.jail = false;
			p.jailroll = 0;
			p.position = 10 + die1 + die2;
			doublecount = 0;

			addAlert(p.name + " rolled doubles to get out of jail.");

			await land();
		} else {
			if (p.jailroll === 3) {

				if (p.human) {
					popup("<p>You must pay the $50 fine.</p>", async function() {
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
				$("#landed").show();
				document.getElementById("landed").innerHTML = "You are in jail.";

				if (!p.human) {
					p.AI.alertList = "";
					game.next();
				}
			}
		}


	} else {
		updateDice(die1, die2);

		// Move player
		p.position += die1 + die2;

		// Collect $200 salary as you pass GO
		if (p.position >= 40) {
			p.position -= 40;
			p.money += 200;
			addAlert(p.name + " collected a $200 salary for passing GO.");
		}

		await land();
	}
}

async function play() {
	if (game.auction()) {
		return;
	}

	turn++;
	if (turn > pcount) {
		turn -= pcount;
	}

	var p = player[turn];
	game.resetDice();

	document.getElementById("pname").innerHTML = p.name;

	addAlert("It is " + p.name + "'s turn.");

	// Check for bankruptcy.
	p.pay(0, p.creditor);

	$("#landed, #option, #manage").hide();
	$("#board, #control, #moneybar, #viewstats, #buy").show();

	doublecount = 0;
	document.getElementById("nextbutton").value = "Roll Dice";
	document.getElementById("nextbutton").title = "Roll the dice and move your token accordingly.";

	$("#die0").hide();
	$("#die1").hide();

	if (p.jail) {
		$("#landed").show();
		document.getElementById("landed").innerHTML = "You are in jail.<input type='button' title='Pay $50 fine to get out of jail immediately.' value='Pay $50 fine' onclick='payfifty();' />";

		if (p.communityChestJailCard || p.chanceJailCard) {
			document.getElementById("landed").innerHTML += "<input type='button' id='gojfbutton' title='Use &quot;Get Out of Jail Free&quot; card.' onclick='useJailCard();' value='Use Card' />";
		}

		document.getElementById("nextbutton").title = "Roll the dice. If you throw doubles, you will get out of jail.";

		if (p.jailroll === 0)
			addAlert("This is " + p.name + "'s first turn in jail.");
		else if (p.jailroll === 1)
			addAlert("This is " + p.name + "'s second turn in jail.");
		else if (p.jailroll === 2) {
			document.getElementById("landed").innerHTML += "<div>NOTE: If you do not throw doubles after this roll, you <i>must</i> pay the $50 fine.</div>";
			addAlert("This is " + p.name + "'s third turn in jail.");
		}

		if (!p.human && p.AI.postBail()) {
			if (p.communityChestJailCard || p.chanceJailCard) {
				await useJailCard();
			} else {
				await payfifty();
			}
		}
	}

	updateMoney();
	await updatePosition();
	updateOwned();

	$(".money-bar-arrow").hide();
	$("#p" + turn + "arrow").show();

	if (!p.human) {
		if (!p.AI.beforeTurn()) {
			game.next();
		}
	}
}
