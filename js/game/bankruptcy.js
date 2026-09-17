// Bankruptcy/elimination flow, mixed onto Game.prototype.
(function() {
	Game.prototype.eliminatePlayer = function() {
		var p = player[turn];

		for (var i = p.index; i < pcount; i++) {
			player[i] = player[i + 1];
			player[i].index = i;

		}

		for (var i = 0; i < 40; i++) {
			if (square[i].owner >= p.index) {
				square[i].owner--;
			}
		}

		pcount--;
		turn--;

		if (pcount === 2) {
			document.getElementById("stats").style.width = "454px";
		} else if (pcount === 3) {
			document.getElementById("stats").style.width = "686px";
		}

		if (pcount === 1) {
			var winnerName = player[1].name;
			updateMoney();
			$("#board, #control, #moneybar").show();
			$("#refresh").hide();
			$("#nextbutton").val("Restart Game").prop("title", "Return to the settings screen and start another game.").off("click").on("click", restartGame);

			const gameResults = [];
			console.log(playersGame);
			for(let p of playersGame) {
				if(p.AI.params) {
					const pl = {
						params: p.AI.params,
						result: (p === player[1]) ? "win" : "lose"
					};
					gameResults.push(pl);
				}
			}
			console.log(gameResults);
			if(localStorage.getItem('gameHistory')) {
				let gameHistory = JSON.parse(localStorage.getItem('gameHistory'));
				gameHistory.push(gameResults);
				localStorage.setItem('gameHistory', JSON.stringify(gameHistory));
			} else {
				let gameHistory = [];
				gameHistory.push(gameResults);
				localStorage.setItem('gameHistory', JSON.stringify(gameHistory));
			}

			popup("<div class='winner-popup-title'>" + winnerName + " Wins!!</div>", null, 5);
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

		var HTML = "<p>" + player[p.creditor].name + ", you may unmortgage any of the following properties, interest free, by clicking on them. Click OK when finished.</p><table>";
		var price;

		for (var i = 0; i < 40; i++) {
			sq = square[i];
			if (sq.owner == p.index && sq.mortgage) {
				price = Math.round(sq.price * 0.5);

				HTML += "<tr><td class='propertycellcolor' style='background: " + sq.color + ";";

				if (sq.groupNumber == 1 || sq.groupNumber == 2) {
					HTML += " border: 1px solid grey;";
				} else {
					HTML += " border: 1px solid " + sq.color + ";";
				}

				// Player already paid interest, so they can unmortgage for the mortgage price.
				HTML += "' onmouseover='showdeed(" + i + ");' onmouseout='hidedeed();'></td><td class='propertycellname'><a href='javascript:void(0);' title='Unmortgage " + sq.name + " for $" + price + ".' onclick='if (" + price + " <= player[" + p.creditor + "].money) {player[" + p.creditor + "].pay(" + price + ", 0); square[" + i + "].mortgage = false; addAlert(\"" + player[p.creditor].name + " unmortgaged " + sq.name + " for $" + price + ".\");} this.parentElement.parentElement.style.display = \"none\";'>Unmortgage " + sq.name + " ($" + price + ")</a></td></tr>";

				sq.owner = p.creditor;

			}
		}

		HTML += "</table>";

		popup(HTML, game.eliminatePlayer, 0);
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
				addAlert(creditor.name + " unmortgaged " + property.name + " for $" + unmortgagePrice + ".", creditor.index);
			}
		}
	};

	Game.prototype.resign = function() {
		popup("<p>Are you sure you want to resign?</p>", game.bankruptcy, "Yes/No");
	};

	Game.prototype.bankruptcy = function() {
		var p = player[turn];
		var pcredit = player[p.creditor];
		var bankruptcyUnmortgageFee = 0;


		if (p.money >= 0) {
			return;
		}

		addAlert(p.name + " is bankrupt.");

		if (p.creditor !== 0) {
			pcredit.money += p.money;
		}

		for (var i = 0; i < 40; i++) {
			sq = square[i];
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
				}

				if (p.creditor === 0) {
					sq.mortgage = false;
					game.addPropertyToAuctionQueue(i);
					sq.owner = 0;
				}
			}
		}

		updateMoney();

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
			addAlert(pcredit.name + " paid $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties received from " + p.name + ".");
			if (pcredit.human) {
				popup("<p>" + pcredit.name + ", you must pay $" + bankruptcyUnmortgageFee + " interest on the mortgaged properties you received from " + p.name + ".</p>", function() {player[pcredit.index].pay(bankruptcyUnmortgageFee, 0); game.bankruptcyUnmortgage();}, 0);
			} else {
				pcredit.pay(bankruptcyUnmortgageFee, 0);
				game.botBankruptcyUnmortgage(p, pcredit);
				updateMoney();
				updateOwned();
				game.eliminatePlayer();
			}
		}
	};
})();
