// Money bar, owned-properties panel, and alert log rendering.

function playerBadge(playerIndex) {
	if (!player[playerIndex]) {
		return "";
	}
	return "<span class='alert-badge' style='background-color: " + player[playerIndex].color + ";' title='" + player[playerIndex].name + "'></span>";
}

function addAlert(alertText, playerIndex, secondPlayerIndex) {
	$alert = $("#alert");
	playerIndex = playerIndex || turn;
	var alertElement = $(document.createElement("div"));
	alertElement.append(playerBadge(playerIndex));
	if (secondPlayerIndex) {
		alertElement.append(playerBadge(secondPlayerIndex));
	}
	alertElement.append(document.createTextNode(alertText)).appendTo($alert);

	// Animate scrolling down alert element.
	$alert.stop().animate({"scrollTop": $alert.prop("scrollHeight")}, 1000);

	if (!player[turn].human) {
		player[turn].AI.alertList += "<div>" + playerBadge(playerIndex) + (secondPlayerIndex ? playerBadge(secondPlayerIndex) : "") + alertText + "</div>";
	}
}

function formatTradeResult(label, tradeObj) {
	var initiator = tradeObj.getInitiator();
	var recipient = tradeObj.getRecipient();
	var offered = [];
	var requested = [];
	var money = tradeObj.getMoney();

	for (var i = 0; i < 40; i++) {
		if (tradeObj.getProperty(i) === 1) {
			offered.push(square[i].name);
		} else if (tradeObj.getProperty(i) === -1) {
			requested.push(square[i].name);
		}
	}
	if (tradeObj.getCommunityChestJailCard() === 1 || tradeObj.getChanceJailCard() === 1) {
		offered.push("Get Out of Jail Free card");
	}
	if (tradeObj.getCommunityChestJailCard() === -1 || tradeObj.getChanceJailCard() === -1) {
		requested.push("Get Out of Jail Free card");
	}

	return label + ": <table class='trade-summary'><tr><th>" + initiator.name + " gives</th><th>" + recipient.name + " gives</th></tr><tr><td>" + (offered.join(", ") || "Nothing") + (money > 0 ? " and $" + money : "") + "</td><td>" + (requested.join(", ") || "Nothing") + (money < 0 ? " and $" + (-money) : "") + "</td></tr></table>";
}

function updateMoney() {
	var p = player[turn];

	document.getElementById("pmoney").innerHTML = "$" + p.money;
	$(".money-bar-row").hide();

	for (var i = 1; i <= pcount; i++) {
		p_i = player[i];

		$("#moneybarrow" + i).show();
		document.getElementById("p" + i + "moneybar").style.border = "2px solid " + p_i.color;
		document.getElementById("p" + i + "money").innerHTML = p_i.money;
		document.getElementById("p" + i + "moneyname").innerHTML = p_i.name;
	}

	if (document.getElementById("landed").innerHTML === "") {
		$("#landed").hide();
	}

	document.getElementById("quickstats").style.borderColor = p.color;

	if (p.money < 0) {
		$("#resignbutton").show();
		$("#nextbutton").hide();
	} else {
		$("#resignbutton").hide();
		$("#nextbutton").show();
	}
}

function updateDice() {
	var die0 = game.getDie(1);
	var die1 = game.getDie(2);

	$("#die0").show();
	$("#die1").show();

	if (document.images) {
		var element0 = document.getElementById("die0");
		var element1 = document.getElementById("die1");

		element0.classList.remove("die-no-img");
		element1.classList.remove("die-no-img");

		element0.title = "Die (" + die0 + " spots)";
		element1.title = "Die (" + die1 + " spots)";

		if (element0.firstChild) {
			element0 = element0.firstChild;
		} else {
			element0 = element0.appendChild(document.createElement("img"));
		}

		element0.src = "images/Die_" + die0 + ".png";
		element0.alt = die0;

		if (element1.firstChild) {
			element1 = element1.firstChild;
		} else {
			element1 = element1.appendChild(document.createElement("img"));
		}

		element1.src = "images/Die_" + die1 + ".png";
		element1.alt = die1;
	} else {
		document.getElementById("die0").textContent = die0;
		document.getElementById("die1").textContent = die1;

		document.getElementById("die0").title = "Die";
		document.getElementById("die1").title = "Die";
	}
}

