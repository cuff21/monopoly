/**
 * GameUI Bridge for Monopoly
 * Decouples core game mechanics from presentation, allowing both:
 * 1. GUI Mode (BrowserUI): DOM animations, modal popups, audio/visual delays
 * 2. Headless Mode (HeadlessUI): Pure in-memory execution, zero delays, zero DOM dependencies for high-speed simulation
 */
(function(global) {
	'use strict';

	/**
	 * Base interface for game UI adapters.
	 */
	function GameUI() {
		this.isHeadless = false;
	}

	GameUI.prototype.alert = function(text, playerIndex, secondPlayerIndex) {};
	GameUI.prototype.updateMoney = function() {};
	GameUI.prototype.updatePosition = function() { return Promise.resolve(); };
	GameUI.prototype.updateOwned = function() {};
	GameUI.prototype.updateDice = function(die1, die2) {};
	GameUI.prototype.updateFreeParking = function() {};
	GameUI.prototype.updateDrawnCard = function(deckType, cardIndex) { return Promise.resolve(); };
	GameUI.prototype.popup = function(html, action, option, timer) {
		if (typeof action === 'function') {
			action();
		}
		return Promise.resolve();
	};
	GameUI.prototype.showMessage = function(message, action, option, timer) {
		return this.popup(message, action, option, timer);
	};
	GameUI.prototype.confirm = function(message, action) {
		return this.popup(message, action, 'Yes/No');
	};
	GameUI.prototype.showCard = function(deckType, text, action) {
		return this.popup(text, action);
	};
	GameUI.prototype.chooseTax = function(fixedAmount, percentageAmount, onChoose) {
		if (typeof onChoose === 'function') onChoose(fixedAmount);
	};
	GameUI.prototype.showTradeResult = function(label, trade) {
		return this.showMessage(label);
	};
	GameUI.prototype.showBankruptcyUnmortgage = function(creditorName, properties, onUnmortgage, onComplete) {
		if (typeof onComplete === 'function') onComplete();
	};
	GameUI.prototype.openAuction = function(propertyIndex, property, currentPlayer) {};
	GameUI.prototype.waitForPopupClose = function() { return Promise.resolve(); };
	GameUI.prototype.delay = function(ms) { return Promise.resolve(); };
	GameUI.prototype.onHouseChanged = function(propertyIndex, houseCount, hotelCount) {};
	GameUI.prototype.onMortgageChanged = function(propertyIndex, isMortgaged) {};
	GameUI.prototype.updateMortgageButton = function(label, title) {};
	GameUI.prototype.hideLanded = function() {};
	GameUI.prototype.onAuctionHistory = function(entry) {};
	GameUI.prototype.onAuctionParticipants = function() {};
	GameUI.prototype.initializeAuction = function(propertyIndex, property, currentPlayer) {};
	GameUI.prototype.updateAuctionTurn = function(playerName, clearBid) {};
	GameUI.prototype.readAuctionBid = function() { return 0; };
	GameUI.prototype.setAuctionBidError = function(message) {};
	GameUI.prototype.updateAuctionBid = function(amount, playerName) {};
	GameUI.prototype.focusAuctionBid = function() {};
	GameUI.prototype.closeAuction = function() {};
	GameUI.prototype.onAuctionBid = function(playerIndex, amount) {};
	GameUI.prototype.onAuctionEnd = function(highestBidder, highestBid) {};
	GameUI.prototype.removePlayerToken = function(playerIndex) {};
	GameUI.prototype.onPlayerCountChanged = function(playerCount) {};
	GameUI.prototype.onGameOver = function(winner) {};
	GameUI.prototype.displayLanded = function(text) {};
	GameUI.prototype.displayPropertyPurchase = function(propertyIndex, property) {};
	GameUI.prototype.updateTurnDisplay = function(p) {};
	GameUI.prototype.updateButtonState = function(label, title) {};
	GameUI.prototype.onRollStart = function() {};
	GameUI.prototype.focusNextButton = function() {};
	GameUI.prototype.onTurnStart = function(playerIndex) {};
	GameUI.prototype.setDiceVisible = function(visible) {};
	GameUI.prototype.displayJailOptions = function(hasJailCard, mustPayFine) {};
	GameUI.prototype.onLeaveJail = function(playerColor) {};
	GameUI.prototype.initializeTradeInputHandlers = function() {};
	GameUI.prototype.resetTradeView = function(initiator, recipient, allowRecipientToBeChanged) {};
	GameUI.prototype.readTradeView = function() { return null; };
	GameUI.prototype.writeTradeView = function(trade) {};
	GameUI.prototype.formatTradeResult = function(label, trade) { return ''; };
	GameUI.prototype.setTradePanelVisible = function(visible) {};
	GameUI.prototype.setTradeButtons = function(editing, responding) {};
	GameUI.prototype.readTradeMoneyFields = function() { return { left: '0', right: '0' }; };
	GameUI.prototype.setTradeMoneyError = function(side, message) {};

	/**
	 * HeadlessUI: non-blocking, silent, zero-DOM implementation for simulation/training.
	 */
	function HeadlessUI() {
		GameUI.call(this);
		this.isHeadless = true;
	}
	HeadlessUI.prototype = Object.create(GameUI.prototype);
	HeadlessUI.prototype.constructor = HeadlessUI;

	HeadlessUI.prototype.delay = function(ms) {
		return Promise.resolve();
	};

	HeadlessUI.prototype.popup = function(html, action, option, timer) {
		if (typeof action === 'function') {
			action();
		}
		return Promise.resolve();
	};

	HeadlessUI.prototype.updatePosition = function() {
		return Promise.resolve();
	};

	HeadlessUI.prototype.updateDrawnCard = function() {
		return Promise.resolve();
	};

	var UIBridge = {
		GameUI: GameUI,
		HeadlessUI: HeadlessUI,
		createDefaultUI: function() {
			if (UIBridge.BrowserUI) return new UIBridge.BrowserUI();
			return new HeadlessUI();
		}
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = UIBridge;
	}
	global.GameUI = GameUI;
	global.HeadlessUI = HeadlessUI;
	global.UIBridge = UIBridge;
})(typeof globalThis !== 'undefined' ? globalThis : this);
