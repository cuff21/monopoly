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

	function cardContext(game, player) {
		var state = game.state;
		return {
			game: game,
			state: state,
			playerId: player.playerId,
			squareId: player.squareId,
			ui: game.ui
		};
	}

	function move(game, steps) {
		var player = currentPlayer(game), board = game.state.board;
		var destinationId = global.walk(board, player.squareId, steps);
		var traversedIds = [], cursor = player.squareId, count = Math.abs(steps), forward = steps >= 0;
		for (var i = 0; i < count; i++) {
			cursor = global.getSquare(board, cursor)[forward ? 'nextId' : 'previousId'];
			traversedIds.push(cursor);
		}
		var crossedStart = forward && traversedIds.indexOf(board.startSquareId) !== -1;
		player.squareId = destinationId;
		if (crossedStart) player.money += board.rules.startSalary;
		return { destinationId: destinationId, traversedIds: traversedIds, crossedStart: crossedStart };
	}

	function advanceToSquare(game, destinationId, salaryPolicy, increasedRent) {
		var state = game.state;
		var player = currentPlayer(game);
		global.getSquare(state.board, destinationId);
		if (salaryPolicy !== 'always' && salaryPolicy !== 'onCrossing' && salaryPolicy !== 'never') {
			throw new RangeError('Unknown card salary policy: ' + salaryPolicy);
		}
		var path = [], cursor = player.squareId;
		while (cursor !== destinationId && path.length <= Object.keys(state.board.squaresById).length) {
			cursor = global.getSquare(state.board, cursor).nextId; path.push(cursor);
		}
		if (cursor !== destinationId) throw new RangeError('Destination is not reachable from current square.');
		var crossed = path.indexOf(state.board.startSquareId) !== -1;
		player.squareId = destinationId;
		if (salaryPolicy === 'always' || (salaryPolicy === 'onCrossing' && crossed)) {
			player.money += state.board.rules.startSalary;
			ui(game, 'alert', player.name + ' collected a $' + state.board.rules.startSalary + ' salary for passing GO.');
		}
		state.nextMoveDirection = 1;
		return land(game, increasedRent);
	}

	async function advanceToGroupNearest(game, groupId) {
		var state = game.state;
		var player = currentPlayer(game);
		var members = global.getGroupSquareIds(state.board, groupId);
		var destinationId = global.findNext(state.board, player.squareId, function(square) { return members.indexOf(square.id) !== -1; });
		if (!destinationId) throw new RangeError('No square in group ' + groupId + ' exists ahead on the Game Board.');
		var destinationKind = global.getSquare(state.board, destinationId).kind;
		if (destinationKind === 'railroad') await ui(game, 'updatePosition');
		return advanceToSquare(game, destinationId, 'onCrossing', destinationKind === 'railroad' || destinationKind === 'utility');
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
		var board = game.state.board;
		var jailSquareId = Object.keys(board.squaresById).filter(function(squareId) {
			return global.getSquare(board, squareId).kind === 'jail';
		})[0];
		if (!jailSquareId) throw new RangeError('Game Board has no Jail square.');
		p.squareId = jailSquareId;
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

	async function advance(game, destinationId, collectSalary) {
		return advanceToSquare(game, destinationId, collectSalary ? 'onCrossing' : 'never');
	}

	function streetRepairs(game, housePrice, hotelPrice, cause) {
		var state = game.state;
		var p = currentPlayer(game);
		var cost = 0;
		Object.keys(state.squareStateById).forEach(function(squareId) {
			var property = state.squareStateById[squareId];
			if (property.ownerId !== p.playerId) return;
			cost += property.hotel ? hotelPrice : property.house * housePrice;
		});
		if (!cost) return;
		p.pay(cost, 0);
		if (state.freeParkingTaxes) addTaxToFreeParking(game, cost);
		else ui(game, 'alert', p.name + ' lost $' + cost + ' to ' + (cause || 'a card') + '.');
	}

	async function payBail(game) {
		var p = currentPlayer(game);
		var amount = game.state.board.rules.bailAmount;
		ui(game, 'onLeaveJail', p.color);
		game.state.doublecount = 0;
		p.jail = false;
		p.jailroll = 0;
		p.pay(amount, 0);
		ui(game, 'alert', p.name + ' paid the $' + amount + ' fine to get out of jail.');
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
	}

	async function moveRelative(game, steps) {
		var movement = move(game, steps);
		game.state.nextMoveDirection = steps < 0 ? -1 : 1;
		await land(game);
		return movement;
	}

	async function useJailCard(game, cardId) {
		var state = game.state;
		var p = currentPlayer(game);
		var heldIndex = cardId ? p.heldCards.indexOf(cardId) : 0;
		if (heldIndex < 0 || !p.heldCards.length) throw new RangeError('Player does not hold that card.');
		cardId = p.heldCards[heldIndex];
		var identity = global.GameStateContext.parseCardId(cardId);
		var deck = Object.prototype.hasOwnProperty.call(state.cardDecks, identity.deckId) ? state.cardDecks[identity.deckId] : null;
		if (!deck || !deck.cards[identity.cardIndex] || !deck.cards[identity.cardIndex].keepable || !Array.isArray(deck.order) || deck.order.indexOf(identity.cardIndex) !== -1) throw new RangeError('Held jail card does not identify an available card in a Game deck.');
		ui(game, 'onLeaveJail', p.color);
		p.jail = false;
		p.jailroll = 0;
		state.doublecount = 0;
		p.heldCards.splice(heldIndex, 1);
		global.GameStateContext.returnHeldCard(state, cardId);
		ui(game, 'alert', p.name + ' used a "Get Out of Jail Free" card.');
		ui(game, 'updateOwned');
		await ui(game, 'updatePosition');
	}

	async function runCard(game, deckId, cardIndex) {
		var state = game.state;
		var p = currentPlayer(game);
		var deck = state.cardDecks[deckId];
		var card = deck.cards[cardIndex];
		var isHeadless = !!(game.ui && game.ui.isHeadless);
		var applyCard = function() {
			return cardAction(game, deckId, cardIndex);
		};
		if (card.keepable) deck.order.splice(deck.index, 1);
		if (isHeadless) {
			await applyCard();
		} else {
			var animation = ui(game, 'updateDrawnCard', deckId, cardIndex);
			if (p.human) {
				await animation;
				ui(game, 'showCard', deckId, card.text, function() {
					applyCard();
				});
			} else {
				await Promise.all([animation, ui(game, 'delay', 500)]);
				await applyCard();
			}
		}
		if (deck.order.length) {
			if (!card.keepable) deck.index++;
			if (deck.index >= deck.order.length) deck.index = 0;
		} else deck.index = 0;
	}

	async function drawCardAtSquare(game) {
		var state = game.state;
		var p = currentPlayer(game);
		var square = global.getSquare(state.board, p.squareId);
		if (square.kind === 'card' && Object.prototype.hasOwnProperty.call(state.cardDecks, square.deckId) && state.cardDecks[square.deckId].order.length) {
			var deck = state.cardDecks[square.deckId];
			await runCard(game, square.deckId, deck.order[deck.index]);
		} else if (!p.human) {
			p.AI.alertList = '';
			if (!p.AI.onLand()) game.next();
		}
	}

	async function cardAction(game, deckId, cardIndex) {
		var p = currentPlayer(game);
		if (!Object.prototype.hasOwnProperty.call(game.state.cardDecks, deckId)) throw new RangeError('Unknown card deck: ' + deckId);
		var card = game.state.cardDecks[deckId].cards[cardIndex];
		var context = cardContext(game, p);
		context.deckId = deckId;
		context.cardIndex = cardIndex;
		context.cardId = global.GameStateContext.encodeCardId(deckId, cardIndex);
		await card.action(context);
		ui(game, 'updateOwned');
		ui(game, 'updateMoney');
		if (!p.human) {
			if (!card.endsTurn) p.AI.alertList = '';
			else game.next();
		}
	}

	function rentFor(squareId, state, diceTotal, increasedRent) {
		var square = global.getSquare(state.board, squareId), s = global.GameStateContext.getSquareState(state, squareId);
		var members = square.groupId ? global.getGroupSquareIds(state.board, square.groupId) : [];
		var owned = members.filter(function(id) { return state.squareStateById[id].ownerId === s.ownerId; }).length;
		if (square.kind === 'railroad') return square.rules.rentTiers[Math.max(0, Math.min(4, owned - 1))] * (increasedRent ? 2 : 1);
		if (square.kind === 'utility') return diceTotal * (increasedRent ? square.rules.rentTiers[1] : square.rules.rentTiers[Math.max(0, Math.min(4, owned - 1))]);
		if (s.house || s.hotel) return square.rules.rentTiers[s.hotel ? 4 : s.house - 1];
		var monopoly = members.length > 0 && owned === members.length;
		return square.rules.baseRent * (monopoly ? global.getGroup(state.board, square.groupId).rules.monopolyMultiplier : 1);
	}

	async function land(game, increasedRent) {
		var state = game.state;
		var p = currentPlayer(game);
		var squareId = p.squareId;
		var boardSquare = global.getSquare(state.board, squareId);
		var square = boardSquare.presentation;
		var squareState = global.GameStateContext.getSquareState(state, squareId);
		var rules = boardSquare.rules;
		var die1 = game.getDie(1);
		var die2 = game.getDie(2);
		var diceTotal = (die1 || 0) + (die2 || 0);
		ui(game, 'displayLanded', 'You landed on ' + square.label + '.');
		squareState.landcount++;
		ui(game, 'alert', p.name + ' landed on ' + square.label + '.');

		if (rules.purchasePrice > 0 && squareState.ownerId === null) {
			if (!p.human) {
				if (p.AI.buyProperty(squareId)) game.buy(squareId);
				else if (state.auctionEnabled) state.pendingAuction = squareId;
			} else {
				ui(game, 'displayPropertyPurchase', squareId, boardSquare);
				if (state.auctionEnabled) {
					state.pendingAuction = squareId;
					ui(game, 'updateButtonState', 'Auction property', 'Send the declined property to auction and advance the turn.');
				}
			}
		}

		if (squareState.ownerId !== null && squareState.ownerId !== p.playerId && !squareState.mortgage) {
			var rent = rentFor(squareId, state, diceTotal, !!increasedRent);
			var owner = global.GameStateContext.getPlayerById(state, squareState.ownerId);
			ui(game, 'alert', p.name + ' paid $' + rent + ' rent to ' + owner.name + '.');
			p.pay(rent, owner.playerId);
			owner.money += rent;
			ui(game, 'displayLanded', 'You landed on ' + square.label + '. ' + owner.name + ' collected $' + rent + ' rent.');
		} else if (squareState.ownerId !== null && squareState.ownerId !== p.playerId && squareState.mortgage) {
			ui(game, 'displayLanded', 'You landed on ' + square.label + '. Property is mortgaged; no rent was collected.');
		}

		if (state.board) {
			if (boardSquare.behavior && typeof boardSquare.behavior.onLand === 'function') {
				await boardSquare.behavior.onLand({ game: game, state: state, playerId: p.playerId, squareId: squareId, ui: game.ui });
			}
		}

		if (boardSquare.kind === 'go-to-jail') {
			ui(game, 'updateMoney');
			await ui(game, 'updatePosition');
			if (p.human) ui(game, 'showMessage', 'Go to jail. Go directly to Jail. Do not pass GO. Do not collect $200.', function() { goToJail(game); });
			else await goToJail(game);
			return;
		}
		if (boardSquare.kind === 'free-parking') collectFreeParking(game);
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
		ui(game, 'updateOwned');
		if (!p.human) p.AI.alertList = '';
		await drawCardAtSquare(game);
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
				move(game, die1 + die2);
				state.doublecount = 0;
				ui(game, 'alert', p.name + ' rolled doubles to get out of jail.');
				await land(game);
			} else if (p.jailroll === 3) {
				if (p.human) {
					ui(game, 'showMessage', 'You must pay the $50 fine.', async function() {
						await payBail(game);
						move(game, die1 + die2);
						await land(game);
					});
				} else {
					await payBail(game);
					move(game, die1 + die2);
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
			var movement = move(game, die1 + die2);
			if (movement.crossedStart) {
				ui(game, 'alert', p.name + ' collected a $' + state.board.rules.startSalary + ' salary for passing GO.');
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
		ui(game, 'displayJailOptions', p.heldCards.length > 0, p.jailroll === 2);
			ui(game, 'updateButtonState', undefined, 'Roll the dice. If you throw doubles, you will get out of jail.');
			if (p.jailroll === 0) ui(game, 'alert', 'This is ' + p.name + "'s first turn in jail.");
			else if (p.jailroll === 1) ui(game, 'alert', 'This is ' + p.name + "'s second turn in jail.");
			else if (p.jailroll === 2) ui(game, 'alert', 'This is ' + p.name + "'s third turn in jail.");
			if (!p.human && p.AI.postBail()) {
				if (p.heldCards.length) await useJailCard(game);
				else await payBail(game);
			}
		}
		ui(game, 'updateMoney');
		await ui(game, 'updatePosition');
		ui(game, 'updateOwned');
		if (!p.human && !p.AI.beforeTurn()) game.next();
	}

	var methods = {
		play: play, roll: roll, land: land, drawCardAtSquare: drawCardAtSquare,
		cardAction: cardAction, addAmount: addAmount, addTaxToFreeParking: addTaxToFreeParking,
		collectFreeParking: collectFreeParking, subtractAmount: subtractAmount,
		streetRepairs: streetRepairs, goToJail: goToJail, moveRelative: moveRelative,
		move: move, payEachPlayer: payEachPlayer, collectFromEachPlayer: collectFromEachPlayer,
		advance: advance, advanceToSquare: advanceToSquare,
		advanceToGroupNearest: advanceToGroupNearest, payBail: payBail, useJailCard: useJailCard
	};
	var TurnFlow = {};
	Object.keys(methods).forEach(function(name) {
		TurnFlow[name] = function(game) {
			return methods[name].apply(null, [game].concat(Array.prototype.slice.call(arguments, 1)));
		};
		if (typeof Game !== 'undefined') {
			Game.prototype[name] = function() {
				return methods[name].apply(null, [this].concat(Array.prototype.slice.call(arguments)));
			};
		}
	});

	global.TurnFlow = TurnFlow;
	if (typeof module !== 'undefined' && module.exports) module.exports = TurnFlow;
})(typeof window !== 'undefined' ? window : globalThis);
