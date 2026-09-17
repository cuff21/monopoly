// Auction flow, mixed onto Game.prototype. Private state below is module-scoped closure state
// rather than instance fields since only one Game instance (the global `game`) ever exists.
(function() {
	var auctionQueue = [];
	var highestbidder;
	var highestbid;
	var currentbidder = 1;
	var auctionproperty;
	var auctionHistory = [];

	var updateAuctionHistory = function(entry) {
		auctionHistory.push(entry);
		var history = document.getElementById("auctionhistory");
		history.innerHTML = auctionHistory.map(function(item) {
			return "<div>" + item + "</div>";
		}).join("");
		history.scrollTop = history.scrollHeight;
	};

	var updateAuctionParticipants = function() {
		document.getElementById("auctionparticipants").innerHTML = player.slice(1, pcount + 1).map(function(p) {
			var status = p.auctionStatus || (p.bidding ? "Bidding" : "Out");
			return "<div class='auction-participant' data-player-index='" + p.index + "'><span class='auction-player-name'><span class='auction-player-swatch' style='background-color: " + p.color + ";'></span>" + p.name + "</span><span class='auction-status auction-status-" + status.toLowerCase() + "'>" + status + "</span></div>";
		}).join("");
		$(".auction-participant").off("mouseenter mouseleave mousemove").on("mouseenter", function(event) {
			showAuctionPlayerStats(parseInt(this.getAttribute("data-player-index"), 10), event);
		}).on("mousemove", function(event) {
			positionAuctionPlayerStats(event);
		}).on("mouseleave", hideAuctionPlayerStats);
	};

	var finalizeAuction = function() {
		var p = player[highestbidder];
		var sq = square[auctionproperty];

		if (highestbid > 0) {
			p.pay(highestbid, 0);
			sq.owner = highestbidder;
			addAlert(p.name + " bought " + sq.name + " for $" + highestbid + ".", highestbidder);
			updateAuctionHistory(p.name + " won for $" + highestbid + ".");
			updateOwned();
		} else {
			updateAuctionHistory("No player bought " + sq.name + ".");
			addAlert(sq.name + " remains on the market because there were no buyers at the auction.");
		}
		$("#buypropertybutton").hide();

		for (var i = 1; i <= pcount; i++) {
			player[i].bidding = true;
			player[i].auctionStatus = "Bidding";
		}

		$("#popupbackground").hide();
		$("#popupwrap").hide();

		if (!game.auction()) {
			if (player[turn].human) {
				if (doublecount > 0) {
					document.getElementById("nextbutton").value = "Roll again";
					document.getElementById("nextbutton").title = "You threw doubles. Roll again.";
				} else {
					document.getElementById("nextbutton").value = "End turn";
					document.getElementById("nextbutton").title = "End turn and advance to the next player.";
				}
			} else {
				play();
			}
		}
	};

	Game.prototype.addPropertyToAuctionQueue = function(propertyIndex) {
		auctionQueue.push(propertyIndex);
	};

	Game.prototype.auction = function() {
		if (auctionQueue.length === 0) {
			return false;
		}

		index = auctionQueue.shift();

		var s = square[index];

		if (s.price === 0 || s.owner !== 0) {
			return game.auction();
		}

		auctionproperty = index;
		highestbidder = 0;
		highestbid = 0;
		auctionHistory = [];
		currentbidder = turn + 1;

		if (currentbidder > pcount) {
			currentbidder -= pcount;
		}

		for (var i = 1; i <= pcount; i++) {
			player[i].bidding = true;
			player[i].auctionStatus = "Bidding";
		}
		popup("<div class='auction-title'>Auction <span id='propertyname'></span></div><div class='auction-section'><div class='auction-section-title'>Players</div><div id='auctionparticipants'></div></div><div class='auction-section'><div class='auction-section-title'>Bid history</div><div id='auctionhistory'></div><div class='auction-high-bid'>Current high bid: $<span id='highestbid'></span> (<span id='highestbidder'></span>)</div></div><div id='currentbidder' class='auction-turn'></div><div><input id='bid' title='Enter an amount to bid on " + s.name + ".' /></div><div class='auction-actions'><input type='button' value='Bid' onclick='game.auctionBid();' title='Place your bid.' /><input type='button' value='Pass' title='Skip bidding this time.' onclick='game.auctionPass();' /><input type='button' value='Exit Auction' title='Stop bidding on " + s.name + " altogether.' onclick='game.auctionExit();' /></div>", "blank");

		document.getElementById("propertyname").innerHTML = "<a href='javascript:void(0);' onmouseover='showdeed(" + auctionproperty + ");' onmouseout='hidedeed();' class='statscellcolor'>" + s.name + "</a>";
		document.getElementById("highestbid").innerHTML = "0";
		document.getElementById("highestbidder").innerHTML = "N/A";
		document.getElementById("currentbidder").innerHTML = "It is " + player[currentbidder].name + "'s turn to bid.";
		updateAuctionParticipants();
		document.getElementById("bid").onkeydown = function (e) {
			var key = 0;
			var isCtrl = false;
			var isShift = false;

			if (window.event) {
				key = window.event.keyCode;
				isCtrl = window.event.ctrlKey;
				isShift = window.event.shiftKey;
			} else if (e) {
				key = e.keyCode;
				isCtrl = e.ctrlKey;
				isShift = e.shiftKey;
			}

			if (isNaN(key)) {
				return true;
			}

			if (key === 13) {
				game.auctionBid();
				return false;
			}

			// Allow backspace, tab, delete, arrow keys, or if control was pressed, respectively.
			if (key === 8 || key === 9 || key === 46 || (key >= 35 && key <= 40) || isCtrl) {
				return true;
			}

			if (isShift) {
				return false;
			}

			// Only allow number keys.
			return (key >= 48 && key <= 57) || (key >= 96 && key <= 105);
		};

		document.getElementById("bid").onfocus = function () {
			this.style.color = "black";
			if (isNaN(this.value)) {
				this.value = "";
			}
		};

		updateMoney();

		if (!player[currentbidder].human) {
			currentbidder = turn; // auctionPass advances currentbidder.
			this.auctionPass(true);
		}
		return true;
	};

	Game.prototype.auctionPass = function(isBid) {
		if (!isBid && player[currentbidder].bidding) {
			player[currentbidder].bidding = false;
			player[currentbidder].auctionStatus = "Passing";
			updateAuctionHistory(player[currentbidder].name + " passed.");
			updateAuctionParticipants();
		}
		if (highestbidder === 0) {
			highestbidder = currentbidder;
		}

		while (true) {
			currentbidder++;

			if (currentbidder > pcount) {
				currentbidder -= pcount;
			}

			if (currentbidder == highestbidder) {
				finalizeAuction();
				return;
			} else if (player[currentbidder].bidding) {
				var p = player[currentbidder];

				if (!p.human) {
					var bid = p.AI.bid(auctionproperty, highestbid);

					if (bid === -1 || highestbid >= p.money) {
						p.bidding = false;
						p.auctionStatus = "Out";
						updateAuctionHistory(p.name + " exited.");
						updateAuctionParticipants();
						continue;

					} else if (bid === 0) {
						p.bidding = false;
						p.auctionStatus = "Passing";
						updateAuctionHistory(p.name + " passed.");
						updateAuctionParticipants();
						continue;

					} else if (bid > 0) {
						this.auctionBid(bid);
						continue;
					}
					return;
				} else {
					break;
				}
			}

		}

		document.getElementById("currentbidder").innerHTML = "It is " + player[currentbidder].name + "'s turn to bid.";
		document.getElementById("bid").value = "";
		document.getElementById("bid").style.color = "black";
	};

	Game.prototype.auctionBid = function(bid) {
		bid = bid || parseInt(document.getElementById("bid").value, 10);

		if (bid === "" || bid === null) {
			document.getElementById("bid").value = "Please enter a bid.";
			document.getElementById("bid").style.color = "red";
		} else if (isNaN(bid)) {
			document.getElementById("bid").value = "Your bid must be a number.";
			document.getElementById("bid").style.color = "red";
		} else {

			if (bid > player[currentbidder].money) {
				document.getElementById("bid").value = "You don't have enough money to bid $" + bid + ".";
				document.getElementById("bid").style.color = "red";
			} else if (bid > highestbid) {
				highestbid = bid;
				document.getElementById("highestbid").innerHTML = parseInt(bid, 10);
				highestbidder = currentbidder;
				document.getElementById("highestbidder").innerHTML = player[highestbidder].name;
				updateAuctionHistory(player[currentbidder].name + " bid $" + highestbid + ".");

				document.getElementById("bid").focus();

				if (player[currentbidder].human) {
					this.auctionPass(true);
				}
			} else {
				document.getElementById("bid").value = "Your bid must be greater than highest bid. ($" + highestbid + ")";
				document.getElementById("bid").style.color = "red";
			}
		}
	};

	Game.prototype.auctionExit = function() {
		player[currentbidder].bidding = false;
		player[currentbidder].auctionStatus = "Out";
		updateAuctionHistory(player[currentbidder].name + " exited.");
		updateAuctionParticipants();
		this.auctionPass();
	};
})();
