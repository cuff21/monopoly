(function(global) {
	'use strict';

	var GameUI = global.GameUI;
	var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

	/**
	 * BrowserUI: full-featured DOM renderer connecting to existing UI modules.
	 */
	function BrowserUI() {
		GameUI.call(this);
		this.isHeadless = false;
		this.tradeState = { initiator: null, recipient: null };
	}
	BrowserUI.prototype = Object.create(GameUI.prototype);
	BrowserUI.prototype.constructor = BrowserUI;

	BrowserUI.prototype.delay = function(ms) {
		return new Promise(function(resolve) {
			setTimeout(resolve, ms);
		});
	};

	BrowserUI.prototype.alert = function(text, playerIndex, secondPlayerIndex) {
		if (typeof global.addAlert === 'function') {
			global.addAlert(text, playerIndex, secondPlayerIndex);
		} else if (typeof global.$ !== 'undefined' && global.$('#alert').length) {
			var $alert = global.$('#alert');
			var pIdx = playerIndex || (typeof global.turn !== 'undefined' ? global.turn : 0);
			var badge = (typeof global.playerBadge === 'function') ? global.playerBadge(pIdx) : '';
			var badge2 = (secondPlayerIndex && typeof global.playerBadge === 'function') ? global.playerBadge(secondPlayerIndex) : '';
			var alertElement = global.$(document.createElement('div'));
			if (badge) alertElement.append(badge);
			if (badge2) alertElement.append(badge2);
			alertElement.append(document.createTextNode(text)).appendTo($alert);
			$alert.stop().animate({ scrollTop: $alert.prop('scrollHeight') }, 1000);

			if (typeof global.player !== 'undefined' && global.player[global.turn] && !global.player[global.turn].human && global.player[global.turn].AI) {
				global.player[global.turn].AI.alertList = (global.player[global.turn].AI.alertList || '') + '<div>' + badge + badge2 + text + '</div>';
			}
		}
	};

	BrowserUI.prototype.updateMoney = function() {
		if (typeof global.updateMoney === 'function') {
			global.updateMoney();
		}
	};

	BrowserUI.prototype.updatePosition = function() {
		if (typeof global.updatePosition === 'function') {
			return global.updatePosition();
		}
		return Promise.resolve();
	};

	BrowserUI.prototype.updateOwned = function() {
		if (typeof global.updateOwned === 'function') {
			global.updateOwned();
		}
	};

	BrowserUI.prototype.updateDice = function(die1, die2) {
		if (typeof global.updateDice === 'function') {
			global.updateDice(die1, die2);
		}
	};

	BrowserUI.prototype.updateFreeParking = function() {
		if (typeof global.updateFreeParkingDisplay === 'function') {
			global.updateFreeParkingDisplay();
		}
	};

	BrowserUI.prototype.updateDrawnCard = function(deckType, cardIndex) {
		if (typeof global.updateDrawnCard === 'function') {
			return global.updateDrawnCard(deckType, cardIndex);
		}
		return Promise.resolve();
	};

	BrowserUI.prototype.popup = function(html, action, option, timer) {
		if (typeof global.popup === 'function') {
			return global.popup(html, action, option, timer);
		}
		if (typeof action === 'function') action();
		return Promise.resolve();
	};

	BrowserUI.prototype.openAuction = function(propertyIndex, property, currentPlayer) {
		var html = "<div class='auction-title'>Auction <span id='propertyname'></span></div><div class='auction-section'><div class='auction-section-title'>Players</div><div id='auctionparticipants'></div></div><div class='auction-section'><div class='auction-section-title'>Bid history</div><div id='auctionhistory'></div><div class='auction-high-bid'>Current high bid: $<span id='highestbid'></span> (<span id='highestbidder'></span>)</div></div><div id='currentbidder' class='auction-turn'></div><div><input id='bid' title='Enter an amount to bid on the property.' /></div><div class='auction-actions'><input type='button' value='Bid' onclick='game.auctionBid();' title='Place your bid.' /><input type='button' value='Pass' title='Skip bidding this time.' onclick='game.auctionPass();' /><input type='button' value='Exit Auction' title='Stop bidding on the property altogether.' onclick='game.auctionExit();' /></div>";
		this.popup(html, 'blank');
		this.initializeAuction(propertyIndex, property, currentPlayer);
		this.onAuctionParticipants();
		this.updateMoney();
	};

	BrowserUI.prototype.showMessage = function(message, action, option, timer) {
		return this.popup('<p>' + UIHtml.escapeHTML(message) + '</p>', action, option, timer);
	};

	BrowserUI.prototype.confirm = function(message, action) {
		return this.showMessage(message, action, 'Yes/No');
	};

	BrowserUI.prototype.chooseTax = function(fixedAmount, percentageAmount, onChoose) {
		var html = '<p>You landed on City Tax. Choose a payment.</p>' +
			"<div><button type='button' id='tax-fixed-button'>Pay $" + fixedAmount + "</button> " +
			"<button type='button' id='tax-percentage-button'>Pay $" + percentageAmount + '</button></div>';
		this.popup(html, 'blank');

		function choose(amount) {
			if (typeof global.$ !== 'undefined') {
				global.$('#popupwrap, #popupbackground').hide();
			} else {
				['popupwrap', 'popupbackground'].forEach(function(id) {
					var element = document.getElementById(id);
					if (element) element.style.display = 'none';
				});
			}
			if (typeof onChoose === 'function') onChoose(amount);
		}

		if (typeof document !== 'undefined') {
			var fixedButton = document.getElementById('tax-fixed-button');
			var percentageButton = document.getElementById('tax-percentage-button');
			if (fixedButton) fixedButton.addEventListener('click', function() { choose(fixedAmount); });
			if (percentageButton) percentageButton.addEventListener('click', function() { choose(percentageAmount); });
		}
	};

	BrowserUI.prototype.showCard = function(deckType, text, action) {
		var icon = deckType === 'chance' ? 'images/chance_icon.png' : 'images/community_chest_icon.png';
		var title = deckType === 'chance' ? 'Chance' : 'Community Chest';
		var html = "<img src='" + icon + "' alt='' style='height: 50px; float: left; margin: 8px 8px 0px 0px;' /><div class='drawn-card-title'>" + title + "</div><div class='drawn-card-text'>" + UIHtml.escapeHTML(text) + '</div>';
		return this.popup(html, action);
	};

	BrowserUI.prototype.showTradeResult = function(label, trade) {
		return this.popup('<p>' + this.formatTradeResult(label, trade) + '</p>');
	};

	BrowserUI.prototype.showBankruptcyUnmortgage = function(creditorName, properties, onUnmortgage, onComplete) {
		var rows = properties.map(function(property) {
			var border = property.groupNumber === 1 || property.groupNumber === 2 ? 'grey' : property.color;
			return "<tr data-unmortgage-row='" + property.index + "'><td class='propertycellcolor' style='background: " + UIHtml.escapeHTML(property.color) + '; border: 1px solid ' + UIHtml.escapeHTML(border) + "'></td><td class='propertycellname'>" + UIHtml.escapeHTML(property.name) + "</td><td><button type='button' data-unmortgage-index='" + property.index + "' title='Unmortgage for $" + property.price + "'>Unmortgage ($" + property.price + ")</button></td></tr>";
		}).join('');
		var html = '<p>' + UIHtml.escapeHTML(creditorName) + ', you may unmortgage any of the following properties, interest free. Click OK when finished.</p><table>' + rows + '</table>';
		this.popup(html, onComplete, 0);
		if (typeof document === 'undefined') return;
		document.querySelectorAll('[data-unmortgage-index]').forEach(function(button) {
			button.addEventListener('click', function() {
				var propertyIndex = parseInt(this.getAttribute('data-unmortgage-index'), 10);
				if (onUnmortgage(propertyIndex)) {
					var row = document.querySelector("[data-unmortgage-row='" + propertyIndex + "']");
					if (row) row.style.display = 'none';
				}
			});
		});
	};

	BrowserUI.prototype.waitForPopupClose = async function() {
		while (typeof global.$ !== 'undefined' && !global.$("#popupwrap").is(":hidden")) {
			await this.delay(10);
		}
	};

	BrowserUI.prototype.onHouseChanged = function(propertyIndex, houseCount, hotelCount) {
		if (typeof document === 'undefined') return;
		var cellOwner = document.getElementById('cell' + propertyIndex + 'owner');
		if (!cellOwner) return;
		if (hotelCount === 1) {
			cellOwner.innerHTML = '<div class="cell-position cell-hotel" title="hotel" style="display: inline-block;background-color: red; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div>';
		} else if (houseCount > 0) {
			var htm = '';
			for (var i = 0; i < houseCount; i++) {
				htm += '<div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div>';
			}
			cellOwner.innerHTML = htm;
		} else {
			cellOwner.innerHTML = '';
		}
	};

	BrowserUI.prototype.onMortgageChanged = function(propertyIndex, isMortgaged) {
		if (typeof document === 'undefined') return;
		var cell = document.querySelector('#cell' + propertyIndex);
		if (cell) {
			if (isMortgaged) cell.classList.add('mortgaged');
			else cell.classList.remove('mortgaged');
		}
	};

	BrowserUI.prototype.updateMortgageButton = function(label, title) {
		if (typeof document === 'undefined') return;
		var button = document.getElementById('mortgagebutton');
		if (!button) return;
		button.value = label;
		button.title = title;
	};

	BrowserUI.prototype.hideLanded = function() {
		if (typeof document === 'undefined') return;
		var landed = document.getElementById('landed');
		if (landed) landed.style.display = 'none';
	};

	BrowserUI.prototype.onAuctionHistory = function(entry) {
		if (typeof document === 'undefined') return;
		var history = document.getElementById('auctionhistory');
		if (history) {
			var div = document.createElement('div');
			div.textContent = entry;
			history.appendChild(div);
			history.scrollTop = history.scrollHeight;
		}
	};

	BrowserUI.prototype.onAuctionParticipants = function() {
		if (typeof document === 'undefined') return;
		var participants = document.getElementById('auctionparticipants');
		if (!participants || !Array.isArray(global.player)) return;
		participants.innerHTML = global.player.slice(1, global.pcount + 1).map(function(p) {
			var status = p.auctionStatus || (p.bidding ? 'Bidding' : 'Out');
			return "<div class='auction-participant' data-player-index='" + p.index + "'><span class='auction-player-name'><span class='auction-player-swatch' style='background-color: " + UIHtml.escapeHTML(p.color) + ";'></span>" + UIHtml.escapeHTML(p.name) + "</span><span class='auction-status auction-status-" + status.toLowerCase() + "'>" + status + "</span></div>";
		}).join('');
		participants.querySelectorAll('.auction-participant').forEach(function(item) {
			item.addEventListener('mouseenter', function(event) {
				if (typeof global.showAuctionPlayerStats === 'function') global.showAuctionPlayerStats(parseInt(this.getAttribute('data-player-index'), 10), event);
			});
			item.addEventListener('mousemove', function(event) {
				if (typeof global.positionAuctionPlayerStats === 'function') global.positionAuctionPlayerStats(event);
			});
			item.addEventListener('mouseleave', function() {
				if (typeof global.hideAuctionPlayerStats === 'function') global.hideAuctionPlayerStats();
			});
		});
	};

	BrowserUI.prototype.initializeAuction = function(propertyIndex, property, currentPlayer) {
		if (typeof document === 'undefined') return;
		var propertyName = document.getElementById('propertyname');
		var highestBid = document.getElementById('highestbid');
		var highestBidder = document.getElementById('highestbidder');
		var bidInput = document.getElementById('bid');
		if (!propertyName || !highestBid || !highestBidder || !bidInput) return;
		propertyName.innerHTML = "<a href='javascript:void(0);' onmouseover='showdeed(" + propertyIndex + ");' onmouseout='hidedeed();' class='statscellcolor'>" + UIHtml.escapeHTML(property.name) + "</a>";
		highestBid.textContent = '0';
		highestBidder.textContent = 'N/A';
		this.updateAuctionTurn(currentPlayer.name, false);
		bidInput.onkeydown = function(event) {
			var key = event.keyCode;
			if (key === 13) {
				global.game.auctionBid();
				return false;
			}
			if (key === 8 || key === 9 || key === 46 || (key >= 35 && key <= 40) || event.ctrlKey) return true;
			if (event.shiftKey) return false;
			return (key >= 48 && key <= 57) || (key >= 96 && key <= 105);
		};
		bidInput.onfocus = function() {
			this.style.color = 'black';
			if (isNaN(this.value)) this.value = '';
		};
	};

	BrowserUI.prototype.updateAuctionTurn = function(playerName, clearBid) {
		if (typeof document === 'undefined') return;
		var currentBidder = document.getElementById('currentbidder');
		if (currentBidder) currentBidder.textContent = "It is " + playerName + "'s turn to bid.";
		var bidInput = document.getElementById('bid');
		if (clearBid && bidInput) {
			bidInput.value = '';
			bidInput.style.color = 'black';
		}
	};

	BrowserUI.prototype.readAuctionBid = function() {
		if (typeof document === 'undefined') return 0;
		var bidInput = document.getElementById('bid');
		return bidInput ? parseInt(bidInput.value, 10) : 0;
	};

	BrowserUI.prototype.setAuctionBidError = function(message) {
		if (typeof document === 'undefined') return;
		var bidInput = document.getElementById('bid');
		if (!bidInput) return;
		bidInput.value = message;
		bidInput.style.color = 'red';
	};

	BrowserUI.prototype.updateAuctionBid = function(amount, playerName) {
		if (typeof document === 'undefined') return;
		var highestBid = document.getElementById('highestbid');
		var highestBidder = document.getElementById('highestbidder');
		if (highestBid) highestBid.textContent = amount;
		if (highestBidder) highestBidder.textContent = playerName;
	};

	BrowserUI.prototype.focusAuctionBid = function() {
		if (typeof document === 'undefined') return;
		var bidInput = document.getElementById('bid');
		if (bidInput) bidInput.focus();
	};

	BrowserUI.prototype.closeAuction = function() {
		if (typeof global.$ !== 'undefined') {
			global.$('#buypropertybutton, #popupbackground, #popupwrap').hide();
			return;
		}
		if (typeof document === 'undefined') return;
		['buypropertybutton', 'popupbackground', 'popupwrap'].forEach(function(id) {
			var element = document.getElementById(id);
			if (element) element.style.display = 'none';
		});
	};

	BrowserUI.prototype.displayLanded = function(text) {
		if (typeof document === 'undefined') return;
		var el = document.getElementById('landed');
		if (el) {
			el.innerHTML = text;
			if (typeof global.$ !== 'undefined') global.$('#landed').show();
		}
	};

	BrowserUI.prototype.displayPropertyPurchase = function(propertyIndex, property) {
		if (typeof document === 'undefined') return;
		var el = document.getElementById('landed');
		if (!el) return;
		el.innerHTML = "<div>You landed on <a href='javascript:void(0);' onmouseover='showdeed(" + propertyIndex + ");' onmouseout='hidedeed();' class='statscellcolor'>" + UIHtml.escapeHTML(property.name) + "</a>.<input type='button' id='buypropertybutton' onclick='buy();' value='Buy ($" + property.price + ")' title='Buy " + UIHtml.escapeHTML(property.name) + " for " + UIHtml.escapeHTML(property.pricetext) + ".'/></div>";
		el.style.display = '';
		if (typeof global.$ !== 'undefined') global.$('#landed').show();
	};

	BrowserUI.prototype.updateTurnDisplay = function(p) {
		if (typeof document === 'undefined') return;
		var pname = document.getElementById('pname');
		if (pname) pname.textContent = p.name;
	};

	BrowserUI.prototype.updateButtonState = function(label, title) {
		if (typeof document === 'undefined') return;
		var btn = document.getElementById('nextbutton');
		if (btn) {
			if (label !== undefined) btn.value = label;
			if (title !== undefined) btn.title = title;
		}
	};

	BrowserUI.prototype.removePlayerToken = function(playerIndex) {
		var overlay = global.playerOverlays && global.playerOverlays[playerIndex];
		if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
	};

	BrowserUI.prototype.onPlayerCountChanged = function(playerCount) {
		if (typeof document === 'undefined') return;
		var stats = document.getElementById('stats');
		if (!stats) return;
		if (playerCount === 2) stats.style.width = '454px';
		else if (playerCount === 3) stats.style.width = '686px';
	};

	BrowserUI.prototype.onRollStart = function() {
		if (typeof global.$ === 'undefined') return;
		global.$("#option").hide();
		global.$("#buy").show();
		global.$("#manage").hide();
	};

	BrowserUI.prototype.focusNextButton = function() {
		if (typeof document === 'undefined') return;
		var button = document.getElementById('nextbutton');
		if (button) button.focus();
	};

	BrowserUI.prototype.onTurnStart = function(playerIndex) {
		if (typeof global.$ !== 'undefined') {
			global.$("#landed, #option, #manage").hide();
			global.$("#board, #control, #moneybar, #viewstats, #buy").show();
			global.$(".money-bar-arrow").hide();
			global.$("#p" + playerIndex + "arrow").show();
		}
		if (typeof global.setTokenOverlaysVisible === 'function') global.setTokenOverlaysVisible(true);
	};

	BrowserUI.prototype.setDiceVisible = function(visible) {
		if (typeof global.$ === 'undefined') return;
		if (visible) global.$("#die0, #die1").show();
		else global.$("#die0, #die1").hide();
	};

	BrowserUI.prototype.displayJailOptions = function(hasJailCard, mustPayFine) {
		if (typeof document === 'undefined') return;
		var landed = document.getElementById('landed');
		if (!landed) return;
		var html = "You are in jail.<input type='button' title='Pay $50 fine to get out of jail immediately.' value='Pay $50 fine' onclick='payfifty();' />";
		if (hasJailCard) html += "<input type='button' id='gojfbutton' title='Use &quot;Get Out of Jail Free&quot; card.' onclick='useJailCard();' value='Use Card' />";
		if (mustPayFine) html += "<div>NOTE: If you do not throw doubles after this roll, you <i>must</i> pay the $50 fine.</div>";
		landed.innerHTML = html;
		landed.style.display = '';
		if (typeof global.$ !== 'undefined') global.$('#landed').show();
	};

	BrowserUI.prototype.onLeaveJail = function(playerColor) {
		if (typeof document === 'undefined') return;
		var jail = document.getElementById('jail');
		var cell = document.getElementById('cell11');
		if (jail) jail.style.border = '1px solid black';
		if (cell) cell.style.border = '2px solid ' + playerColor;
		this.hideLanded();
	};

	BrowserUI.prototype.onGameOver = function(winnerName) {
		if (typeof global.$ !== 'undefined') {
			global.$('#board, #control, #moneybar').show();
			if (typeof global.setTokenOverlaysVisible === 'function') global.setTokenOverlaysVisible(true);
			global.$('#refresh').hide();
			if (typeof global.restartGame === 'function') {
				global.$('#nextbutton').val('Restart Game').prop('title', 'Return to the settings screen and start another game.').off('click').on('click', global.restartGame);
			}
		} else if (typeof document !== 'undefined') {
			['board', 'control', 'moneybar'].forEach(function(id) {
				var el = document.getElementById(id);
				if (el) el.style.display = '';
			});
			var refresh = document.getElementById('refresh');
			if (refresh) refresh.style.display = 'none';
			var button = document.getElementById('nextbutton');
			if (button) {
				button.value = 'Restart Game';
				button.title = 'Return to the settings screen and start another game.';
				if (typeof global.restartGame === 'function') button.onclick = global.restartGame;
			}
		}
		if (typeof global.popup === 'function') {
			global.popup("<div class='winner-popup-title'>" + UIHtml.escapeHTML(winnerName) + " Wins!!</div>", null, 5);
		}
	};

	BrowserUI.prototype.initializeTradeInputHandlers = function() {
		if (global.TradeView) global.TradeView.initializeInputHandlers();
	};

	BrowserUI.prototype.resetTradeView = function(initiator, recipient, allowRecipientToBeChanged) {
		if (global.TradeView) global.TradeView.reset(this.tradeState, initiator, recipient, allowRecipientToBeChanged);
	};

	BrowserUI.prototype.readTradeView = function() {
		return global.TradeView ? global.TradeView.read(this.tradeState) : null;
	};

	BrowserUI.prototype.writeTradeView = function(trade) {
		if (global.TradeView) global.TradeView.write(this.tradeState, trade);
	};

	BrowserUI.prototype.formatTradeResult = function(label, trade) {
		return global.TradeView ? global.TradeView.formatResult(label, trade) : '';
	};

	BrowserUI.prototype.setTradePanelVisible = function(visible) {
		if (typeof global.$ === 'undefined') return;
		if (visible) global.$('#board, #control').hide();
		else global.$('#board, #control').show();
		global.$('#trade').toggle(!!visible);
		if (typeof global.setTokenOverlaysVisible === 'function') global.setTokenOverlaysVisible(!visible);
	};

	BrowserUI.prototype.setTradeButtons = function(editing, responding) {
		if (global.TradeView) global.TradeView.setButtons(editing, responding);
	};

	BrowserUI.prototype.readTradeMoneyFields = function() {
		return global.TradeView ? global.TradeView.readMoneyFields() : { left: '0', right: '0' };
	};

	BrowserUI.prototype.setTradeMoneyError = function(side, message) {
		if (global.TradeView) global.TradeView.setMoneyError(side, message);
	};

	if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && global.UIBridge) {
		global.UIBridge.BrowserUI = BrowserUI;
	}
	if (typeof module !== 'undefined' && module.exports) module.exports = { BrowserUI: BrowserUI };
	global.BrowserUI = BrowserUI;
})(typeof window !== 'undefined' ? window : globalThis);
