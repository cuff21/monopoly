var DOMUI = (typeof globalThis !== 'undefined' && globalThis.DOMUI) ||
	(typeof module !== 'undefined' && module.exports ? require('./dom') : null);

// Money bar, owned-properties panel, and alert log rendering.

var UIHtml = (typeof globalThis !== 'undefined' && globalThis.UIHtml) ||
	(typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

function getPanelSquareIds(gameState) {
	if (!gameState || !gameState.board || !gameState.squareStateById) throw new TypeError('Property panels require a structured Game state.');
	return getSquareIds(gameState.board);
}

function getPanelSquares(gameState) {
	var ids = getPanelSquareIds(gameState);
	return ids.map(function(id) {
		var definition = gameState.board.squaresById[id], rules = definition.rules, current = gameState.squareStateById[id];
		var tiers = rules.rentTiers || [];
		return { id: id, name: definition.presentation.label, color: definition.presentation.color,
			pricetext: definition.presentation.priceText || '', price: rules.purchasePrice, baserent: rules.baseRent,
			rent1: tiers[0] || 0, rent2: tiers[1] || 0, rent3: tiers[2] || 0, rent4: tiers[3] || 0, rent5: tiers[4] || 0,
			houseprice: rules.houseCost, groupId: definition.groupId || '',
			kind: definition.kind, groupSquareIds: definition.groupId ? gameState.board.groupsById[definition.groupId].squareIds.slice() : [],
			ownerId: current.ownerId,
			mortgage: current.mortgage, house: current.house, hotel: current.hotel, landcount: current.landcount };
	});
}

function playerBadge(playerIndex, gameState) {
	if (!gameState || !Array.isArray(gameState.player)) throw new TypeError('Player badges require the owning Game state.');
	var players = gameState.player;
	if (!players[playerIndex]) {
		return "";
	}
	return "<span class='alert-badge' style='background-color: " + UIHtml.escapeHTML(players[playerIndex].color) + ";' title='" + UIHtml.escapeHTML(players[playerIndex].name) + "'></span>";
}

function addAlert(alertText, playerIndex, secondPlayerIndex, gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Alerts require the owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) {
		return;
	}

	var gameState = gameInstance.state;
	var currentTurn = gameState.turn;
	var alert = document.getElementById('alert');
	if (!alert) return;
	playerIndex = playerIndex === undefined || playerIndex === null ? currentTurn : playerIndex;
	var alertElement = document.createElement('div');
	alertElement.innerHTML = playerBadge(playerIndex, gameState) + (secondPlayerIndex ? playerBadge(secondPlayerIndex, gameState) : '');
	alertElement.appendChild(document.createTextNode(alertText));
	alert.appendChild(alertElement);
	DOMUI.scrollToBottom(alert, true);

	var currentPlayer = gameState.player[currentTurn];
	if (currentPlayer && !currentPlayer.human && currentPlayer.AI) {
		currentPlayer.AI.alertList = (currentPlayer.AI.alertList || "") + "<div>" + playerBadge(playerIndex, gameState) + (secondPlayerIndex ? playerBadge(secondPlayerIndex, gameState) : "") + alertText + "</div>";
	}
}

function formatTradeResult(label, tradeObj, gameInstance) {
	var initiator = tradeObj.getInitiator();
	var recipient = tradeObj.getRecipient();
	var offered = [];
	var requested = [];
	var money = tradeObj.getMoney();
	var board = gameInstance && gameInstance.state && gameInstance.state.board;
	tradeObj.getOfferedSquareIds().forEach(function(id) {
		var item = board && board.squaresById[id];
		offered.push(UIHtml.escapeHTML(item ? item.presentation.label : id));
	});
	tradeObj.getRequestedSquareIds().forEach(function(id) {
		var item = board && board.squaresById[id];
		requested.push(UIHtml.escapeHTML(item ? item.presentation.label : id));
	});
	tradeObj.getHeldCards().forEach(function(card) { (card.direction === 1 ? offered : requested).push('Get Out of Jail Free card'); });
	var initiatorName = typeof initiator === 'object' ? initiator.name : initiator;
	var recipientName = typeof recipient === 'object' ? recipient.name : recipient;
	return UIHtml.escapeHTML(label) + ": <table class='trade-summary'><tr><th>" + UIHtml.escapeHTML(initiatorName) + " gives</th><th>" + UIHtml.escapeHTML(recipientName) + " gives</th></tr><tr><td>" + (offered.join(", ") || "Nothing") + (money > 0 ? " and $" + money : "") + "</td><td>" + (requested.join(", ") || "Nothing") + (money < 0 ? " and $" + (-money) : "") + "</td></tr></table>";
}

