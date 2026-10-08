// Bankruptcy/elimination flow, mixed onto Game.prototype.
(function() {
	Game.prototype.eliminatePlayer = function() {
		var gameState = this.state;
		var p = gameState.player[gameState.turn];

		// Remove the bankrupt player's on-board token now, before indices shift below - otherwise
		// it gets recolored and animated into whichever remaining player takes over its slot.
		if (this.ui) this.ui.removePlayerToken(p.index);

		for (var i = p.index; i < gameState.pcount; i++) {
			gameState.player[i] = gameState.player[i + 1];
			gameState.player[i].index = i;
			gameState.playerOverlays[i] = gameState.playerOverlays[i + 1];
			gameState.lastKnownPosition[i] = gameState.lastKnownPosition[i + 1];
			gameState.lastKnownJail[i] = gameState.lastKnownJail[i + 1];
		}

		gameState.playerOverlays.length = gameState.pcount;
		gameState.lastKnownPosition.length = gameState.pcount;
		gameState.lastKnownJail.length = gameState.pcount;

		for (var i = 0; i < gameState.square.length; i++) {
			if (gameState.square[i].owner >= p.index) {
				gameState.square[i].owner--;
			}
		}

		gameState.pcount--;
		gameState.turn--;

		if (this.ui) this.ui.onPlayerCountChanged(gameState.pcount);

		if (gameState.pcount === 1) {
			var winnerName = gameState.player[1].name;
			this.isOver = true;
			if (typeof this.onGameCompleted === 'function') {
				this.onGameCompleted();
			}
			if (this.ui) this.ui.updateMoney();
			// Record the game results for AI player genetic evolution.
			const gameResults = [];
			if (Array.isArray(gameState.playersGame)) {
				for(let p of gameState.playersGame) {
					if(p && p.AI && p.AI.params) {
						const pl = {
							params: p.AI.params,
							// Legacy entries with no aiType predate this tag and are all genetic3.
							type: p.AI.aiType || 'genetic3',
							result: (p === gameState.player[1]) ? "win" : "lose"
						};
						gameResults.push(pl);
					}
				}
				if (typeof GameStorage !== 'undefined' && typeof GameStorage.appendResults === 'function') {
					GameStorage.appendResults(gameResults);
				}
			}

			if (this.ui) this.ui.onGameOver(winnerName);
		} else {
			if (typeof this.play === 'function') this.play();
		}
	};

	Game.prototype.bankruptcyUnmortgage = function() {
		var gameState = this.state;
		var p = gameState.player[gameState.turn];

		if (p.creditor === 0) {
			this.eliminatePlayer();
			return;
		}

		var properties = [];

		for (var i = 0; i < gameState.square.length; i++) {
			var sq = gameState.square[i];
			if (sq.owner == p.index && sq.mortgage) {
				properties.push({
					index: i,
					name: sq.name,
					color: sq.color,
					groupNumber: sq.groupNumber,
					price: Math.round(sq.price * 0.5)
				});

				sq.owner = p.creditor;

			}
		}

		this.ui.showBankruptcyUnmortgage(gameState.player[p.creditor].name, properties, function(index) {
			return this.confirmBankruptcyUnmortgage(index);
		}.bind(this), this.eliminatePlayer.bind(this));
	};

	// Handles a single unmortgage click from the bankruptcyUnmortgage() popup, keeping the board's
	// mortgaged styling and money/owned panels in sync (the property was already transferred).
	Game.prototype.confirmBankruptcyUnmortgage = function(index) {
		var gameState = this.state;
		var sq = gameState.square[index];
		var creditor = gameState.player[sq.owner];
		var price = Math.round(sq.price * 0.5);

		if (price > creditor.money) {
			if (this.ui) this.ui.alert(creditor.name + " does not have enough money to unmortgage " + sq.name + ".");
			return false;
		}

		creditor.pay(price, 0);
		sq.mortgage = false;
		if (this.ui) {
			this.ui.alert(creditor.name + " unmortgaged " + sq.name + " for $" + price + ".");
			this.ui.updateOwned();
			this.ui.updateMoney();
		}
		if (this.ui) this.ui.onMortgageChanged(index, false);
		return true;
	};

	Game.prototype.botBankruptcyUnmortgage = function(bankruptPlayer, creditor) {
		var gameState = this.state;
		var liquidityFloor = creditor.AI && typeof creditor.AI.getLiquidityFloor === "function" ? creditor.AI.getLiquidityFloor() : Math.max(100, creditor.money * 0.25);
		var isDefensive = creditor.AI && creditor.AI.profile && creditor.AI.profile.name === "Defensive";

		for (var i = 0; i < gameState.square.length; i++) {
			var property = gameState.square[i];
			if (property.owner !== bankruptPlayer.index || !property.mortgage) {
				continue;
			}

			property.owner = creditor.index;
			var unmortgagePrice = Math.round(property.price * 0.5);
			if (!isDefensive && creditor.money - unmortgagePrice >= liquidityFloor) {
				creditor.pay(unmortgagePrice, 0);
				property.mortgage = false;
				if (this.ui) this.ui.alert(creditor.name + " unmortgaged " + property.name + " for $" + unmortgagePrice + ".", creditor.index);
				if (this.ui) this.ui.onMortgageChanged(i, false);
			}
		}
	};

	Game.prototype.resign = function() {
		this.ui.confirm("Are you sure you want to resign?", this.bankruptcy.bind(this));
	};

	Game.prototype.bankruptcy = function() {
		var gameState = this.state;
		var p = gameState.player[gameState.turn];
		var pcredit = gameState.player[p.creditor];
		var bankruptcyUnmortgageFee = 0;


		if (p.money >= 0) {
			return;
		}

		if (this.ui) this.ui.alert(p.name + " is bankrupt.");
		if (this.ui && typeof this.ui.onPlayerBankrupt === 'function') {
			this.ui.onPlayerBankrupt(p, pcredit);
		}

		if (p.creditor !== 0) {
			pcredit.money += p.money;
		}

		for (var i = 0; i < gameState.square.length; i++) {
			var sq = gameState.square[i];
			if (sq.owner == p.index) {
				// Mortgaged properties will be tranfered by bankruptcyUnmortgage();
				if (!sq.mortgage) {
					sq.owner = p.creditor;
				} else {
					bankruptcyUnmortgageFee += Math.round(sq.price * 0.1);
				}

				if (sq.house > 0) {
					if (p.creditor !== 0) {
						pcredit.money += sq.houseprice * 0.5 * sq.house;
					}
					sq.hotel = 0;
					sq.house = 0;
					if (this.ui) this.ui.onHouseChanged(i, 0, 0);
				}

				if (p.creditor === 0) {
					sq.mortgage = false;
					this.addPropertyToAuctionQueue(i);
					sq.owner = 0;
				}
			}
		}

		if (this.ui) this.ui.updateMoney();

		if (p.chanceJailCard) {
			p.chanceJailCard = false;
			pcredit.chanceJailCard = true;
		}

		if (p.communityChestJailCard) {
			p.communityChestJailCard = false;
			pcredit.communityChestJailCard = true;
		}

		if (gameState.pcount === 2 || bankruptcyUnmortgageFee === 0 || p.creditor === 0) {
			this.eliminatePlayer();
		} else {
			if (this.ui) this.ui.alert(pcredit.name + " paid $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties received from " + p.name + ".");
			if (pcredit.human) {
				this.ui.showMessage(pcredit.name + ", you must pay $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties you received from " + p.name + ".", function() { pcredit.pay(bankruptcyUnmortgageFee, 0); this.bankruptcyUnmortgage(); }.bind(this), undefined, 0);
			} else {
				pcredit.pay(bankruptcyUnmortgageFee, 0);
				this.botBankruptcyUnmortgage(p, pcredit);
				if (this.ui) {
					this.ui.updateMoney();
					this.ui.updateOwned();
				}
				this.eliminatePlayer();
			}
		}
	};
})();