function updateOwned() {
	var p = player[turn];
	var checkedproperty = getCheckedProperty();
	$("#option").show();
	$("#owned").show();

	var HTML = "",
	firstproperty = -1;

	var mortgagetext = "",
	housetext = "";
	var sq;

	for (var i = 0; i < 40; i++) {
		sq = square[i];
		if (sq.groupNumber && sq.owner === 0) {
			$("#cell" + i + "owner").hide();
		} else if (sq.groupNumber && sq.owner > 0) {
			var currentCellOwner = document.getElementById("cell" + i + "owner");

			currentCellOwner.style.display = "block";
			currentCellOwner.style.backgroundColor = player[sq.owner].color;
			currentCellOwner.title = player[sq.owner].name;
		}
	}

	for (var i = 0; i < 40; i++) {
		sq = square[i];
		if (sq.owner == turn) {

			mortgagetext = "";
			if (sq.mortgage) {
				mortgagetext = "title='Mortgaged' style='color: grey;'";
			}

			housetext = "";
			if (sq.house >= 1 && sq.house <= 4) {
				for (var x = 1; x <= sq.house; x++) {
					housetext += "<img src='images/house.png' alt='' title='House' class='house' />";
				}
			} else if (sq.hotel) {
				housetext += "<img src='images/hotel.png' alt='' title='Hotel' class='hotel' />";
			}

			if (HTML === "") {
				HTML += "<table>";
				firstproperty = i;
			}

			HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox" + i + "' /></td><td class='propertycellcolor' style='background: " + sq.color + ";";

			if (sq.groupNumber == 1 || sq.groupNumber == 2) {
				HTML += " border: 1px solid grey; width: 18px;";
			}

			HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='propertycellname' " + mortgagetext + ">" + sq.name + housetext + "</td></tr>";
		}
	}

	if (p.communityChestJailCard) {
		if (HTML === "") {
			firstproperty = 40;
			HTML += "<table>";
		}
		HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox40' /></td><td class='propertycellcolor' style='background: white;'></td><td class='propertycellname'>Get Out of Jail Free Card</td></tr>";

	}
	if (p.chanceJailCard) {
		if (HTML === "") {
			firstproperty = 41;
			HTML += "<table>";
		}
		HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' id='propertycheckbox41' /></td><td class='propertycellcolor' style='background: white;'></td><td class='propertycellname'>Get Out of Jail Free Card</td></tr>";
	}

	if (HTML === "") {
		HTML = p.name + ", you don't have any properties.";
		$("#option").hide();
	} else {
		HTML += "</table>";
	}

	document.getElementById("owned").innerHTML = HTML;

	// Select previously selected property.
	if (checkedproperty > -1 && document.getElementById("propertycheckbox" + checkedproperty)) {
		document.getElementById("propertycheckbox" + checkedproperty).checked = true;
	} else if (firstproperty > -1) {
		document.getElementById("propertycheckbox" + firstproperty).checked = true;
	}
	$(".property-cell-row").click(function() {
		var row = this;

		// Toggle check the current checkbox.
		$(this).find(".propertycellcheckbox > input").prop("checked", function(index, val) {
			return !val;
		});

		// Set all other checkboxes to false.
		$(".propertycellcheckbox > input").prop("checked", function(index, val) {
			if (!$.contains(row, this)) {
				return false;
			}
		});

		updateOption();
	});
	updateOption();
}

