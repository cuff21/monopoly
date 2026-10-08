// Trade flow, mixed onto Game.prototype. Form participants belong to their Game instance.
(function() {
	// Called once by the Game() constructor once the trade panel's DOM elements exist.
	Game.prototype._initTradeInputHandlers = function() {
		if (this.ui && typeof this.ui.initializeTradeInputHandlers === 'function') {
			this.ui.initializeTradeInputHandlers();
		}
	};

	var resetTrade = function(gameInstance, initiator, recipient, allowRecipientToBeChanged) {
		gameInstance.tradeState.initiator = initiator;
		gameInstance.tradeState.recipient = recipient;
		if (gameInstance.ui) return gameInstance.ui.resetTradeView(initiator, recipient, allowRecipientToBeChanged);
	};

	var readTrade = function(gameInstance) {
		return gameInstance.ui ? gameInstance.ui.readTradeView() : null;
	};

	var writeTrade = function(gameInstance, tradeObj) {
		if (gameInstance.ui) return gameInstance.ui.writeTradeView(tradeObj);
	};

	var showTradeResult = function(gameInstance, label, tradeObj) {
		if (gameInstance.ui) gameInstance.ui.showTradeResult(label, tradeObj);
	};

	Game.prototype.proposeBotTrade = function(tradeObj) {
		var initiator = tradeObj.getInitiator();
		var recipient = tradeObj.getRecipient();
		var money = tradeObj.getMoney();

		if (money > 0 && money > initiator.money) return false;
		if (money < 0 && -money > recipient.money) return false;

		var reversedTradeProperty = [];
		for (var i = 0; i < 40; i++) {
			reversedTradeProperty[i] = -tradeObj.getProperty(i);
		}
		var reversedTrade = new Trade(recipient, initiator, -money, reversedTradeProperty, -tradeObj.getCommunityChestJailCard(), -tradeObj.getChanceJailCard());

		var tradeResponse = recipient.AI.acceptTrade(tradeObj);

		if (tradeResponse === true) {
			showTradeResult(this, initiator.name + " traded with " + recipient.name, tradeObj);
			this.acceptTrade(reversedTrade);
		} else if (tradeResponse === false) {
			showTradeResult(this, initiator.name + " declined a trade with " + recipient.name, tradeObj);
			this.cancelTrade();
		} else if (tradeResponse instanceof Trade) {
			var currentTradeProposal = tradeResponse;
			var currentInitiator = recipient;
			var currentRecipient = initiator;
			var acceptedFinalTrade = null;
			var maxRounds = 5;

			for (var round = 0; round < maxRounds; round++) {
				var reversedCounterProperty = [];
				for (var counterIndex = 0; counterIndex < 40; counterIndex++) {
					reversedCounterProperty[counterIndex] = -currentTradeProposal.getProperty(counterIndex);
				}
				var reversedCounter = new Trade(currentInitiator, currentRecipient, -currentTradeProposal.getMoney(), reversedCounterProperty, -currentTradeProposal.getCommunityChestJailCard(), -currentTradeProposal.getChanceJailCard());
				var counterResponse = currentRecipient.AI.acceptTrade(reversedCounter);

				if (counterResponse === true) {
					acceptedFinalTrade = currentTradeProposal;
					break;
				} else if (counterResponse instanceof Trade) {
					currentTradeProposal = counterResponse;
					var tempPlayer = currentInitiator;
					currentInitiator = currentRecipient;
					currentRecipient = tempPlayer;
				} else {
					break;
				}
			}

			if (acceptedFinalTrade) {
				showTradeResult(this, acceptedFinalTrade.getInitiator().name + " countered and traded with " + acceptedFinalTrade.getRecipient().name, acceptedFinalTrade);
				this.acceptTrade(acceptedFinalTrade);
			} else {
				showTradeResult(this, currentInitiator.name + " declined a counter-offer from " + currentRecipient.name, currentTradeProposal);
				this.cancelTrade();
			}
		}
	};

	Game.prototype.trade = function(tradeObj) {
		if (tradeObj instanceof Trade && !tradeObj.getInitiator().human && !tradeObj.getRecipient().human) {
			this.proposeBotTrade(tradeObj);
			return;
		}

		if (this.ui) {
			this.ui.setTradePanelVisible(true);
			this.ui.setTradeButtons(true, false);
		}

		if (tradeObj instanceof Trade) {
			writeTrade(this, tradeObj);
			this.proposeTrade();
		} else {
			var gameState = this.state;
			var initiator = gameState.player[gameState.turn];
			var recipient = gameState.player[gameState.turn] === gameState.player[1]
				? gameState.player[2]
				: gameState.player[1];

			resetTrade(this, initiator, recipient, true);
		}
	};


	Game.prototype.cancelTrade = function() {
		if (this.ui) this.ui.setTradePanelVisible(false);

		var player = this.state.player[this.state.turn];
		if (!player.human) {
			player.AI.alertList = "";
			this.next();
		}

	};

	Game.prototype.acceptTrade = function(tradeObj) {
		if (!tradeObj && this.ui) {
			var moneyFields = this.ui.readTradeMoneyFields();
			if (isNaN(moneyFields.left)) {
				this.ui.setTradeMoneyError('left', 'This value must be a number.');
				return false;
			}
			if (isNaN(moneyFields.right)) {
				this.ui.setTradeMoneyError('right', 'This value must be a number.');
				return false;
			}
		}

		var showAlerts = true;
		var money;
		var initiator;
		var recipient;

		if (tradeObj) {
			showAlerts = false;
		} else {
			tradeObj = readTrade(this);
		}

		var money = tradeObj.getMoney();
		initiator = tradeObj.getInitiator();
		recipient = tradeObj.getRecipient();


		if (money > 0 && money > initiator.money) {
			if (this.ui) this.ui.setTradeMoneyError('left', initiator.name + " does not have $" + money + ".");
			return false;
		} else if (money < 0 && -money > recipient.money) {
			if (this.ui) this.ui.setTradeMoneyError('right', recipient.name + " does not have $" + (-money) + ".");
			return false;
		}

		var isAPropertySelected = 0;

		// Ensure that some properties are selected.
		for (var i = 0; i < 40; i++) {
			isAPropertySelected |= tradeObj.getProperty(i);
		}

		isAPropertySelected |= tradeObj.getCommunityChestJailCard();
		isAPropertySelected |= tradeObj.getChanceJailCard();

		if (isAPropertySelected === 0) {
			if (this.ui) this.ui.showMessage("One or more properties must be selected in order to trade.");

			return false;
		}

		var gameInstance = this;
		var gameState = this.state;
		var completeTrade = function() {

		// Exchange properties
		for (var i = 0; i < 40; i++) {

			if (tradeObj.getProperty(i) === 1) {
				gameState.square[i].owner = recipient.index;
				if (gameInstance.ui) gameInstance.ui.alert(recipient.name + " received " + gameState.square[i].name + " from " + initiator.name + ".", recipient.index, initiator.index);
			} else if (tradeObj.getProperty(i) === -1) {
				gameState.square[i].owner = initiator.index;
				if (gameInstance.ui) gameInstance.ui.alert(initiator.name + " received " + gameState.square[i].name + " from " + recipient.name + ".", initiator.index, recipient.index);
			}

		}

		if (tradeObj.getCommunityChestJailCard() === 1) {
			initiator.communityChestJailCard = false;
			recipient.communityChestJailCard = true;
			if (gameInstance.ui) gameInstance.ui.alert(recipient.name + ' received a "Get Out of Jail Free" card from ' + initiator.name + ".", recipient.index, initiator.index);
		} else if (tradeObj.getCommunityChestJailCard() === -1) {
			initiator.communityChestJailCard = true;
			recipient.communityChestJailCard = false;
			if (gameInstance.ui) gameInstance.ui.alert(initiator.name + ' received a "Get Out of Jail Free" card from ' + recipient.name + ".", initiator.index, recipient.index);
		}

		if (tradeObj.getChanceJailCard() === 1) {
			initiator.chanceJailCard = false;
			recipient.chanceJailCard = true;
			if (gameInstance.ui) gameInstance.ui.alert(recipient.name + ' received a "Get Out of Jail Free" card from ' + initiator.name + ".", recipient.index, initiator.index);
		} else if (tradeObj.getChanceJailCard() === -1) {
			initiator.chanceJailCard = true;
			recipient.chanceJailCard = false;
			if (gameInstance.ui) gameInstance.ui.alert(initiator.name + ' received a "Get Out of Jail Free" card from ' + recipient.name + ".", initiator.index, recipient.index);
		}

		// Exchange money.
		if (money > 0) {
			initiator.pay(money, recipient.index);
			recipient.money += money;

			if (gameInstance.ui) gameInstance.ui.alert(recipient.name + " received $" + money + " from " + initiator.name + ".", recipient.index, initiator.index);
		} else if (money < 0) {
			money = -money;

			recipient.pay(money, initiator.index);
			initiator.money += money;

			if (gameInstance.ui) gameInstance.ui.alert(initiator.name + " received $" + money + " from " + recipient.name + ".", initiator.index, recipient.index);
		}

		if (gameInstance.ui) {
			gameInstance.ui.updateOwned();
			gameInstance.ui.updateMoney();
			gameInstance.ui.setTradePanelVisible(false);
		}

		var currentPlayer = gameState.player[gameState.turn];
		if (!currentPlayer.human) {
			currentPlayer.AI.alertList = "";
			gameInstance.next();
		}
		};

		if (showAlerts) {
			if (this.ui) this.ui.confirm(initiator.name + ", are you sure you want to make this exchange with " + recipient.name + "?", completeTrade);
		} else {
			completeTrade();
		}
	};

	Game.prototype.proposeTrade = function(skipConfirmation) {
		var moneyFields = this.ui ? this.ui.readTradeMoneyFields() : { left: 0, right: 0 };
		if (isNaN(moneyFields.left)) {
			if (this.ui) this.ui.setTradeMoneyError('left', "This value must be a number.");
			return false;
		}

		if (isNaN(moneyFields.right)) {
			if (this.ui) this.ui.setTradeMoneyError('right', "This value must be a number.");
			return false;
		}

		var tradeObj = readTrade(this);
		var money = tradeObj.getMoney();
		var initiator = tradeObj.getInitiator();
		var recipient = tradeObj.getRecipient();
		var reversedTradeProperty = [];

		if (money > 0 && money > initiator.money) {
			if (this.ui) this.ui.setTradeMoneyError('left', initiator.name + " does not have $" + money + ".");
			return false;
		} else if (money < 0 && -money > recipient.money) {
			if (this.ui) this.ui.setTradeMoneyError('right', recipient.name + " does not have $" + (-money) + ".");
			return false;
		}

		var isAPropertySelected = 0;

		// Ensure that some properties are selected.
		for (var i = 0; i < 40; i++) {
			reversedTradeProperty[i] = -tradeObj.getProperty(i);
			isAPropertySelected |= tradeObj.getProperty(i);
		}

		isAPropertySelected |= tradeObj.getCommunityChestJailCard();
		isAPropertySelected |= tradeObj.getChanceJailCard();

		if (isAPropertySelected === 0) {
			if (this.ui) this.ui.showMessage("One or more properties must be selected in order to trade.");

			return false;
		}

		var gameInstance = this;
		if (initiator.human && !skipConfirmation) {
			if (this.ui) this.ui.confirm(initiator.name + ", are you sure you want to make this offer to " + recipient.name + "?", function() {
				gameInstance.proposeTrade(true);
			}, "Yes/No");
			return false;
		}

		var reversedTrade = new Trade(recipient, initiator, -money, reversedTradeProperty, -tradeObj.getCommunityChestJailCard(), -tradeObj.getChanceJailCard());

		if (recipient.human) {

			writeTrade(this, reversedTrade);

			if (this.ui) this.ui.setTradeButtons(false, true);

			if (this.ui) {
				this.ui.alert(initiator.name + " initiated a trade with " + recipient.name + ".");
				this.ui.showMessage(initiator.name + " has proposed a trade with you, " + recipient.name + ". You may accept, reject, or modify the offer.", null, undefined, 0);
			}
		} else {
			var tradeResponse = recipient.AI.acceptTrade(tradeObj);

			if (tradeResponse === true) {
				if (initiator.human) {
					if (this.ui) this.ui.showMessage(recipient.name + " has accepted your offer.");
				} else {
					showTradeResult(this, initiator.name + " traded with " + recipient.name, tradeObj);
				}
				this.acceptTrade(reversedTrade);
			} else if (tradeResponse === false) {
				if (initiator.human) {
					if (this.ui) this.ui.showMessage(recipient.name + " has declined your offer.");
				} else {
					showTradeResult(this, initiator.name + " declined a trade with " + recipient.name, tradeObj);
				}
				this.cancelTrade();
				return;
			} else if (tradeResponse instanceof Trade) {
				if (!initiator.human) {
					var currentTradeProposal = tradeResponse;
					var currentInitiator = recipient;
					var currentRecipient = initiator;
					var acceptedFinalTrade = null;
					var maxRounds = 5;

					for (var round = 0; round < maxRounds; round++) {
						var reversedCounterProperty = [];
						for (var counterIndex = 0; counterIndex < 40; counterIndex++) {
							reversedCounterProperty[counterIndex] = -currentTradeProposal.getProperty(counterIndex);
						}

						var reversedCounter = new Trade(currentInitiator, currentRecipient, -currentTradeProposal.getMoney(), reversedCounterProperty, -currentTradeProposal.getCommunityChestJailCard(), -currentTradeProposal.getChanceJailCard());
						var counterResponse = currentRecipient.AI.acceptTrade(reversedCounter);

						if (counterResponse === true) {
							acceptedFinalTrade = currentTradeProposal;
							break;
						} else if (counterResponse instanceof Trade) {
							// Opponent countered back: swap roles and continue the negotiation
							currentTradeProposal = counterResponse;
							var tempPlayer = currentInitiator;
							currentInitiator = currentRecipient;
							currentRecipient = tempPlayer;
						} else {
							// counterResponse === false: declined
							break;
						}
					}

					if (acceptedFinalTrade) {
						showTradeResult(this, acceptedFinalTrade.getInitiator().name + " countered and traded with " + acceptedFinalTrade.getRecipient().name, acceptedFinalTrade);
						this.acceptTrade(acceptedFinalTrade);
					} else {
						if (this.ui) {
							this.ui.alert(recipient.name + " proposed a counteroffer to " + initiator.name + ", which was declined.", recipient.index, initiator.index);
							this.ui.showMessage(recipient.name + " proposed a counteroffer, but " + initiator.name + " declined it.");
						}
						this.next();
					}
				} else {
					if (this.ui) this.ui.showMessage(recipient.name + " has proposed a counteroffer.", function() {
						writeTrade(gameInstance, tradeResponse);
						gameInstance.ui.setTradePanelVisible(true);
						gameInstance.ui.setTradeButtons(false, true);
					});
				}
			}
		}
	};
})();
