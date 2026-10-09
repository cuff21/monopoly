// Modal popup, deed tooltip, and player-stats panel rendering.

var UIHtml = (typeof globalThis !== 'undefined' && globalThis.UIHtml) ||
	(typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

function popup(HTML, action, option, timer, gameInstance) {
	var popupGame = gameInstance || (typeof game !== 'undefined' ? game : null);
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
		$(document).off("keydown.popup");
		$("#popupwrap").hide();
		$("#popupbackground").fadeOut(400);
	}

	clearTimer();
	$(document).off("keydown.popup");
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
		} else if (!gameInstance) {
			timeout = (typeof player !== "undefined" && player[turn] && !player[turn].human) ? 3 : 0;
		} else {
			timeout = 0;
		}
	}

	// Yes/No
	if (mode === "yes/no") {
		$("#popuptext").append("<div><input type=\"button\" value=\"Yes\" id=\"popupyes\" /><input type=\"button\" value=\"No\" id=\"popupno\" /></div>");

		$("#popupyes, #popupno").on("click", closePopup);
		if (callback) {
			$("#popupyes").on("click", callback);
		}

	// Ok
	} else if (mode !== "blank") {
		$("#popuptext").append("<div><input type='button' value='OK' id='popupclose' autofocus='autofocus' /></div>");

		$(document).on("keydown.popup", function(event) {
			if ((event.key === "Enter" || event.keyCode === 13) && document.getElementById("popupclose")) {
				event.preventDefault();
				$("#popupclose").click();
			}
		});

		$("#popupclose").on("click", function() {
			closePopup();
			if (callback) {
				callback();
			}
		});

		if (timeout > 0) {
			var secondsRemaining = timeout;
			$("#popupclose").val("OK (" + secondsRemaining + ")");
			popup.autoCloseTimer = setInterval(function() {
				secondsRemaining--;
				if (!document.getElementById("popupclose")) {
					clearTimer();
				} else if (secondsRemaining <= 0) {
					clearTimer();
					$("#popupclose").click();
				} else {
					$("#popupclose").val("OK (" + secondsRemaining + ")");
				}
			}, 1000);
		}

	}

	$("#popupbackground").fadeIn(400);
	$("#popupwrap").show();

	if (document.getElementById("popupclose")) {
		$("#popupclose").focus();
	} else if (document.getElementById("popupyes")) {
		$("#popupyes").focus();
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
	if (groupElement) {
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
			setTimeout(resolve, 300);
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
	var players = gameState ? gameState.player : player;
	var squares = gameState ? gameState.square : square;
	var p = players[playerIndex];
	var HTML = "<div class='statsplayername'>" + UIHtml.escapeHTML(p.name) + "</div>";
	if (showPersonality) {
		var personality = getPlayerPersonality(p);
		if (personality) {
			HTML += "<div class='statsplayerprofile' data-personality='" + UIHtml.escapeHTML(personality) + "' data-profile='" + UIHtml.escapeHTML(personality) + "'>Personality: " + UIHtml.escapeHTML(personality) + "</div>";
		}
	}
	var write = false;

	for (var i = 0; i < squares.length; i++) {
		var sq = squares[i];

		if (sq.owner === playerIndex) {
			var mortgagetext = sq.mortgage ? "title='Mortgaged' style='color: grey;'" : "";
			var housetext = "";

			if (!write) {
				write = true;
				HTML += "<table>";
			}

			if (sq.house === 5) {
				housetext = "<span style='float: right; font-weight: bold;'>1&nbsp;x&nbsp;<img src='images/hotel.png' alt='' title='Hotel' class='hotel' style='float: none;' /></span>";
			} else if (sq.house > 0 && sq.house < 5) {
				housetext = "<span style='float: right; font-weight: bold;'>" + sq.house + "&nbsp;x&nbsp;<img src='images/house.png' alt='' title='House' class='house' style='float: none;' /></span>";
			}

			HTML += "<tr><td class='statscellcolor' style='background: " + UIHtml.escapeHTML(sq.color) + ";";
			if (sq.groupNumber === 1 || sq.groupNumber === 2) {
				HTML += " border: 1px solid grey;";
			}
			HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='statscellname' " + mortgagetext + ">" + UIHtml.escapeHTML(sq.name) + housetext + "</td></tr>";
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
	var gameState = gameInstance && gameInstance.state;
	var players = gameState ? gameState.player : player;
	var tooltip = document.getElementById("auctionplayerstats");
	if (!tooltip) {
		tooltip = document.createElement("div");
		tooltip.id = "auctionplayerstats";
		document.body.appendChild(tooltip);
	}
	tooltip.innerHTML = getPlayerStatsHTML(playerIndex, false, gameState);
	tooltip.style.borderColor = players[playerIndex].color;
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

function showStats() {
	var HTML = "<table align='center'><tr>";

	for (var x = 1; x <= pcount; x++) {
		if (x === 5) {
			HTML += "</tr><tr>";
		}
		HTML += "<td class='statscell' id='statscell" + x + "' style='border: 2px solid " + player[x].color + "' >" + getPlayerStatsHTML(x, true) + "</td>";
	}
	HTML += "</tr></table><div id='titledeed'></div>";

	document.getElementById("statstext").innerHTML = HTML;
	// Show using animation.
	$("#statsbackground").fadeIn(400, function() {
		$("#statswrap").show();
	});
}

function showdeed(property) {
	var sq = square[property];
	$("#deed").show();

	$("#deed-normal").hide();
	$("#deed-mortgaged").hide();
	$("#deed-special").hide();

	if (sq.mortgage) {
		$("#deed-mortgaged").show();
		document.getElementById("deed-mortgaged-name").textContent = sq.name;
		document.getElementById("deed-mortgaged-mortgage").textContent = (sq.price / 2);

	} else {

		if (sq.groupNumber >= 3) {
			$("#deed-normal").show();
			document.getElementById("deed-header").style.backgroundColor = sq.color;
			document.getElementById("deed-name").textContent = sq.name;
			document.getElementById("deed-baserent").textContent = sq.baserent;
			document.getElementById("deed-rent1").textContent = sq.rent1;
			document.getElementById("deed-rent2").textContent = sq.rent2;
			document.getElementById("deed-rent3").textContent = sq.rent3;
			document.getElementById("deed-rent4").textContent = sq.rent4;
			document.getElementById("deed-rent5").textContent = sq.rent5;
			document.getElementById("deed-mortgage").textContent = (sq.price / 2);
			document.getElementById("deed-houseprice").textContent = sq.houseprice;
			document.getElementById("deed-hotelprice").textContent = sq.houseprice;

		} else if (sq.groupProfile) {
			$("#deed-special").show();
			document.getElementById("deed-special-name").textContent = sq.name;
			document.getElementById("deed-special-text").innerHTML = EditionRenderer.renderSpecialDeedText(sq.groupProfile);
			document.getElementById("deed-special-mortgage").textContent = (sq.price / 2);
		}
	}
}

function hidedeed() {
	$("#deed").hide();
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { popup: popup, getPlayerStatsHTML: getPlayerStatsHTML };
}
