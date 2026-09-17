// The purpose of this AI is not to be a relistic opponant, but to give an example of a vaild AI player.
function AITest3(p, params) {
    this.params = params;
	// When purchasing, what is the least amount of money the user should keep?
	this.purchaseThreshold = params.purchaseThreshold;
	// When buying at home, what is the least amount of money the user should keep?
	this.housePurchaseThreshold = params.housePurchaseThreshold;
	// If bid needs to be upped, by how much?
	this.bidUp = params.bidUp;
	// At what value do we consider trade to be good enough?
	this.tradeAcceptanceThreshold = params.tradeAcceptanceThreshold;
	// At what value is the trade not worthy of countering?
	this.tradeRejectionThreshold = params.tradeRejectionThreshold;
	// How many spots behind is the agent willing to trade?
	this.spotsBehind = params.spotsBehind;
	// How many spots in front of is the agent willing to trade?
	this.spotsAhead = params.spotsAhead;
	// Value of a Community Get Out Of Jail Card
	this.communityChestJailCardValue = params.communityChestJailCardValue;
	// Value of a Chance Get Out of Jail Card
	this.chanceJailCardValue = params.chanceJailCardValue;

	// Trade rejection amount
	this.amountOfRejections = 0;
	// Cap maximal amount of rejections
	this.maxAmountOfRejections = params.maxAmountOfRejections;
	//Odds of buying the first buildings
	this.firstBuildingOdds = params.firstBuildingOdds;
	//Odds of buying the last buildings
	this.lastBuildingOdds = params.lastBuildingOdds;

	this.alertList = "";

	this.currentTileTrade = [];

	// Blacklist of spots that you do not want to exchange because of maxAmountOfRejections for example 
	this.doNotOfferThose = [];

	// This variable is static, it is not related to each instance.
	this.constructor.count++;

	p.name = "AI 3 Player " + this.constructor.count;

	// Decide whether to buy a property the AI landed on.
	// Return: boolean (true to buy).
	// Arguments:
	// index: the property's index (0-39).
	this.buyProperty = function(index) {
		//console.log("buyProperty");
		var s = square[index];

		if (p.money > s.price + this.purchaseThreshold) {
			if (index==5 || index==15 || index==25 || index==35 /*railroads*/|| index==12 /*electric company*/ || index==28 /*waterworks*/)
				return true;
			else {
				//Favor more expensive buildings
				var randomValue = Math.floor(Math.random() * 100);
				//How likely is the bot to buy the property
				var indexCoefficient = index/40 * (this.lastBuildingOdds - this.firstBuildingOdds);
				//35% odds on the first building, 100% odds on the final one
				if (this.firstBuildingOdds+indexCoefficient>=randomValue) {
					console.log("Bought property " + s.name + "!");
					return true;
				} else {
					console.log("Decided not to buy");
					return false;
				}
			}
		} else {
			console.log("Not enough money to buy");
			return false;
		}

	}

	// Determine the response to an offered trade.
	// Return: boolean/instanceof Trade: a valid Trade object to counter offer (with the AI as the recipient); false to decline; true to accept.
	// Arguments:
	// tradeObj: the proposed trade, an instanceof Trade, has the AI as the recipient.
	this.acceptTrade = function(tradeObj) {
		//console.log("acceptTrade");

		var tradeValue = 0;
		var money = tradeObj.getMoney();
		var initiator = tradeObj.getInitiator();
		var recipient = tradeObj.getRecipient();
		var property = [];

		tradeValue += this.communityChestJailCardValue * tradeObj.getCommunityChestJailCard();
		tradeValue += this.chanceJailCardValue * tradeObj.getChanceJailCard();

		tradeValue += money;

		for (var i = 0; i < 40; i++) {
			property[i] = tradeObj.getProperty(i);
			tradeValue += tradeObj.getProperty(i) * square[i].price * (square[i].mortgage ? 0.5 : 1);
		}

		console.log("Trading loss/gain: " + tradeValue);

		var proposedMoney = this.bidUp - tradeValue + money;

		if (tradeValue >= this.tradeAcceptanceThreshold) {
			console.log("Traded!");
			return true;
		} else if (tradeValue >= this.tradeRejectionThreshold && initiator.money > proposedMoney) {	
			return new Trade(initiator, recipient, proposedMoney, property, tradeObj.getCommunityChestJailCard(), tradeObj.getChanceJailCard());
		}

		return false;
	}

	// This function is called at the beginning of the AI's turn, before any dice are rolled. The purpose is to allow the AI to manage property and/or initiate trades.
	// Return: boolean: Must return true if and only if the AI proposed a trade.
	this.beforeTurn = function() {
		//console.log("AI 3!");
		//console.log("beforeTurn");
		var s;
		var allGroupOwned;
		var max;
		var leastHouseProperty;
		var leastHouseNumber;
		var amountOfRejections;

		// Buy houses.
		for (var i = 0; i < 40; i++) {
			s = square[i];

			if (s.owner === p.index && s.groupNumber >= 3) {
				max = s.group.length;
				allGroupOwned = true;
				leastHouseNumber = 6; // No property will ever have 6 houses.

				for (var j = max - 1; j >= 0; j--) {
					if (square[s.group[j]].owner !== p.index) {
						allGroupOwned = false;
						break;
					}

					if (square[s.group[j]].house < leastHouseNumber) {
						leastHouseProperty = square[s.group[j]];
						leastHouseNumber = leastHouseProperty.house;
					}
				}

				if (!allGroupOwned) {
					continue;
				}

				if (s.hotel === 0 && p.money > leastHouseProperty.houseprice + this.housePurchaseThreshold) {
					console.log("Bought house!");
					buyHouse(leastHouseProperty.index);
				}


			}
		}

		// Unmortgage property
		for (var i = 39; i >= 0; i--) {
			s = square[i];

			if (s.owner === p.index && s.mortgage && p.money > s.price) {
				unmortgage(i);
			}
		}

		return false;
	}

	var utilityForRailroadFlag = true; // Don't offer this trade more than once.


	// This function is called every time the AI lands on a square. The purpose is to allow the AI to manage property and/or initiate trades.
	// Return: boolean: Must return true if and only if the AI proposed a trade.
	this.onLand = function() {
		//console.log("onLand");
		var proposedTrade;
		var property = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
		var railroadIndexes = [5, 15, 25, 35];
		var requestedRailroad;
		var offeredUtility = 0;
		var indexOfValueToTrade = 0;
		var s;

		// If AI owns exactly one utility, try to trade it for a railroad.
		for (var i = 0; i < 4; i++) {
			s = square[railroadIndexes[i]];

			if (s.owner !== 0 && s.owner !== p.index) {
				requestedRailroad = s.index;
				break;
			}
		}

		//Check if trade was a success
		if (typeof this.currentTileTrade[1] !== 'undefined' && square[this.currentTileTrade[1]].owner == p.index) {
			this.amountOfRejections = 0;
			this.currentTileTrade = [];
			// We can check the trade again after a couple of offers have been made
			this.doNotOfferThose = [];
			console.log("Trade succeeded!");
		}

		//Check if it's worth to trade properties
		for (var i=0; i<40; i++) {
			s = square[i];
			
			if (typeof s.group !== 'undefined')  {
				var sum = 0;
				//Find if a person owns all propertes but one
				s.group.forEach(function(element) {
					if (square[element].owner == p.index) {
						sum++;
					} else {
						indexOfValueToTrade = element;
					}
				});

				//Attempt to find a spot it already owns to trade with other player
				if (sum == s.group.length-1 && square[indexOfValueToTrade].owner != 0 && square[indexOfValueToTrade].mortgage == false) {
					console.log("Found a group of n-1! " + s.group);

					//Find out if he has any properties he would like to give away, make it fair
					var j = Math.max(i-this.spotsBehind, 1);
					for (j; j<j+this.spotsAhead+this.spotsBehind; j++) {

						//If it gets out of bounds, finish the search
						if (j>40) break;
						//If the value was blacklisted, don't consider it
						if (this.doNotOfferThose.includes(j)) continue;

						var sj = square[j];
                        if(sj) {
                            if (typeof sj.group !== 'undefined') {
                                var sum2 = 0;
                                //Find if he owns any property from a group that has exactly one property
                                sj.group.forEach(function(element) {
                                    if (square[element].owner == p.index) {
                                        sum2++;
                                    }
                                }); 
                                //And don't make it a railroad, this is in a different spot below
                                if (sum2 < sj.group.length-1) {
                                    if (j!=5 && j!=15 && j!=25 && j!=35) {
                                        offeredUtility = j;
                                        break;
                                    }	
                                }
                            }
                        }
					}
					console.log("Offered utility = " + offeredUtility);
					//Keep increasing the value of a bid until the other side agrees
					var differenceInMoneyCosts = Math.max(square[indexOfValueToTrade].price-square[offeredUtility].price+this.bidUp*this.amountOfRejections, 0);
					//Finally run the trade
					if (offeredUtility!=0 && square[offeredUtility].mortgage==false && p.money>=differenceInMoneyCosts + this.tradeAcceptanceThreshold && this.amountOfRejections < this.maxAmountOfRejections) {
						//console.log(p.money + " " + differenceInMoneyCosts + " " + this.tradeAcceptanceThreshold);
						if (typeof this.currentTileTrade[0] !== 'undefined' && this.currentTileTrade[0]!=indexOfValueToTrade && this.amountOfRejections!=0) {
							//It always attempts to follow the same trade
							break;
						} else {
							//Register as a new trade
							this.currentTileTrade[0] = indexOfValueToTrade, 
							this.currentTileTrade[1] = offeredUtility
						}

						//Propose a new trade
						property[indexOfValueToTrade] = -1;
						property[offeredUtility] = 1;	
						console.log("Trading " + square[indexOfValueToTrade].name + " for your " + square[offeredUtility].name);
						proposedTrade = new Trade(p, player[square[indexOfValueToTrade].owner], differenceInMoneyCosts, property, 0, 0);
						this.amountOfRejections++;

						game.trade(proposedTrade);
						return true;
					} else if (this.amountOfRejections >= this.maxAmountOfRejections) {
						console.log("Too many rejections...");
						this.amountOfRejections = 0;
						this.doNotOfferThose.push(indexOfValueToTrade);
						break;
					} else {
						console.log("Not enough money...");
						break;
					}
				}
			}
		}

		if (square[12].owner === p.index && square[28].owner !== p.index) {
			offeredUtility = 12;
		} else if (square[28].owner === p.index && square[12].owner !== p.index) {
			offeredUtility = 28;
		}

		if (utilityForRailroadFlag && game.getDie(1) !== game.getDie(2) && requestedRailroad && offeredUtility) {
			utilityForRailroadFlag = false;
			property[requestedRailroad] = -1;
			property[offeredUtility] = 1;

			proposedTrade = new Trade(p, player[square[requestedRailroad].owner], 0, property, 0, 0)
			console.log("Trying to buy railroads!");
			game.trade(proposedTrade);
			return true;
		}

		if (utilityForRailroadFlag && game.getDie(1) !== game.getDie(2) && requestedRailroad && offeredUtility) {
			utilityForRailroadFlag = false;
			property[requestedRailroad] = -1;
			property[offeredUtility] = 1;

			proposedTrade = new Trade(p, player[square[requestedRailroad].owner], 0, property, 0, 0)
			console.log("Trying to buy railroads!");
			game.trade(proposedTrade);
			return true;
		}

		return false;
	}

	// Determine whether to post bail/use get out of jail free card (if in possession).
	// Return: boolean: true to post bail/use card.
	this.postBail = function() {
		console.log("postBail");

		// p.jailroll === 2 on third turn in jail.
		if ((p.communityChestJailCard || p.chanceJailCard) && p.jailroll === 2) {
			return true;
		} else {
			return false;
		}
	}

	// Mortgage enough properties to pay debt.
	// Return: void: don't return anything, just call the functions mortgage()/sellhouse()
	this.payDebt = function() {
		console.log("payDebt");
        for (var i = 39; i >= 0; i--) {
			s = square[i];

			if (s.owner === p.index && !s.mortgage && s.house > 0) {
                for(let j = s.house; j > 0; j--) {
                    sellHouse(i);
                    console.log("Selling house on " + s.name);
                    
                    if (p.money >= 0) {
                        return;
                    }
                }
			}
		}
        
		for (var i = 39; i >= 0; i--) {
			s = square[i];

			if (s.owner === p.index && !s.mortgage && s.house === 0) {
				mortgage(i);
				console.log("Mortgaging property " + s.name);
			}

			if (p.money >= 0) {
				return;
			}
		}

	}

	// Determine what to bid during an auction.
	// Return: integer: -1 for exit auction, 0 for pass, a positive value for the bid.
	this.bid = function(property, currentBid) {
		console.log("bid");
		var bid;

		bid = currentBid + Math.round(Math.random() * 20 + 10);

		if (p.money < bid + 50 || bid > square[property].price * 1.5) {
			return -1;
		} else {
			return bid;
		}

	}
}
