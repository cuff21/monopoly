// Per-Game turn and landing behavior. All mutable match data is read from game.state.
(function(global) {
	'use strict';

	function ui(game, method) {
		var adapter = game.ui;
		if (!adapter || typeof adapter[method] !== 'function') return;
		return adapter[method].apply(adapter, Array.prototype.slice.call(arguments, 2));
	}

	function currentPlayer(game) {
		return game.state.player[game.state.turn];
	}

	function addTaxToFreeParking(game, amount) {
		game.state.freeParkingPot += amount;
		ui(game, 'updateFreeParking');
		ui(game, 'alert', currentPlayer(game).name + ' added $' + amount + ' to Free Parking.');
	}

	function addAmount(game, amount, cause) {
		var p = currentPlayer(game);
		p.money += amount;
		ui(game, 'alert', p.name + ' received $' + amount + ' from ' + cause + '.');
	}

	function subtractAmount(game, amount, cause) {
		var state = game.state;
		var p = currentPlayer(game);
		p.pay(amount, 0);
		if (state.freeParkingTaxes) addTaxToFreeParking(game, amount);
		else ui(game, 'alert', p.name + ' lost $' + amount + ' from ' + cause + '.');
	}

	function collectFreeParking(game) {
		var state = game.state;
		var p = currentPlayer(game);
		if (state.freeParkingPot <= 0) return;
		p.money += state.freeParkingPot;
		ui(game, 'alert', p.name + ' collected $' + state.freeParkingPot + ' from Free Parking.');
		state.freeParkingPot = 0;
		ui(game, 'updateFreeParking');
	}

	async function goToJail(game) {
		var p = currentPlayer(game);
		ui(game, 'alert', p.name + ' was sent directly to jail.');
		ui(game, 'displayLanded', 'You are in jail.');
		p.jail = true;
		game.state.doublecount = 0;
		ui(game, 'updateButtonState', 'End turn', 'End turn and advance to the next player.');
		if (p.human) ui(game, 'focusNextButton');
		await ui(game, 'updatePosition');
		ui(game, 'updateOwned');
		if (!p.human) {
			p.AI.alertList = '';
			game.next();
		}
	}

	function payEachPlayer(game, amount, cause) {
		var state = game.state;
		var p = currentPlayer(game);
		var total = 0;
		var creditor;
		for (var i = 1; i <= state.pcount; i++) {
			if (i === state.turn) continue;
			state.player[i].money += amount;
			total += amount;
			creditor = p.money >= 0 ? i : creditor;
			p.pay(amount, creditor);
		}
		ui(game, 'alert', p.name + ' lost $' + total + ' from ' + cause + '.');
	}

	function collectFromEachPlayer(game, amount, cause) {
		var state = game.state;
		var p = currentPlayer(game);
		var total = 0;
		for (var i = 1; i <= state.pcount; i++) {
			if (i === state.turn) continue;
			var other = state.player[i];
			if (other.money < amount) {
				p.money += other.money;
				total += other.money;
				other.money = 0;
			} else {
				other.pay(amount, state.turn);
				p.money += amount;
				total += amount;
			}
		}
		ui(game, 'alert', p.name + ' received $' + total + ' from ' + cause + '.');
	}

	async function advance(game, destination, pass) {
		var state = game.state;
		var p = currentPlayer(game);
		var boardSize = state.square.length;
		if (!Number.isInteger(destination) || destination < 0 || destination >= boardSize) {
			throw new RangeError('Invalid movement destination: ' + destination);
		}
		if (typeof pass === 'number') {
			if (p.position < pass) p.position = pass;
			else {
				p.position = pass;
				p.money += 200;
				ui(game, 'alert', p.name + ' collected a $200 salary for passing GO.');
			}
		}
		if (p.position < destination) p.position = destination;
		else {
			p.position = destination;
			p.money += 200;
			ui(game, 'alert', p.name + ' collected a $200 salary for passing GO.');
		}
		await land(game);
	}

	async function advanceToNearestUtility(game) {
		var p = currentPlayer(game);
		if (p.position < 12) p.position = 12;
		else if (p.position < 28) p.position = 28;
		else {
			p.position = 12;
			p.money += 200;
			ui(game, 'alert', p.name + ' collected a $200 salary for passing GO.');
		}
		await land(game, true);
	}

	async function advanceToNearestRailroad(game) {
		var p = currentPlayer(game);
		await ui(game, 'updatePosition');
		if (p.position < 15) p.position = 15;
		else if (p.position < 25) p.position = 25;
		else if (p.position >= 35) {
			p.position = 5;
			p.money += 200;
			ui(game, 'alert', p.name + ' collected a $200 salary for passing GO.');
		}
		await land(game, true);
	}

	function streetRepairs(game, housePrice, hotelPrice) {
		var state = game.state;
		var cost = 0;
		for (var i = 0; i < state.square.length; i++) {
			var property = state.square[i];
			if (property.owner !== state.turn) continue;
			cost += property.hotel === 1 ? hotelPrice : property.house * housePrice;
		}
		if (!cost) return;
		var p = currentPlayer(game);
		p.pay(cost, 0);
		if (state.freeParkingTaxes) addTaxToFreeParking(game, cost);
		else ui(game, 'alert', p.name + ' lost $' + cost + ' to ' + (housePrice === 40 ? 'Community Chest' : 'Chance') + '.');
	}

	async function payFifty(game) {
		var p = currentPlayer(game);
		ui(game, 'onLeaveJail', p.color);
		game.state.doublecount = 0;
		p.jail = false;
		p.jailroll = 0;
		p.position = 10;
		p.pay(50, 0);
		ui(game, 'alert', p.name + ' paid the $50 fine to get out of jail.');
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
	}

	async function useJailCard(game) {
		var state = game.state;
		var p = currentPlayer(game);
		ui(game, 'onLeaveJail', p.color);
		p.jail = false;
		p.jailroll = 0;
		p.position = 10;
		state.doublecount = 0;
		var deck;
		if (p.communityChestJailCard) {
			p.communityChestJailCard = false;
			deck = state.communityChestCards;
		} else if (p.chanceJailCard) {
			p.chanceJailCard = false;
			deck = state.chanceCards;
		}
		if (deck) {
			deck.deck.splice(deck.index, 0, 0);
			deck.index++;
			if (deck.index >= deck.deck.length) deck.index = 0;
		}
		ui(game, 'alert', p.name + ' used a "Get Out of Jail Free" card.');
		ui(game, 'updateOwned');
		await ui(game, 'updatePosition');
	}

	async function runCard(game, deckType, cardIndex) {
		var state = game.state;
		var p = currentPlayer(game);
		var deck = deckType === 'chance' ? state.chanceCards : state.communityChestCards;
		var isHeadless = !!(game.ui && game.ui.isHeadless);
		var applyCard = function() {
			return deckType === 'chance' ? chanceAction(game, cardIndex) : communityChestAction(game, cardIndex);
		};
		if (cardIndex === 0) deck.deck.splice(deck.index, 1);
		if (isHeadless) {
			await applyCard();
		} else {
			var animation = ui(game, 'updateDrawnCard', deckType, cardIndex);
			if (p.human) {
				await animation;
				ui(game, 'showCard', deckType, deck[cardIndex].text, function() {
					applyCard();
				});
			} else {
				await Promise.all([animation, ui(game, 'delay', 500)]);
				await applyCard();
			}
		}
		deck.index++;
		if (deck.index >= deck.deck.length) deck.index = 0;
	}

	async function chanceCommunityChest(game) {
		var state = game.state;
		var p = currentPlayer(game);
		if ([2, 17, 33].indexOf(p.position) !== -1) {
			await runCard(game, 'community-chest', state.communityChestCards.deck[state.communityChestCards.index]);
		} else if ([7, 22, 36].indexOf(p.position) !== -1) {
			await runCard(game, 'chance', state.chanceCards.deck[state.chanceCards.index]);
		} else if (!p.human) {
			p.AI.alertList = '';
			if (!p.AI.onLand()) game.next();
		}
	}

	function chanceAction(game, chanceIndex) {
		var p = currentPlayer(game);
		game.state.chanceCards[chanceIndex].action(game, p);
		ui(game, 'updateOwned');
		ui(game, 'updateMoney');
		if (chanceIndex !== 15 && !p.human) p.AI.alertList = '';
		if (!p.human && [0, 1, 2, 3, 6, 8, 12].indexOf(chanceIndex) !== -1) game.next();
	}

	function communityChestAction(game, cardIndex) {
		var p = currentPlayer(game);
		game.state.communityChestCards[cardIndex].action(game, p);
		ui(game, 'updateOwned');
		ui(game, 'updateMoney');
		if (cardIndex !== 15 && !p.human) p.AI.alertList = '';
		if (!p.human && [13, 15].indexOf(cardIndex) === -1) game.next();
	}

	async function goBackThreeSpaces(game) {
		var p = currentPlayer(game);
		var boardSize = game.state.square.length;
		if (boardSize < 1) throw new RangeError('Cannot move on an empty board.');
		p.position = ((p.position - 3) % boardSize + boardSize) % boardSize;
		game.state.nextMoveDirection = -1;
		await land(game);
	}

	function rentFor(square, state, diceTotal, increasedRent) {
		var group = square.group || [];
		if (square.groupProfile && square.groupProfile.rentRule) {
			var rentRule = square.groupProfile.rentRule;
			if (rentRule.mode === 'diceMultiplier') {
				var squareIndex = state.square.indexOf(square);
				var multiplier = increasedRent || group.some(function(index) {
					return index !== squareIndex && state.square[index].owner === square.owner;
				}) ? rentRule.tiers[1] : rentRule.tiers[0];
				return diceTotal * multiplier;
			}
			if (rentRule.mode === 'fixed') {
				var ownedCount = group.filter(function(index) { return state.square[index].owner === square.owner; }).length;
				return rentRule.tiers[Math.max(0, ownedCount - 1)];
			}
		}
		var monopoly = group.length > 0 && group.every(function(index) { return state.square[index].owner === square.owner; });
		if (!monopoly) return square.baserent;
		if (square.house > 0) return square['rent' + square.house];
		return square.baserent * (square.groupProfile && square.groupProfile.rentRule
			? square.groupProfile.rentRule.monopolyMultiplier || 2
			: 2);
	}

	async function land(game, increasedRent) {
		var state = game.state;
		var p = currentPlayer(game);
		var square = state.square[p.position];
		var die1 = game.getDie(1);
		var die2 = game.getDie(2);
		var diceTotal = (die1 || 0) + (die2 || 0);
		ui(game, 'displayLanded', 'You landed on ' + square.name + '.');
		square.landcount = (square.landcount || 0) + 1;
		ui(game, 'alert', p.name + ' landed on ' + square.name + '.');

		if (square.price !== 0 && square.owner === 0) {
			if (!p.human) {
				if (p.AI.buyProperty(p.position)) game.buy();
				else if (state.auctionEnabled) state.pendingAuction = p.position;
			} else {
				ui(game, 'displayPropertyPurchase', p.position, square);
				if (state.auctionEnabled) {
					state.pendingAuction = p.position;
					ui(game, 'updateButtonState', 'Auction property', 'Send the declined property to auction and advance the turn.');
				}
			}
		}

		if (square.owner !== 0 && square.owner !== state.turn && !square.mortgage) {
			var rent = rentFor(square, state, diceTotal, !!increasedRent);
			var owner = state.player[square.owner];
			ui(game, 'alert', p.name + ' paid $' + rent + ' rent to ' + owner.name + '.');
			p.pay(rent, square.owner);
			owner.money += rent;
			ui(game, 'displayLanded', 'You landed on ' + square.name + '. ' + owner.name + ' collected $' + rent + ' rent.');
		} else if (square.owner > 0 && square.owner !== state.turn && square.mortgage) {
			ui(game, 'displayLanded', 'You landed on ' + square.name + '. Property is mortgaged; no rent was collected.');
		}

		if (typeof square.onLand === 'function') {
			await square.onLand({ game: game, state: state, player: p, square: square, squares: state.square,
				ui: game.ui, freeParkingTaxes: state.freeParkingTaxes,
				addTaxToFreeParking: function(amount) { addTaxToFreeParking(game, amount); } });
		}

		if (p.position === 30) {
			ui(game, 'updateMoney');
			await ui(game, 'updatePosition');
			if (p.human) ui(game, 'showMessage', 'Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.', function() { goToJail(game); });
			else await goToJail(game);
			return;
		}
		if (p.position === 20) collectFreeParking(game);
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
		ui(game, 'updateOwned');
		if (!p.human) p.AI.alertList = '';
		await chanceCommunityChest(game);
	}

	async function roll(game) {
		var state = game.state;
		var p = currentPlayer(game);
		ui(game, 'onRollStart');
		if (p.human) ui(game, 'focusNextButton');
		ui(game, 'updateButtonState', 'End turn', 'End turn and advance to the next player.');
		game.rollDice();
		var die1 = game.getDie(1);
		var die2 = game.getDie(2);
		state.doublecount++;
		ui(game, 'alert', p.name + ' rolled ' + (die1 + die2) + (die1 === die2 ? ' - doubles.' : '.'));
		if (die1 === die2 && !p.jail) {
			ui(game, 'updateDice', die1, die2);
			if (state.doublecount < 3) ui(game, 'updateButtonState', 'Roll again', 'You threw doubles. Roll again.');
			else {
				p.jail = true;
				state.doublecount = 0;
				ui(game, 'alert', p.name + ' rolled doubles three times in a row.');
				ui(game, 'updateMoney');
				if (p.human) ui(game, 'popup', 'You rolled doubles three times in a row. Go to jail.', function() { goToJail(game); });
				else await goToJail(game);
				return;
			}
		} else {
			ui(game, 'updateButtonState', 'End turn', 'End turn and advance to the next player.');
			state.doublecount = 0;
		}
		await ui(game, 'updatePosition');
		ui(game, 'updateMoney');
		ui(game, 'updateOwned');
		if (p.jail) {
			p.jailroll++;
			ui(game, 'updateDice', die1, die2);
			if (die1 === die2) {
				ui(game, 'onLeaveJail', p.color);
				p.jail = false;
				p.jailroll = 0;
				p.position = 10 + die1 + die2;
				state.doublecount = 0;
				ui(game, 'alert', p.name + ' rolled doubles to get out of jail.');
				await land(game);
			} else if (p.jailroll === 3) {
				if (p.human) {
					ui(game, 'showMessage', 'You must pay the $50 fine.', async function() {
						await payFifty(game);
						p.position = 10 + die1 + die2;
						await land(game);
					});
				} else {
					await payFifty(game);
					p.position = 10 + die1 + die2;
					await land(game);
				}
			} else {
				ui(game, 'displayLanded', 'You are in jail.');
				if (!p.human) {
					p.AI.alertList = '';
					game.next();
				}
			}
		} else {
			ui(game, 'updateDice', die1, die2);
			p.position += die1 + die2;
			if (p.position >= state.square.length) {
				p.position -= state.square.length;
				p.money += 200;
				ui(game, 'alert', p.name + ' collected a $200 salary for passing GO.');
			}
			await land(game);
		}
	}

	async function play(game) {
		var state = game.state;
		if (game.isOver) {
			if (typeof game.onGameCompleted === 'function') game.onGameCompleted();
			return;
		}
		game.turnCount = (game.turnCount || 0) + 1;
		if (game.maxTurns && game.turnCount > game.maxTurns) {
			game.isOver = true;
			if (typeof game.onGameCompleted === 'function') game.onGameCompleted();
			return;
		}
		if (game.auction()) return;
		state.turn++;
		if (state.turn > state.pcount) state.turn -= state.pcount;
		var p = currentPlayer(game);
		game.resetDice();
		if (game.ui && typeof game.ui.updateTurnDisplay === 'function') game.ui.updateTurnDisplay(p);
		ui(game, 'alert', 'It is ' + p.name + "'s turn.");
		p.pay(0, p.creditor);
		ui(game, 'onTurnStart', state.turn);
		state.doublecount = 0;
		ui(game, 'updateButtonState', 'Roll Dice', 'Roll the dice and move your token accordingly.');
		ui(game, 'setDiceVisible', false);
		if (p.jail) {
			ui(game, 'displayJailOptions', p.communityChestJailCard || p.chanceJailCard, p.jailroll === 2);
			ui(game, 'updateButtonState', undefined, 'Roll the dice. If you throw doubles, you will get out of jail.');
			if (p.jailroll === 0) ui(game, 'alert', 'This is ' + p.name + "'s first turn in jail.");
			else if (p.jailroll === 1) ui(game, 'alert', 'This is ' + p.name + "'s second turn in jail.");
			else if (p.jailroll === 2) ui(game, 'alert', 'This is ' + p.name + "'s third turn in jail.");
			if (!p.human && p.AI.postBail()) {
				if (p.communityChestJailCard || p.chanceJailCard) await useJailCard(game);
				else await payFifty(game);
			}
		}
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
		ui(game, 'updateOwned');
		if (!p.human && !p.AI.beforeTurn()) game.next();
	}

	var TurnFlow = {
		play: function(game) { return play(game); },
		roll: function(game) { return roll(game); },
		land: function(game, increasedRent) { return land(game, increasedRent); },
		chanceCommunityChest: function(game) { return chanceCommunityChest(game); },
		chanceAction: function(game, index) { return chanceAction(game, index); },
		communityChestAction: function(game, index) { return communityChestAction(game, index); },
		addamount: function(game, amount, cause) { return addAmount(game, amount, cause); },
		addTaxToFreeParking: function(game, amount) { return addTaxToFreeParking(game, amount); },
		collectFreeParking: function(game) { return collectFreeParking(game); },
		subtractamount: function(game, amount, cause) { return subtractAmount(game, amount, cause); },
		streetrepairs: function(game, houses, hotels) { return streetRepairs(game, houses, hotels); },
		gotojail: function(game) { return goToJail(game); },
		gobackthreespaces: function(game) { return goBackThreeSpaces(game); },
		payeachplayer: function(game, amount, cause) { return payEachPlayer(game, amount, cause); },
		collectfromeachplayer: function(game, amount, cause) { return collectFromEachPlayer(game, amount, cause); },
		advance: function(game, destination, pass) { return advance(game, destination, pass); },
		advanceToNearestUtility: function(game) { return advanceToNearestUtility(game); },
		advanceToNearestRailroad: function(game) { return advanceToNearestRailroad(game); },
		payfifty: function(game) { return payFifty(game); },
		useJailCard: function(game) { return useJailCard(game); }
	};

	if (typeof Game !== 'undefined') {
		Game.prototype.play = function() { return play(this); };
		Game.prototype.roll = function() { return roll(this); };
		Game.prototype.land = function(increasedRent) { return land(this, increasedRent); };
		Game.prototype.advance = function(destination, pass) { return advance(this, destination, pass); };
		Game.prototype.advanceToNearestUtility = function() { return advanceToNearestUtility(this); };
		Game.prototype.advanceToNearestRailroad = function() { return advanceToNearestRailroad(this); };
		Game.prototype.goBackThreeSpaces = function() { return goBackThreeSpaces(this); };
		Game.prototype.goToJail = function() { return goToJail(this); };
		Game.prototype.payFifty = function() { return payFifty(this); };
		Game.prototype.useJailCard = function() { return useJailCard(this); };
		Game.prototype.chanceAction = function(index) { return chanceAction(this, index); };
		Game.prototype.communityChestAction = function(index) { return communityChestAction(this, index); };
		Game.prototype.addAmount = function(amount, cause) { return addAmount(this, amount, cause); };
		Game.prototype.addTaxToFreeParking = function(amount) { return addTaxToFreeParking(this, amount); };
		Game.prototype.collectFreeParking = function() { return collectFreeParking(this); };
		Game.prototype.subtractAmount = function(amount, cause) { return subtractAmount(this, amount, cause); };
		Game.prototype.streetRepairs = function(houses, hotels) { return streetRepairs(this, houses, hotels); };
		Game.prototype.payEachPlayer = function(amount, cause) { return payEachPlayer(this, amount, cause); };
		Game.prototype.collectFromEachPlayer = function(amount, cause) { return collectFromEachPlayer(this, amount, cause); };
	}

	global.TurnFlow = TurnFlow;
	if (typeof module !== 'undefined' && module.exports) module.exports = TurnFlow;
})(typeof window !== 'undefined' ? window : globalThis);