function updateOption() {
	$("#option").show();

	var allGroupUninproved = true;
	var allGroupUnmortgaged = true;
	var checkedproperty = getCheckedProperty();

	if (checkedproperty < 0 || checkedproperty >= 40) {
		$("#buyhousebutton").hide();
		$("#sellhousebutton").hide();
		$("#mortgagebutton").hide();


		var supply = getHouseHotelSupply();

		$("#buildings").show();
		document.getElementById("buildings").innerHTML = "<img src='images/house.png' alt='' title='House' class='house' />:&nbsp;" + supply.housesAvailable + "&nbsp;&nbsp;<img src='images/hotel.png' alt='' title='Hotel' class='hotel' />:&nbsp;" + supply.hotelsAvailable;

		return;
	}

	$("#buildings").hide();
	var sq = square[checkedproperty];

	buyhousebutton = document.getElementById("buyhousebutton");
	sellhousebutton = document.getElementById("sellhousebutton");

	$("#mortgagebutton").show();
	document.getElementById("mortgagebutton").disabled = false;

	if (sq.mortgage) {
		document.getElementById("mortgagebutton").value = "Unmortgage ($" + Math.round(sq.price * 0.55) + ")";
		document.getElementById("mortgagebutton").title = "Unmortgage " + sq.name + " for $" + Math.round(sq.price * 0.55) + ".";
		$("#buyhousebutton").hide();
		$("#sellhousebutton").hide();

		allGroupUnmortgaged = false;
	} else {
		document.getElementById("mortgagebutton").value = "Mortgage ($" + (sq.price * 0.5) + ")";
		document.getElementById("mortgagebutton").title = "Mortgage " + sq.name + " for $" + (sq.price * 0.5) + ".";

		if (sq.groupNumber >= 3) {
			$("#buyhousebutton").show();
			$("#sellhousebutton").show();
			buyhousebutton.disabled = false;
			sellhousebutton.disabled = false;

			buyhousebutton.value = "Buy house ($" + sq.houseprice + ")";
			sellhousebutton.value = "Sell house ($" + (sq.houseprice * 0.5) + ")";
			buyhousebutton.title = "Buy a house for $" + sq.houseprice;
			sellhousebutton.title = "Sell a house for $" + (sq.houseprice * 0.5);

			if (sq.house == 4) {
				buyhousebutton.value = "Buy hotel ($" + sq.houseprice + ")";
				buyhousebutton.title = "Buy a hotel for $" + sq.houseprice;
			}
			if (sq.hotel == 1) {
				$("#buyhousebutton").hide();
				sellhousebutton.value = "Sell hotel ($" + (sq.houseprice * 0.5) + ")";
				sellhousebutton.title = "Sell a hotel for $" + (sq.houseprice * 0.5);
			}

			var maxhouse = 0;
			var minhouse = 5;

			var max = sq.group.length;
			for (var i = 0; i < max; i++) {
				s = square[sq.group[i]];

				if (s.owner !== sq.owner) {
					buyhousebutton.disabled = true;
					sellhousebutton.disabled = true;
					buyhousebutton.title = "Before you can buy a house, you must own all the properties of this color-group.";
				} else {

					if (s.house > maxhouse) {
						maxhouse = s.house;
					}

					if (s.house < minhouse) {
						minhouse = s.house;
					}

					if (s.house > 0) {
						allGroupUninproved = false;
					}

					if (s.mortgage) {
						allGroupUnmortgaged = false;
					}
				}
			}

			if (!allGroupUnmortgaged) {
				buyhousebutton.disabled = true;
				buyhousebutton.title = "Before you can buy a house, you must unmortgage all the properties of this color-group.";
			}

			// Force even building
			if (sq.house > minhouse) {
				buyhousebutton.disabled = true;

				if (sq.house == 1) {
					buyhousebutton.title = "Before you can buy another house, the other properties of this color-group must all have one house.";
				} else if (sq.house == 4) {
					buyhousebutton.title = "Before you can buy a hotel, the other properties of this color-group must all have 4 houses.";
				} else {
					buyhousebutton.title = "Before you can buy a house, the other properties of this color-group must all have " + sq.house + " houses.";
				}
			}
			if (sq.house < maxhouse) {
				sellhousebutton.disabled = true;

				if (sq.house == 1) {
					sellhousebutton.title = "Before you can sell house, the other properties of this color-group must all have one house.";
				} else {
					sellhousebutton.title = "Before you can sell a house, the other properties of this color-group must all have " + sq.house + " houses.";
				}
			}

			if (sq.house === 0 && sq.hotel === 0) {
				$("#sellhousebutton").hide();

			} else {
				$("#mortgagebutton").hide();

			}

			// Before a property can be mortgaged or sold, all the properties of its color-group must unimproved.
			if (!allGroupUninproved) {
				document.getElementById("mortgagebutton").title = "Before a property can be mortgaged, all the properties of its color-group must unimproved.";
				document.getElementById("mortgagebutton").disabled = true;
			}

		} else {
			$("#buyhousebutton").hide();
			$("#sellhousebutton").hide();
		}
	}
}

function updateFreeParkingDisplay() {
	var potDisplay = document.getElementById("freeparkingpot");
	if (!potDisplay) {
		return;
	}

	potDisplay.textContent = freeParkingTaxes ? "Pot: $" + freeParkingPot : "";
	potDisplay.style.display = freeParkingTaxes ? "block" : "none";
}

function getCheckedProperty() {
	for (var i = 0; i < 42; i++) {
		if (document.getElementById("propertycheckbox" + i) && document.getElementById("propertycheckbox" + i).checked) {
			return i;
		}
	}
	return -1; // No property is checked.
}
