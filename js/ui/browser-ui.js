(function(global) {
	'use strict';
	var DOMUI = global.DOMUI || (typeof module !== 'undefined' && module.exports ? require('./dom') : null);

    if (typeof module !== 'undefined' && module.exports) {
        require('./render-panels'); require('./render-board'); require('./popup'); require('./trade-view');
    }

	var GameUI = global.GameUI;
	var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

	/**
	 * BrowserUI: full-featured DOM renderer connecting to existing UI modules.
	 */
	function BrowserUI() {
		GameUI.call(this);
		this.isHeadless = false;
		this.tradeState = { initiator: null, recipient: null };
		this.popupView = new global.PopupView.PopupView(this);
        this.disposed = false; this.deedBindings = [];
	}
	BrowserUI.prototype = Object.create(GameUI.prototype);
	BrowserUI.prototype.constructor = BrowserUI;

	BrowserUI.prototype.delay = function(ms) {
		return new Promise(function(resolve) {
			setTimeout(resolve, ms);
		});
	};

	BrowserUI.prototype.alert = function(text, playerIndex, secondPlayerIndex) {
        global.RenderPanels.addAlert(text, playerIndex, secondPlayerIndex, this.game);
    };
    BrowserUI.prototype.updateMoney = function() { global.RenderPanels.updateMoney(this.game); };
    BrowserUI.prototype.updatePosition = function() { return global.RenderBoard.updatePosition(this.game); };
	BrowserUI.prototype.animateMovement = function(movement) {
		return this.boardView ? this.boardView.animateMovement(movement) : Promise.resolve();
	};

	BrowserUI.prototype.updateOwned = function() { global.RenderPanels.updateOwned(this.game); };
    BrowserUI.prototype.updateDice = function(die1, die2) { global.RenderPanels.updateDice(this.game, die1, die2); };
    BrowserUI.prototype.updateFreeParking = function() { global.RenderPanels.updateFreeParkingDisplay(this.game); };
    BrowserUI.prototype.updateDrawnCard = function(deckId, index) { return global.PopupView.updateDrawnCard(deckId, index, this.game); };
    BrowserUI.prototype.popup = function(html, action, option, timer) {
        return this.popupView.show(html, { onConfirm: action, mode: option && option.toLowerCase(), timeoutSeconds: timer });
    };
	BrowserUI.prototype.openAuction = function(squareId, property, currentPlayer) {
		var html = "<div class='auction-title'>Auction <span id='propertyname'></span></div><div class='auction-section'><div class='auction-section-title'>Players</div><div id='auctionparticipants'></div></div><div class='auction-section'><div class='auction-section-title'>Bid history</div><div id='auctionhistory'></div><div class='auction-high-bid'>Current high bid: $<span id='highestbid'></span> (<span id='highestbidder'></span>)</div></div><div id='currentbidder' class='auction-turn'></div><div><input id='bid' title='Enter an amount to bid on the property.' /></div><div class='auction-actions'><input id='auction-bid-button' type='button' value='Bid' title='Place your bid.' /><input id='auction-pass-button' type='button' value='Pass' title='Skip this round of bidding.' /><input id='auction-exit-button' type='button' value='Exit Auction' title='Stop bidding on the property altogether.' /></div>";
		this.popup(html, null, 'blank');
		var thisUI = this;
		[
			['auction-bid-button', 'auctionBid'],
			['auction-pass-button', 'auctionPass'],
			['auction-exit-button', 'auctionExit']
		].forEach(function(binding) {
			var button = document.getElementById(binding[0]);
			if (button && thisUI.game) {
                button.addEventListener('click', function() { thisUI.game.submitPlayerAction(binding[1] === 'auctionBid' ? { type: 'auctionBid', amount: thisUI.readAuctionBid() } : { type: binding[1] }); });
			}
		});
		this.initializeAuction(squareId, property, currentPlayer);
		this.onAuctionParticipants();
		this.updateMoney();
	};

    BrowserUI.prototype.editTrade = function() {
        var state = this.game.state, initiator = state.player[state.turn];
        var controller = this.game.controllers.get(initiator.playerId);
        if (!controller || !controller.pending || !['turn','purchase','debt'].includes(controller.pending.request.kind)) return;
        var recipient = GameStateContext.getActivePlayers(state).find(function(p) { return p !== initiator; });
        if (!recipient) return;
        this.resetTradeView(initiator.playerId, recipient.playerId, true); this.setTradePanelVisible(true); this.setTradeButtons(true, false);
    };
    BrowserUI.prototype.submitTrade = function() {
        var fields = this.readTradeMoneyFields();
        for (var side of ['left','right']) {
            if (!Number.isInteger(Number(fields[side])) || Number(fields[side]) < 0) { this.setTradeMoneyError(side, 'Enter a nonnegative whole dollar amount.'); return false; }
        }
        var offer = this.readTradeView(), game = this.game;
        var controller = Array.from(game.controllers.values()).find(function(c) { return c.pending; });
        if (!controller) return false;
        var action = { type: controller.pending.request.kind === 'trade' ? 'counterTrade' : 'proposeTrade', offer: offer };
        if (action.type === 'counterTrade') action.offer = game.reverseTrade(offer);
        this.confirm('Propose this exchange?', function() {
            if (game.submitPlayerAction(action)) game.ui.setTradePanelVisible(false);
        });
    };
    BrowserUI.prototype.acceptTrade = function() { return this.game.submitPlayerAction({ type: 'acceptTrade' }); };
    BrowserUI.prototype.cancelTrade = function() {
        var controller = Array.from(this.game.controllers.values()).find(function(c) { return c.pending; });
        this.setTradePanelVisible(false);
        return controller && controller.pending.request.kind === 'trade' ? this.game.submitPlayerAction({ type: 'rejectTrade' }) : false;
    };
    BrowserUI.prototype.resign = function() {
        var game = this.game;
        this.confirm('Are you sure you want to resign?', function() { game.submitPlayerAction({ type: 'resign' }); });
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
		this.popup(html, null, 'blank');

		var view = this.popupView;
		function choose(amount) {
            if (view.disposed) return;
			view.close();
			if (typeof onChoose === 'function') onChoose(amount);
		}

		if (typeof document !== 'undefined') {
			var fixedButton = document.getElementById('tax-fixed-button');
			var percentageButton = document.getElementById('tax-percentage-button');
			if (fixedButton) fixedButton.addEventListener('click', function() { choose(fixedAmount); });
			if (percentageButton) percentageButton.addEventListener('click', function() { choose(percentageAmount); });
		}
	};

	BrowserUI.prototype.showCard = function(deckId, text, action) {
		var deck = this.game.state.cardDecks && this.game.state.cardDecks[deckId];
		var icon = deck ? deck.icon : '';
		var title = deck ? deck.label : deckId;
		var html = "<img src='" + UIHtml.escapeHTML(icon) + "' alt='' style='height: 50px; float: left; margin: 8px 8px 0px 0px;' /><div class='drawn-card-title'>" + UIHtml.escapeHTML(title) + "</div><div class='drawn-card-text'>" + UIHtml.escapeHTML(text) + '</div>';
		return this.popup(html, action, undefined, 0);
	};

	BrowserUI.prototype.showTradeResult = function(label, trade, result) {
		if (result && result.declined && this.game) {
			var initiator = global.GameStateContext.getPlayerById(this.game.state, trade.getInitiator());
			var recipient = global.GameStateContext.getPlayerById(this.game.state, trade.getRecipient());
			if (recipient.human && !initiator.human) return;
		}
		return this.popup('<p>' + this.formatTradeResult(label, trade) + '</p>');
	};

	BrowserUI.prototype.showBankruptcyUnmortgage = function(creditorName, properties, onUnmortgage, onComplete) {
		var rows = properties.map(function(property) {
			var border = property.kind === 'railroad' || property.kind === 'utility' ? 'grey' : property.color;
			var squareId = UIHtml.escapeHTML(property.squareId);
			return "<tr data-unmortgage-row='" + squareId + "'><td class='propertycellcolor' style='background: " + UIHtml.escapeHTML(property.color) + '; border: 1px solid ' + UIHtml.escapeHTML(border) + "'></td><td class='propertycellname'>" + UIHtml.escapeHTML(property.name) + "</td><td><button type='button' data-unmortgage-square-id='" + squareId + "' title='Unmortgage for $" + property.price + "'>Unmortgage ($" + property.price + ")</button></td></tr>";
		}).join('');
		var html = '<p>' + UIHtml.escapeHTML(creditorName) + ', you may unmortgage any of the following properties, interest free. Click OK when finished.</p><table>' + rows + '</table>';
		this.popup(html, onComplete, undefined, 0);
		if (typeof document === 'undefined') return;
		document.querySelectorAll('[data-unmortgage-square-id]').forEach(function(button) {
			button.addEventListener('click', function() {
				var squareId = this.getAttribute('data-unmortgage-square-id');
				if (onUnmortgage(squareId)) {
					var row = document.querySelector("[data-unmortgage-row='" + squareId + "']");
					if (row) row.style.display = 'none';
				}
			});
		});
	};

    BrowserUI.prototype.waitForPopupClose = function() { return this.popupView.whenClosed(); };

	BrowserUI.prototype.onHouseChanged = function(squareId, houseCount, hotelCount) {
		if (typeof document === 'undefined') return;
		var cell = document.getElementById('square-' + squareId);
		var cellOwner = cell && cell.querySelector('[data-square-owner]');
		if (!cellOwner) return;
		var buildings = cell.querySelector('.cell-buildings') || cellOwner;
		if (hotelCount === 1) {
			buildings.innerHTML = '<div class="cell-hotel" title="hotel"></div>';
		} else if (houseCount > 0) {
			var htm = '';
			for (var i = 0; i < houseCount; i++) {
				htm += '<div class="cell-house" title="house"></div>';
			}
			buildings.innerHTML = htm;
		} else {
			buildings.innerHTML = '';
		}
	};

	BrowserUI.prototype.onMortgageChanged = function(squareId, isMortgaged) {
		if (typeof document === 'undefined') return;
		var cell = document.getElementById('square-' + squareId);
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
		var state = this.game.state;
		if (!participants || !state || !Array.isArray(state.player)) return;
		participants.innerHTML = state.player.slice(1, state.pcount + 1).map(function(p) {
			var status = p.auctionStatus || (p.bidding ? 'Bidding' : 'Out');
			return "<div class='auction-participant' data-player-id='" + UIHtml.escapeHTML(p.playerId) + "'><span class='auction-player-name'><span class='auction-player-swatch' style='background-color: " + UIHtml.escapeHTML(p.color) + ";'></span>" + UIHtml.escapeHTML(p.name) + "</span><span class='auction-status auction-status-" + status.toLowerCase() + "'>" + status + "</span></div>";
		}).join('');
		var thisUI = this;
		participants.querySelectorAll('.auction-participant').forEach(function(item) {
			item.addEventListener('mouseenter', function(event) {
				global.PopupView.showAuctionPlayerStats(this.getAttribute('data-player-id'), event, thisUI.game);
			});
			item.addEventListener('mousemove', function(event) {
				global.PopupView.positionAuctionPlayerStats(event);
			});
			item.addEventListener('mouseleave', function() {
				global.PopupView.hideAuctionPlayerStats();
			});
		});
	};

	BrowserUI.prototype.initializeAuction = function(squareId, property, currentPlayer) {
		if (typeof document === 'undefined') return;
		var propertyName = document.getElementById('propertyname');
		var highestBid = document.getElementById('highestbid');
		var highestBidder = document.getElementById('highestbidder');
		var bidInput = document.getElementById('bid');
		if (!propertyName || !highestBid || !highestBidder || !bidInput) return;
		if (!property || !property.presentation || !property.rules) throw new TypeError('Auction display requires a structured Board square.');
		var propertyNameText = property.presentation.label;
		propertyName.innerHTML = "<a href='#' data-square-id='" + UIHtml.escapeHTML(squareId) + "' class='statscellcolor'>" + UIHtml.escapeHTML(propertyNameText) + "</a>";
		highestBid.textContent = '0';
		highestBidder.textContent = 'N/A';
		this.updateAuctionTurn(currentPlayer.name, false);
		var thisUI = this;
		bidInput.onkeydown = function(event) {
			var key = event.keyCode;
			if (key === 13) {
				if (thisUI.game) thisUI.game.submitPlayerAction({ type: 'auctionBid', amount: thisUI.readAuctionBid() });
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
		return bidInput ? Number(bidInput.value) : 0;
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
		DOMUI.setVisible('#buypropertybutton', false);
		this.popupView.close();
	};

    BrowserUI.prototype.closeDecisionPopup = function() { this.closeAuction(); };

	BrowserUI.prototype.displayLanded = function(text) {
		if (typeof document === 'undefined') return;
		var el = document.getElementById('landed');
		if (el) {
			el.innerHTML = text;
			DOMUI.setVisible('#landed', true);
		}
	};

	BrowserUI.prototype.displayPropertyPurchase = function(squareId, property) {
		if (typeof document === 'undefined') return;
		var el = document.getElementById('landed');
		if (!el) return;
		if (!property || !property.presentation || !property.rules) throw new TypeError('Purchase display requires a structured Board square.');
		var name = property.presentation.label;
		var price = property.rules.purchasePrice;
		var priceText = property.presentation.priceText;
		el.innerHTML = "<div>You landed on <a href='#' data-square-id='" + UIHtml.escapeHTML(squareId) + "' class='statscellcolor'>" + UIHtml.escapeHTML(name) + "</a>.<input type='button' id='buypropertybutton' value='Buy ($" + price + ")' title='Buy " + UIHtml.escapeHTML(name) + " for " + UIHtml.escapeHTML(priceText || '') + ".'/></div>";
		var buyButton = document.getElementById('buypropertybutton');
		if (buyButton && this.game && typeof this.game.submitPlayerAction === 'function') {
			var game = this.game;
			buyButton.addEventListener('click', function() { game.submitPlayerAction({ type: 'buy', squareId: squareId }); });
		}
		el.style.display = '';
		DOMUI.setVisible('#landed', true);
	};

	BrowserUI.prototype.updateTurnDisplay = function(p) {
		if (typeof document === 'undefined') return;
		var pname = document.getElementById('pname');
		if (pname) pname.textContent = p.name;
		this.updateButtonState('Roll Dice', 'Roll the dice and move your token.');
	};

	BrowserUI.prototype.updateButtonState = function(label, title) {
		if (typeof document === 'undefined') return;
		var btn = document.getElementById('nextbutton');
		if (btn) {
			var state = this.game && this.game.state;
			var player = state && state.player[state.turn];
			btn.disabled = !!(player && !player.human && !this.game.isOver);
			if (btn.disabled) {
				btn.value = 'End turn';
				btn.title = 'Wait for the bot to finish its turn.';
				return;
			}
			if (label !== undefined) btn.value = label;
			if (title !== undefined) btn.title = title;
		}
	};

	BrowserUI.prototype.removePlayerToken = function(playerId) {
		if (this.boardView) this.boardView.removePlayer(playerId);
	};

	BrowserUI.prototype.onPlayerCountChanged = function(playerCount) {
		if (typeof document === 'undefined') return;
		var stats = document.getElementById('stats');
		if (!stats) return;
		if (playerCount === 2) stats.style.width = '454px';
		else if (playerCount === 3) stats.style.width = '686px';
	};

	BrowserUI.prototype.onRollStart = function() {
		if (typeof document === 'undefined') return;
		DOMUI.setVisible("#option", false);
		DOMUI.setVisible("#buy", true);
		DOMUI.setVisible("#manage", false);
	};

	BrowserUI.prototype.focusNextButton = function() {
		if (typeof document === 'undefined') return;
		var button = document.getElementById('nextbutton');
		if (button && !button.disabled) button.focus();
	};

	BrowserUI.prototype.onTurnStart = function(playerIndex) {
		if (typeof document !== 'undefined') {
			DOMUI.setVisible("#landed, #option, #manage", false);
			DOMUI.setVisible("#board, #control, #moneybar, #viewstats, #buy", true);
			DOMUI.setVisible(".money-bar-arrow", false);
			DOMUI.setVisible("#p" + playerIndex + "arrow", true);
		}
		global.RenderBoard.setTokenOverlaysVisible(true, this.game);
	};

	BrowserUI.prototype.setDiceVisible = function(visible) {
		if (typeof document === 'undefined') return;
		if (visible) DOMUI.setVisible("#die0, #die1", true);
		else DOMUI.setVisible("#die0, #die1", false);
	};

	BrowserUI.prototype.displayJailOptions = function(hasJailCard, mustPayFine) {
		if (typeof document === 'undefined') return;
		var landed = document.getElementById('landed');
		if (!landed) return;
		var bailAmount = this.game.state.board.rules.bailAmount;
		var html = "You are in jail.<input type='button' id='pay-fine-button' title='Pay $" + bailAmount + " fine to get out of jail immediately.' value='Pay $" + bailAmount + " fine' />";
		if (hasJailCard) html += "<input type='button' id='gojfbutton' title='Use &quot;Get Out of Jail Free&quot; card.' value='Use Card' />";
		if (mustPayFine) html += "<div>NOTE: If you do not throw doubles after this roll, you <i>must</i> pay the $" + bailAmount + " fine.</div>";
		landed.innerHTML = html;
		var game = this.game;
		var payFineButton = document.getElementById('pay-fine-button');
		if (payFineButton && game && typeof game.submitPlayerAction === 'function') {
			payFineButton.addEventListener('click', function() { game.submitPlayerAction({ type: 'payBail' }); });
		}
		var jailCardButton = document.getElementById('gojfbutton');
		if (jailCardButton && game && typeof game.submitPlayerAction === 'function') {
			jailCardButton.addEventListener('click', function() { game.submitPlayerAction({ type: 'useJailCard', cardId: game.state.player[game.state.turn].heldCards[0] }); });
		}
		landed.style.display = '';
		DOMUI.setVisible('#landed', true);
	};

	BrowserUI.prototype.onLeaveJail = function(playerColor) {
		if (typeof document === 'undefined') return;
		var jail = document.getElementById('jail');
		var cell = this.boardView && this.boardView.surface.querySelector('[data-kind="jail"]');
		if (!cell) cell = document.getElementById('square-jail');
		if (jail) jail.style.border = '1px solid black';
		if (cell) cell.style.borderColor = playerColor;
		this.hideLanded();
	};

	BrowserUI.prototype.onGameOver = function(winnerName) {
		DOMUI.setVisible('#board, #control, #moneybar', true);
		DOMUI.setVisible('#nextbutton', true);
		DOMUI.setVisible('#resignbutton', false);
		global.RenderBoard.setTokenOverlaysVisible(true, this.game);
		DOMUI.setVisible('#refresh', false);
		if (typeof document !== 'undefined') {
			var button = document.getElementById('nextbutton');
			if (button) {
				button.disabled = false;
				button.value = 'Restart Game';
				button.title = 'Return to the settings screen and start another game.';
			}
		}
		this.popup("<div class='winner-popup-title'>" + UIHtml.escapeHTML(winnerName) + " Wins!!</div>", null, undefined, 5);
	};

	BrowserUI.prototype.initializeTradeInputHandlers = function() {
		global.TradeView.initializeInputHandlers();
	};

	BrowserUI.prototype.resetTradeView = function(initiator, recipient, allowRecipientToBeChanged) {
		global.TradeView.reset(this.tradeState, initiator, recipient, allowRecipientToBeChanged, this.game.state);
	};

	BrowserUI.prototype.readTradeView = function() {
		return global.TradeView.read(this.tradeState, this.game.state);
	};

	BrowserUI.prototype.writeTradeView = function(trade) {
		global.TradeView.write(this.tradeState, trade, this.game.state);
	};

	BrowserUI.prototype.formatTradeResult = function(label, trade) {
		return global.TradeView.formatResult(label, trade, this.game.state);
	};

	BrowserUI.prototype.setTradePanelVisible = function(visible) {
		if (typeof document === 'undefined') return;
		if (this.boardView) this.boardView.setTradeVisible(visible);
		if (visible) DOMUI.setVisible('#board, #control', false);
		else DOMUI.setVisible('#board, #control', true);
		DOMUI.setVisible('#trade', !!visible);
		global.RenderBoard.setTokenOverlaysVisible(!visible, this.game);
	};

	BrowserUI.prototype.setTradeButtons = function(editing, responding) {
		global.TradeView.setButtons(editing, responding);
	};

	BrowserUI.prototype.readTradeMoneyFields = function() {
		return global.TradeView.readMoneyFields();
	};

	BrowserUI.prototype.setTradeMoneyError = function(side, message) {
		global.TradeView.setMoneyError(side, message);
	};

    BrowserUI.prototype.bindDeeds = function(root) {
        var ui = this;
        function target(event) { return event.target.closest && event.target.closest('.propertycellcolor[data-square-id], .statscellcolor[data-square-id], .trade-property[data-square-id]'); }
        function show(event) {
            var node = target(event);
            if (ui.disposed || !node) return;
            global.PopupView.showdeed(node.dataset.squareId, ui.game);
            var deed = document.getElementById('deed'), rect = node.getBoundingClientRect();
            deed.style.left = Math.max(4, Math.min((event.clientX === undefined ? rect.right : event.clientX) + 10, window.innerWidth - 158)) + 'px';
            deed.style.top = Math.max(4, Math.min((event.clientY === undefined ? rect.top : event.clientY) + 20, window.innerHeight - 279)) + 'px';
        }
        function hide(event) { if (!ui.disposed && target(event)) global.PopupView.hidedeed(); }
        function click(event) {
            var node = target(event);
            if (!ui.disposed && node && node.tagName === 'A') event.preventDefault();
        }
        [['mouseover', show], ['mousemove', show], ['focusin', show], ['mouseout', hide], ['focusout', hide], ['click', click]].forEach(function(binding) {
            root.addEventListener(binding[0], binding[1]); ui.deedBindings.push([root, binding[0], binding[1]]);
        });
    };
    BrowserUI.prototype.dispose = function() {
        this.disposed = true;
        this.popupView.dispose();
        this.deedBindings.splice(0).forEach(function(binding) { binding[0].removeEventListener(binding[1], binding[2]); });
        global.PopupView.hidedeed(); global.PopupView.hideAuctionPlayerStats();
        if (this.boardView) this.boardView.dispose();
    };
	if (typeof window !== 'undefined' && typeof window.document !== 'undefined' && global.UIBridge) {
		global.UIBridge.BrowserUI = BrowserUI;
	}
	if (typeof module !== 'undefined' && module.exports) module.exports = { BrowserUI: BrowserUI };
	global.BrowserUI = BrowserUI;
})(typeof window !== 'undefined' ? window : globalThis);