function updateMoney(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Money rendering requires the owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) {
		return;
	}

	var gameState = gameInstance.state;
	var players = gameState.player;
	var currentTurn = gameState.turn;
	var playerCount = gameState.pcount;
	var p = players[currentTurn];

	document.getElementById("pmoney").innerHTML = "$" + p.money;
	DOMUI.setVisible(".money-bar-row", false);

	for (var i = 1; i <= playerCount; i++) {
		var p_i = players[i];

		DOMUI.setVisible("#moneybarrow" + i, true);
		document.getElementById("p" + i + "moneybar").style.border = "2px solid " + p_i.color;
		document.getElementById("p" + i + "money").innerHTML = p_i.money;
		document.getElementById("p" + i + "moneyname").textContent = p_i.name;
	}

	if (document.getElementById("landed").innerHTML === "") {
		DOMUI.setVisible("#landed", false);
	}

	document.getElementById("quickstats").style.borderColor = p.color;

	if (p.money < 0) {
		DOMUI.setVisible("#resignbutton", true);
		DOMUI.setVisible("#nextbutton", false);
	} else {
		DOMUI.setVisible("#resignbutton", false);
		DOMUI.setVisible("#nextbutton", true);
	}
}

function updateDice(gameInstance, die1, die2) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Dice rendering requires the owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) {
		return;
	}

	var diceGame = gameInstance;
	var die0 = die1 === undefined ? diceGame.getDie(1) : die1;
	die1 = die2 === undefined ? diceGame.getDie(2) : die2;

	DOMUI.setVisible("#die0", true);
	DOMUI.setVisible("#die1", true);

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

function updateOwned(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Owned-property rendering requires the owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) {
		return;
	}

	var gameState = gameInstance.state;
	var players = gameState.player;
	var squares = getPanelSquares(gameState);
	var currentTurn = gameState.turn;
	var p = players[currentTurn];
	var checkedproperty = getCheckedProperty();
	var checkedCard = document.querySelector && document.querySelector('#owned input[data-card-id]:checked');
	var checkedCardId = checkedCard && checkedCard.dataset.cardId;
	DOMUI.setVisible("#option", true);
	DOMUI.setVisible("#owned", true);

	var HTML = "",
	firstproperty = -1;

	var mortgagetext = "",
	housetext = "";
	var sq;

	for (var i = 0; i < squares.length; i++) {
		sq = squares[i];
		if (gameInstance.ui && gameInstance.ui.onHouseChanged) gameInstance.ui.onHouseChanged(sq.id, sq.house, sq.hotel);
		if (gameInstance.ui && gameInstance.ui.onMortgageChanged) gameInstance.ui.onMortgageChanged(sq.id, sq.mortgage);
		if (sq.groupId && sq.ownerId === null) {
			DOMUI.setVisible("#square-" + sq.id + "-owner", false);
		} else if (sq.groupId && sq.ownerId !== null) {
			var currentCellOwner = document.getElementById("square-" + sq.id + "-owner");
			var ownerPlayer = players.filter(function(candidate) { return candidate && candidate.playerId === sq.ownerId; })[0];
			if (!currentCellOwner || !ownerPlayer) continue;

			currentCellOwner.style.display = "block";
			currentCellOwner.style.backgroundColor = ownerPlayer.color;
			currentCellOwner.title = ownerPlayer.name;
		}
	}

	for (var i = 0; i < squares.length; i++) {
		sq = squares[i];
		if (sq.ownerId === p.playerId) {

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

		HTML += "<tr class='property-cell-row' data-square-id='" + UIHtml.escapeHTML(sq.id) + "' data-group-id='" + UIHtml.escapeHTML(sq.groupId || '') + "'><td class='propertycellcheckbox'><input type='checkbox' data-square-id='" + UIHtml.escapeHTML(sq.id) + "' id='propertycheckbox-" + UIHtml.escapeHTML(sq.id) + "' /></td><td class='propertycellcolor' style='background: " + sq.color + ";";

			if (sq.kind === 'railroad' || sq.kind === 'utility') {
				HTML += " border: 1px solid grey; width: 18px;";
			}

			HTML += "' onmouseover=\"showdeed('" + UIHtml.escapeHTML(sq.id) + "')\" onmouseout='hidedeed();'></td><td class='propertycellname' " + mortgagetext + ">" + UIHtml.escapeHTML(sq.name) + housetext + "</td></tr>";
		}
	}

	p.heldCards.forEach(function(cardId) {
		var checkboxId = 'propertycard-' + encodeURIComponent(cardId);
		if (HTML === "") { firstproperty = checkboxId; HTML += "<table>"; }
		HTML += "<tr class='property-cell-row'><td class='propertycellcheckbox'><input type='checkbox' data-card-id='" + UIHtml.escapeHTML(cardId) + "' id='" + UIHtml.escapeHTML(checkboxId) + "' /></td><td class='propertycellcolor' style='background: white;'></td><td class='propertycellname'>Get Out of Jail Free Card</td></tr>";
	});

	if (HTML === "") {
		HTML = UIHtml.escapeHTML(p.name) + ", you don't have any properties.";
		DOMUI.setVisible("#option", false);
	} else {
		HTML += "</table>";
	}

	document.getElementById("owned").innerHTML = HTML;

	// Select previously selected property.
	if (checkedproperty && checkedproperty !== -1 && document.getElementById("propertycheckbox-" + checkedproperty)) {
		document.getElementById("propertycheckbox-" + checkedproperty).checked = true;
	} else if (checkedCardId && document.getElementById('propertycard-' + encodeURIComponent(checkedCardId))) {
		document.getElementById('propertycard-' + encodeURIComponent(checkedCardId)).checked = true;
	} else if (firstproperty !== -1) {
		var firstCheckboxId = typeof firstproperty === 'string' ? firstproperty : "propertycheckbox-" + squares[firstproperty].id;
		document.getElementById(firstCheckboxId).checked = true;
	}
	DOMUI.listen('#owned .property-cell-row', 'click', function(event) {
		var row = this;
		if (!event || event.target.tagName !== 'INPUT') {
			row.querySelectorAll('.propertycellcheckbox > input').forEach(function(box) { box.checked = !box.checked; });
		}
		document.querySelectorAll('#owned .propertycellcheckbox > input').forEach(function(box) {
			if (!row.contains(box)) box.checked = false;
		});
		updateOption(gameInstance);
	});
	updateOption(gameInstance);
}

