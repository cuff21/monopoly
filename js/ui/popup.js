var DOMUI = (typeof globalThis !== 'undefined' && globalThis.DOMUI) ||
	(typeof module !== 'undefined' && module.exports ? require('./dom') : null);

// Modal popup, deed tooltip, and player-stats panel rendering.

var UIHtml = (typeof globalThis !== 'undefined' && globalThis.UIHtml) ||
	(typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

function popup(HTML, action, option, timer, gameInstance) {
	var popupGame = gameInstance;
	if (!popupGame || !popupGame.state) throw new TypeError('Popup rendering requires the owning Game.');
	if (popupGame && popupGame.ui && popupGame.ui.isHeadless) {
		for (var a = 1; a < arguments.length; a++) {
			if (typeof arguments[a] === "function") {
				arguments[a]();
				break;
			}
		}
		return;
	}

	function clearTimer() {
		if (popup.autoCloseTimer) {
			clearInterval(popup.autoCloseTimer);
			popup.autoCloseTimer = null;
		}
	}

	function closePopup() {
		clearTimer();
		DOMUI.listen(document, 'keydown', null);
		DOMUI.setVisible("#popupwrap", false);
		DOMUI.fade('#popupbackground', false, 400);
	}

	popup.close = closePopup;
	clearTimer();
	DOMUI.listen(document, 'keydown', null);
	document.getElementById("popuptext").innerHTML = HTML;

	var callback = null;
	var mode = "";
	var timeout;

	for (var i = 1; i < arguments.length; i++) {
		var arg = arguments[i];
		if (typeof arg === "function") {
			callback = arg;
		} else if (typeof arg === "string") {
			mode = arg.toLowerCase();
		} else if (typeof arg === "number") {
			timeout = arg;
		} else if (typeof arg === "boolean") {
			timeout = arg ? 3 : 0;
		}
	}

	if (timeout === undefined || isNaN(timeout)) {
		var state = popupGame && popupGame.state;
		var currentPlayer = state && state.player && state.player[state.turn];
		if (currentPlayer) {
			timeout = currentPlayer.human ? 0 : 3;
		} else {
			timeout = 0;
		}
	}

	// Yes/No
	if (mode === "yes/no") {
		document.getElementById('popuptext').insertAdjacentHTML('beforeend', "<div><input type=\"button\" value=\"Yes\" id=\"popupyes\" /><input type=\"button\" value=\"No\" id=\"popupno\" /></div>");

		DOMUI.listen('#popupno', 'click', closePopup);
		DOMUI.listen('#popupyes', 'click', function() { closePopup(); if (callback) callback(); });

	// Ok
	} else if (mode !== "blank") {
		document.getElementById('popuptext').insertAdjacentHTML('beforeend', "<div><input type='button' value='OK' id='popupclose' autofocus='autofocus' /></div>");

		DOMUI.listen(document, 'keydown', function(event) {
			if ((event.key === "Enter" || event.keyCode === 13) && document.getElementById("popupclose")) {
				event.preventDefault();
				document.getElementById('popupclose').click();
			}
		});

		DOMUI.listen('#popupclose', 'click', function() {
			closePopup();
			if (callback) {
				callback();
			}
		});

		if (timeout > 0) {
			var secondsRemaining = timeout;
			document.getElementById('popupclose').value = "OK (" + secondsRemaining + ")";
			popup.autoCloseTimer = setInterval(function() {
				secondsRemaining--;
				if (!document.getElementById("popupclose")) {
					clearTimer();
				} else if (secondsRemaining <= 0) {
					clearTimer();
					document.getElementById('popupclose').click();
				} else {
					document.getElementById('popupclose').value = "OK (" + secondsRemaining + ")";
				}
			}, 1000);
		}

	}

	DOMUI.fade('#popupbackground', true, 400);
	DOMUI.setVisible("#popupwrap", true);

	if (document.getElementById("popupclose")) {
		document.getElementById('popupclose').focus();
	} else if (document.getElementById("popupyes")) {
		document.getElementById('popupyes').focus();
	}
}

function updateDrawnCard(deckId, cardIndex, gameInstance) {
	var gameState = gameInstance && gameInstance.state;
	var deck = gameState && gameState.cardDecks && gameState.cardDecks[deckId];
	var card = deck && deck.cards[cardIndex];
	var textElement = document.getElementById('card-deck-' + deckId + '-text');
	var groupElement = document.getElementById('card-deck-' + deckId);
	var animationComplete = Promise.resolve();
	if (textElement && card) {
		textElement.textContent = card.text;
	}
	if (groupElement && !(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
		var movingCard = document.createElement("div");
		var icon = document.createElement("img");
		animationComplete = new Promise(function(resolve) {
			movingCard.addEventListener("animationend", function(event) {
				if (event.target !== movingCard) {
					return;
				}
				movingCard.remove();
				resolve();
			});
			setTimeout(function() { movingCard.remove(); resolve(); }, 300);
		});
		movingCard.className = "drawn-card-flip";
		icon.src = deck.icon;
		icon.alt = "";
		movingCard.appendChild(icon);
		groupElement.appendChild(movingCard);
	}
	return animationComplete;
}

function getPlayerPersonality(p) {
	if (!p || p.human || !p.AI) {
		return null;
	}
	if (p.AI.profile && p.AI.profile.name) {
		return p.AI.profile.name;
	}
	if (p.AI.personality) {
		return p.AI.personality;
	}
	if (typeof p.AI.profile === "string") {
		return p.AI.profile;
	}
	return null;
}

function getPlayerStatsHTML(playerIndex, showPersonality, gameState) {
	if (!gameState || !gameState.board || !gameState.squareStateById) throw new TypeError('Player statistics require a structured Game state.');
	var players = gameState.player;
	var playerObject = typeof playerIndex === 'string' ? globalThis.GameStateContext.getPlayerById(gameState, playerIndex) : players[playerIndex];
	var p = playerObject;
	playerIndex = players.indexOf(playerObject);
	var squareIds = getSquareIds(gameState.board);
	var HTML = "<div class='statsplayername'>" + UIHtml.escapeHTML(p.name) + "</div>";
	if (showPersonality) {
		var personality = getPlayerPersonality(p);
		if (personality) {
			HTML += "<div class='statsplayerprofile' data-personality='" + UIHtml.escapeHTML(personality) + "' data-profile='" + UIHtml.escapeHTML(personality) + "'>Personality: " + UIHtml.escapeHTML(personality) + "</div>";
		}
	}
	var write = false;

	for (var i = 0; i < squareIds.length; i++) {
		var sq = gameState.board.squaresById[squareIds[i]];
		var sqState = gameState.squareStateById[sq.id];
		if (sqState.ownerId === p.playerId) {
			var mortgagetext = sqState.mortgage ? "title='Mortgaged' style='color: grey;'" : "";
			var housetext = "";

			if (!write) {
				write = true;
				HTML += "<table>";
			}

			if (sqState.hotel) {
				housetext = "<span style='float: right; font-weight: bold;'>1&nbsp;x&nbsp;<img src='images/hotel.png' alt='' title='Hotel' class='hotel' style='float: none;' /></span>";
			} else if (sqState.house > 0 && sqState.house < 5) {
				housetext = "<span style='float: right; font-weight: bold;'>" + sqState.house + "&nbsp;x&nbsp;<img src='images/house.png' alt='' title='House' class='house' style='float: none;' /></span>";
			}

			HTML += "<tr><td class='statscellcolor' style='background: " + UIHtml.escapeHTML(sq.presentation.color) + ";";
			if (sq.kind === 'railroad' || sq.kind === 'utility') {
				HTML += " border: 1px solid grey;";
			}
			HTML += "' onmouseover=\"showdeed('" + UIHtml.escapeHTML(sq.id) + "')\" onmouseout='hidedeed();'></td><td class='statscellname' " + mortgagetext + ">" + UIHtml.escapeHTML(sq.presentation.label) + housetext + "</td></tr>";
		}
	}

	if (p.heldCards && p.heldCards.length) {
		if (!write) {
			write = true;
			HTML += "<table>";
		}
		p.heldCards.forEach(function() { HTML += "<tr><td class='statscellcolor'></td><td class='statscellname'>Get Out of Jail Free Card</td></tr>"; });
	}

	return write ? HTML + "</table>" : HTML + UIHtml.escapeHTML(p.name) + " dosen't have any properties.";
}

function showAuctionPlayerStats(playerIndex, event, gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Auction stats require the owning Game.');
	var gameState = gameInstance.state;
	var selected = typeof playerIndex === 'string' ? globalThis.GameStateContext.getPlayerById(gameState, playerIndex) : gameState.player[playerIndex];
	var players = gameState.player;
	var tooltip = document.getElementById("auctionplayerstats");
	if (!tooltip) {
		tooltip = document.createElement("div");
		tooltip.id = "auctionplayerstats";
		document.body.appendChild(tooltip);
	}
	tooltip.innerHTML = getPlayerStatsHTML(selected.playerId, false, gameState);
	tooltip.style.borderColor = selected.color;
	tooltip.style.display = "block";
	positionAuctionPlayerStats(event);
}

function positionAuctionPlayerStats(event) {
	var tooltip = document.getElementById("auctionplayerstats");
	if (tooltip && event) {
		tooltip.style.left = (event.clientX + 12) + "px";
		tooltip.style.top = (event.clientY + 12) + "px";
	}
}

function hideAuctionPlayerStats() {
	var tooltip = document.getElementById("auctionplayerstats");
	if (tooltip) {
		tooltip.style.display = "none";
	}
}

function showStats(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Player stats require the owning Game.');
	var gameState = gameInstance.state;
	var players = gameState.player;
	var HTML = "<table align='center'><tr>";

	for (var x = 1; x <= gameState.pcount; x++) {
		if (x === 5) {
			HTML += "</tr><tr>";
		}
		HTML += "<td class='statscell' id='statscell" + x + "' style='border: 2px solid " + players[x].color + "' >" + getPlayerStatsHTML(x, true, gameState) + "</td>";
	}
	HTML += "</tr></table><div id='titledeed'></div>";

	document.getElementById("statstext").innerHTML = HTML;
	// Show using animation.
	DOMUI.fade('#statsbackground', true, 400, function() {
		DOMUI.setVisible("#statswrap", true);
	});
}

function showdeed(property, gameInstance) {
	var gameState = gameInstance && gameInstance.state;
	if (!gameState || typeof property !== 'string') return;
	var sq = gameState.board.squaresById[property];
	if (!sq) return;
	var current = gameState.squareStateById[property], rules = sq.rules;
	DOMUI.setVisible("#deed", true);

	DOMUI.setVisible("#deed-normal", false);
	DOMUI.setVisible("#deed-mortgaged", false);
	DOMUI.setVisible("#deed-special", false);

	if (current.mortgage) {
		DOMUI.setVisible("#deed-mortgaged", true);
		document.getElementById("deed-mortgaged-name").textContent = sq.presentation.label;
		document.getElementById("deed-mortgaged-mortgage").textContent = rules.mortgageValue;

	} else {

		if (sq.kind === 'street') {
			DOMUI.setVisible("#deed-normal", true);
			document.getElementById("deed-header").style.backgroundColor = sq.presentation.color;
			document.getElementById("deed-name").textContent = sq.presentation.label;
			document.getElementById("deed-baserent").textContent = rules.baseRent;
			rules.rentTiers.forEach(function(rent, i) { document.getElementById('deed-rent' + (i + 1)).textContent = rent; });
			document.getElementById("deed-mortgage").textContent = rules.mortgageValue;
			document.getElementById("deed-houseprice").textContent = rules.houseCost;
			document.getElementById("deed-hotelprice").textContent = rules.houseCost;

		} else if (sq.groupId) {
			DOMUI.setVisible("#deed-special", true);
			document.getElementById("deed-special-name").textContent = sq.presentation.label;
			var group = gameState.board.groupsById[sq.groupId];
			var special = sq.kind === 'utility'
				? { kind: 'utility', deed: { multipliers: group.rules.rentTiers } }
				: { kind: sq.kind, deed: { rents: group.rules.rentTiers, groupName: group.label } };
			document.getElementById("deed-special-text").innerHTML = EditionRenderer.renderSpecialDeedText(special);
			document.getElementById("deed-special-mortgage").textContent = rules.mortgageValue;
		}
	}
}

function hidedeed() {
	DOMUI.setVisible("#deed", false);
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { popup: popup, getPlayerStatsHTML: getPlayerStatsHTML };
}
