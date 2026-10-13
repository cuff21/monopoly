(function(global) {
'use strict';
var DOMUI = (typeof globalThis !== 'undefined' && globalThis.DOMUI) ||
	(typeof module !== 'undefined' && module.exports ? require('./dom') : null);

// Money bar, owned-properties panel, and alert log rendering.

var UIHtml = (typeof globalThis !== 'undefined' && globalThis.UIHtml) ||
	(typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

function getPanelSquareIds(gameState) {
	if (!gameState || !gameState.board || !gameState.squareStateById) throw new TypeError('Property panels require a structured Game state.');
	return getSquareIds(gameState.board);
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
	var ids = getPanelSquareIds(gameState);
	var currentTurn = gameState.turn;
	var p = players[currentTurn];
	var checkedproperty = getCheckedProperty();
	var checkedCard = document.querySelector && document.querySelector('#owned input[data-card-id]:checked');
	var checkedCardId = checkedCard && checkedCard.dataset.cardId;
	DOMUI.setVisible("#option", true);
	DOMUI.setVisible("#owned", true);

	var HTML = "",
	firstproperty = null;

	var mortgagetext = "",
	housetext = "";
	var sq, current;

	for (var i = 0; i < ids.length; i++) {
		sq = getSquare(gameState.board, ids[i]);
		current = gameState.squareStateById[sq.id];
		if (gameInstance.ui && gameInstance.ui.onHouseChanged) gameInstance.ui.onHouseChanged(sq.id, current.house, current.hotel);
		if (gameInstance.ui && gameInstance.ui.onMortgageChanged) gameInstance.ui.onMortgageChanged(sq.id, current.mortgage);
		if (sq.groupId && current.ownerId === null) {
			DOMUI.setVisible("#square-" + sq.id + "-owner", false);
		} else if (sq.groupId && current.ownerId !== null) {
			var currentCellOwner = document.getElementById("square-" + sq.id + "-owner");
			var ownerPlayer = players.filter(function(candidate) { return candidate && candidate.playerId === current.ownerId; })[0];
			if (!currentCellOwner || !ownerPlayer) continue;

			currentCellOwner.style.display = "block";
			currentCellOwner.style.backgroundColor = ownerPlayer.color;
			currentCellOwner.title = ownerPlayer.name;
		}
	}

	for (var i = 0; i < ids.length; i++) {
		sq = getSquare(gameState.board, ids[i]);
		current = gameState.squareStateById[sq.id];
		if (current.ownerId === p.playerId) {

			mortgagetext = "";
			if (current.mortgage) {
				mortgagetext = "title='Mortgaged' style='color: grey;'";
			}

			housetext = "";
			if (current.house >= 1 && current.house <= 4) {
				for (var x = 1; x <= current.house; x++) {
					housetext += "<img src='images/house.png' alt='' title='House' class='house' />";
				}
			} else if (current.hotel) {
				housetext += "<img src='images/hotel.png' alt='' title='Hotel' class='hotel' />";
			}

			if (HTML === "") {
				HTML += "<table>";
				firstproperty = "propertycheckbox-" + sq.id;
			}

		HTML += "<tr class='property-cell-row' data-square-id='" + UIHtml.escapeHTML(sq.id) + "' data-group-id='" + UIHtml.escapeHTML(sq.groupId || '') + "'><td class='propertycellcheckbox'><input type='checkbox' data-square-id='" + UIHtml.escapeHTML(sq.id) + "' id='propertycheckbox-" + UIHtml.escapeHTML(sq.id) + "' /></td><td class='propertycellcolor' style='background: " + sq.presentation.color + ";";

			if (sq.kind === 'railroad' || sq.kind === 'utility') {
				HTML += " border: 1px solid grey; width: 18px;";
			}

			HTML += "' data-square-id='" + UIHtml.escapeHTML(sq.id) + "' tabindex='0'></td><td class='propertycellname' " + mortgagetext + ">" + UIHtml.escapeHTML(sq.presentation.label) + housetext + "</td></tr>";
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
	if (checkedproperty && document.getElementById("propertycheckbox-" + checkedproperty)) {
		document.getElementById("propertycheckbox-" + checkedproperty).checked = true;
	} else if (checkedCardId && document.getElementById('propertycard-' + encodeURIComponent(checkedCardId))) {
		document.getElementById('propertycard-' + encodeURIComponent(checkedCardId)).checked = true;
	} else if (firstproperty !== null) {
		var firstCheckboxId = firstproperty;
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
	var state = gameInstance.state, id = getCheckedProperty();
	var square = id && state.board.squaresById[id];
	DOMUI.setVisible('#option', true);
	DOMUI.setVisible('#buildings', !square);
	if (!square) {
		DOMUI.setVisible('#buyhousebutton, #sellhousebutton, #mortgagebutton', false);
		var supply = gameInstance.getHouseHotelSupply();
		document.getElementById('buildings').innerHTML = "<img src='images/house.png' alt='' title='House' class='house' />:&nbsp;" + supply.housesAvailable + "&nbsp;&nbsp;<img src='images/hotel.png' alt='' title='Hotel' class='hotel' />:&nbsp;" + supply.hotelsAvailable;
		return;
	}
	var current = state.squareStateById[id], playerId = state.player[state.turn].playerId;
	var mortgageType = current.mortgage ? 'unmortgage' : 'mortgage';
	var mortgageAmount = current.mortgage ? Math.round(square.rules.purchasePrice * 0.55) : square.rules.mortgageValue;
	var controls = [
		['mortgagebutton', mortgageType, (current.mortgage ? 'Unmortgage' : 'Mortgage'), mortgageAmount, true],
		['buyhousebutton', 'buyHouse', current.house === 4 ? 'Buy hotel' : 'Buy house', square.rules.houseCost, square.kind === 'street' && !current.mortgage && !current.hotel],
		['sellhousebutton', 'sellHouse', current.hotel ? 'Sell hotel' : 'Sell house', square.rules.houseCost / 2, square.kind === 'street' && !!(current.house || current.hotel)]
	];
	controls.forEach(function(control) {
		var button = document.getElementById(control[0]);
		var error = PropertyActions.actionError(state, playerId, control[1], id);
		DOMUI.setVisible(button, control[4]);
		button.disabled = !!error;
		button.value = control[2] + ' ($' + control[3] + ')';
		button.title = error || control[2] + ' for $' + control[3] + '.';
	});
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

var api = { playerBadge: playerBadge, addAlert: addAlert, updateMoney: updateMoney, updateOwned: updateOwned, updateDice: updateDice, updateFreeParkingDisplay: updateFreeParkingDisplay, getCheckedProperty: getCheckedProperty, updateOption: updateOption };
global.RenderPanels = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