function updateOption(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Property options require the owning Game.');
	var gameState = gameInstance.state;
	var squares = getPanelSquares(gameState);
	DOMUI.setVisible("#option", true);

	var allGroupUninproved = true;
	var allGroupUnmortgaged = true;
	var checkedproperty = getCheckedProperty();
	var sq = typeof checkedproperty === 'string' ? squares.filter(function(candidate) { return candidate.id === checkedproperty; })[0] : null;

	if (!sq) {
		DOMUI.setVisible("#buyhousebutton", false);
		DOMUI.setVisible("#sellhousebutton", false);
		DOMUI.setVisible("#mortgagebutton", false);


		var supply = gameInstance.getHouseHotelSupply();

		DOMUI.setVisible("#buildings", true);
		document.getElementById("buildings").innerHTML = "<img src='images/house.png' alt='' title='House' class='house' />:&nbsp;" + supply.housesAvailable + "&nbsp;&nbsp;<img src='images/hotel.png' alt='' title='Hotel' class='hotel' />:&nbsp;" + supply.hotelsAvailable;

		return;
	}

	DOMUI.setVisible("#buildings", false);
	buyhousebutton = document.getElementById("buyhousebutton");
	sellhousebutton = document.getElementById("sellhousebutton");

	DOMUI.setVisible("#mortgagebutton", true);
	document.getElementById("mortgagebutton").disabled = false;

	if (sq.mortgage) {
		document.getElementById("mortgagebutton").value = "Unmortgage ($" + Math.round(sq.price * 0.55) + ")";
		document.getElementById("mortgagebutton").title = "Unmortgage " + sq.name + " for $" + Math.round(sq.price * 0.55) + ".";
		DOMUI.setVisible("#buyhousebutton", false);
		DOMUI.setVisible("#sellhousebutton", false);

		allGroupUnmortgaged = false;
	} else {
		document.getElementById("mortgagebutton").value = "Mortgage ($" + (sq.price * 0.5) + ")";
		document.getElementById("mortgagebutton").title = "Mortgage " + sq.name + " for $" + (sq.price * 0.5) + ".";

		if (sq.kind === 'street') {
			DOMUI.setVisible("#buyhousebutton", true);
			DOMUI.setVisible("#sellhousebutton", true);
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
				DOMUI.setVisible("#buyhousebutton", false);
				sellhousebutton.value = "Sell hotel ($" + (sq.houseprice * 0.5) + ")";
				sellhousebutton.title = "Sell a hotel for $" + (sq.houseprice * 0.5);
			}

			var maxhouse = 0;
			var minhouse = 5;

			var max = sq.groupSquareIds.length;
			for (var i = 0; i < max; i++) {
				var s = squares.filter(function(candidate) { return candidate.id === sq.groupSquareIds[i]; })[0];

				if (!s || s.ownerId !== sq.ownerId) {
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
				DOMUI.setVisible("#sellhousebutton", false);

			} else {
				DOMUI.setVisible("#mortgagebutton", false);

			}

			// Before a property can be mortgaged or sold, all the properties of its color-group must unimproved.
			if (!allGroupUninproved) {
				document.getElementById("mortgagebutton").title = "Before a property can be mortgaged, all the properties of its color-group must unimproved.";
				document.getElementById("mortgagebutton").disabled = true;
			}

		} else {
			DOMUI.setVisible("#buyhousebutton", false);
			DOMUI.setVisible("#sellhousebutton", false);
		}
	}
}

function updateFreeParkingDisplay(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Free-parking rendering requires the owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) {
		return;
	}

	var potDisplay = document.getElementById("freeparkingpot");
	if (!potDisplay) {
		return;
	}

	var gameState = gameInstance.state;
	var taxesEnabled = gameState.freeParkingTaxes;
	var pot = gameState.freeParkingPot;
	potDisplay.textContent = taxesEnabled ? "Pot: $" + pot : "";
	potDisplay.style.display = taxesEnabled ? "block" : "none";
}

function getCheckedProperty() {
	if (document.querySelector) {
		var selected = document.querySelector('#owned input[data-square-id]:checked');
		if (selected) return selected.dataset.squareId;
	}
	return null;
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { playerBadge: playerBadge, formatTradeResult: formatTradeResult, updateMoney: updateMoney };
}
