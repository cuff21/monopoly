// Bankruptcy/elimination flow, mixed onto Game.prototype.
(function() {
	Game.prototype.eliminatePlayer = function() {
		var p = player[turn];

		// Remove the bankrupt player's on-board token now, before indices shift below - otherwise
		// it gets recolored and animated into whichever remaining player takes over its slot.
		if (game.ui) game.ui.removePlayerToken(p.index);

		for (var i = p.index; i < pcount; i++) {
			player[i] = player[i + 1];
			player[i].index = i;
			playerOverlays[i] = playerOverlays[i + 1];
			lastKnownPosition[i] = lastKnownPosition[i + 1];
			lastKnownJail[i] = lastKnownJail[i + 1];
		}

		playerOverlays.length = pcount;
		lastKnownPosition.length = pcount;
		lastKnownJail.length = pcount;

		for (var i = 0; i < 40; i++) {
			if (square[i].owner >= p.index) {
				square[i].owner--;
			}
		}

		pcount--;
		turn--;

		if (game.ui) game.ui.onPlayerCountChanged(pcount);

		if (pcount === 1) {
			var winnerName = player[1].name;
			if (typeof game !== 'undefined' && game) {
				game.isOver = true;
				if (typeof game.onGameCompleted === 'function') {
					game.onGameCompleted();
				}
			}
			if (game.ui) game.ui.updateMoney();
			// Record the game results for AI player genetic evolution.
			const gameResults = [];
			if (typeof playersGame !== 'undefined' && Array.isArray(playersGame)) {
				for(let p of playersGame) {
					if(p && p.AI && p.AI.params) {
						const pl = {
							params: p.AI.params,
							// Legacy entries with no aiType predate this tag and are all genetic3.
							type: p.AI.aiType || 'genetic3',
							result: (p === player[1]) ? "win" : "lose"
						};
						gameResults.push(pl);
					}
				}
				if (typeof GameStorage !== 'undefined' && typeof GameStorage.appendResults === 'function') {
					GameStorage.appendResults(gameResults);
				}
			}

			if (game.ui) game.ui.onGameOver(winnerName);
		} else {
			play();
		}
	};

	Game.prototype.bankruptcyUnmortgage = function() {
		var p = player[turn];

		if (p.creditor === 0) {
			game.eliminatePlayer();
			return;
		}

		var properties = [];

		for (var i = 0; i < 40; i++) {
			var sq = square[i];
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

		game.ui.showBankruptcyUnmortgage(player[p.creditor].name, properties, function(index) {
			return game.confirmBankruptcyUnmortgage(index);
		}, game.eliminatePlayer);
	};

	// Handles a single unmortgage click from the bankruptcyUnmortgage() popup, keeping the board's
	// mortgaged styling and money/owned panels in sync (the property was already transferred).
	Game.prototype.confirmBankruptcyUnmortgage = function(index) {
		var sq = square[index];
		var creditor = player[sq.owner];
		var price = Math.round(sq.price * 0.5);

		if (price > creditor.money) {
			if (game.ui) game.ui.alert(creditor.name + " does not have enough money to unmortgage " + sq.name + ".");
			return false;
		}

		creditor.pay(price, 0);
		sq.mortgage = false;
		if (game.ui) {
			game.ui.alert(creditor.name + " unmortgaged " + sq.name + " for $" + price + ".");
			game.ui.updateOwned();
			game.ui.updateMoney();
		}
		if (game.ui) game.ui.onMortgageChanged(index, false);
		return true;
	};

	Game.prototype.botBankruptcyUnmortgage = function(bankruptPlayer, creditor) {
		var liquidityFloor = creditor.AI && typeof creditor.AI.getLiquidityFloor === "function" ? creditor.AI.getLiquidityFloor() : Math.max(100, creditor.money * 0.25);
		var isDefensive = creditor.AI && creditor.AI.profile && creditor.AI.profile.name === "Defensive";

		for (var i = 0; i < 40; i++) {
			var property = square[i];
			if (property.owner !== bankruptPlayer.index || !property.mortgage) {
				continue;
			}

			property.owner = creditor.index;
			var unmortgagePrice = Math.round(property.price * 0.5);
			if (!isDefensive && creditor.money - unmortgagePrice >= liquidityFloor) {
				creditor.pay(unmortgagePrice, 0);
				property.mortgage = false;
				if (game.ui) game.ui.alert(creditor.name + " unmortgaged " + property.name + " for $" + unmortgagePrice + ".", creditor.index);
				if (game.ui) game.ui.onMortgageChanged(i, false);
			}
		}
	};

	Game.prototype.resign = function() {
		game.ui.confirm("Are you sure you want to resign?", game.bankruptcy);
	};

	Game.prototype.bankruptcy = function() {
		var p = player[turn];
		var pcredit = player[p.creditor];
		var bankruptcyUnmortgageFee = 0;


		if (p.money >= 0) {
			return;
		}

		if (game.ui) game.ui.alert(p.name + " is bankrupt.");
		if (typeof game !== 'undefined' && game && game.ui && typeof game.ui.onPlayerBankrupt === 'function') {
			game.ui.onPlayerBankrupt(p, pcredit);
		}

		if (p.creditor !== 0) {
			pcredit.money += p.money;
		}

		for (var i = 0; i < 40; i++) {
			var sq = square[i];
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
					if (game.ui) game.ui.onHouseChanged(i, 0, 0);
				}

				if (p.creditor === 0) {
					sq.mortgage = false;
					game.addPropertyToAuctionQueue(i);
					sq.owner = 0;
				}
			}
		}

		if (game.ui) game.ui.updateMoney();

		if (p.chanceJailCard) {
			p.chanceJailCard = false;
			pcredit.chanceJailCard = true;
		}

		if (p.communityChestJailCard) {
			p.communityChestJailCard = false;
			pcredit.communityChestJailCard = true;
		}

		if (pcount === 2 || bankruptcyUnmortgageFee === 0 || p.creditor === 0) {
			game.eliminatePlayer();
		} else {
			if (game.ui) game.ui.alert(pcredit.name + " paid $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties received from " + p.name + ".");
			if (pcredit.human) {
				game.ui.showMessage(pcredit.name + ", you must pay $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties you received from " + p.name + ".", function() {player[pcredit.index].pay(bankruptcyUnmortgageFee, 0); game.bankruptcyUnmortgage();}, undefined, 0);
			} else {
				pcredit.pay(bankruptcyUnmortgageFee, 0);
				game.botBankruptcyUnmortgage(p, pcredit);
				if (game.ui) {
					game.ui.updateMoney();
					game.ui.updateOwned();
				}
				game.eliminatePlayer();
			}
		}
	};
})();
