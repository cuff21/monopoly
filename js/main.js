// Bootstrapping: builds the board DOM, wires global event handlers, and starts on window load.

function sleep(ms) {
	if (typeof game !== 'undefined' && game && game.ui && game.ui.isHeadless) {
		return Promise.resolve();
	}
	return new Promise(resolve => setTimeout(resolve, ms));
}

function bindBrowserGameState(gameInstance) {
	var renderDeed = window.showdeed._renderStructuredDeed || window.showdeed;
	var showDeedForGame = function(squareId) { return renderDeed(squareId, gameInstance); };
	showDeedForGame._renderStructuredDeed = renderDeed;
	window.showdeed = showDeedForGame;
	var stateKeys = [
		'player', 'cardDecks', 'playersGame', 'pcount',
		'auctionEnabled', 'pendingAuction', 'freeParkingTaxes', 'freeParkingPot', 'turn',
		'doublecount', 'lastGamePlayerCount'
	];
	stateKeys.forEach(function(key) {
		Object.defineProperty(window, key, {
			configurable: true,
			enumerable: true,
			get: function() { return gameInstance.state[key]; },
			set: function(value) { gameInstance.state[key] = value; }
		});
	});
	window.buy = function(squareId) { if (typeof squareId !== 'string') throw new TypeError('Buying requires a square ID.'); return gameInstance.submitPlayerAction({ type: 'buy', squareId: squareId }); };
	window.mortgage = function(squareId) { return gameInstance.submitPlayerAction({ type: 'mortgage', squareId: squareId }); };
	window.unmortgage = function(squareId) { return gameInstance.submitPlayerAction({ type: 'unmortgage', squareId: squareId }); };
	window.buyHouse = function(squareId) { return gameInstance.submitPlayerAction({ type: 'buyHouse', squareId: squareId }); };
	window.sellHouse = function(squareId) { return gameInstance.submitPlayerAction({ type: 'sellHouse', squareId: squareId }); };
	window.canSellHouse = function(squareId) { return gameInstance.canSellHouse(squareId); };
	window.getHouseHotelSupply = function() { return gameInstance.getHouseHotelSupply(); };
}

function onloadBehavior() {
	if (typeof game !== 'undefined' && game && game.ui.boardView) game.ui.boardView.dispose();
	GameSetupService.configure({
		aiRegistry: AISetupRegistry,
		gen6Trainer: Gen6Trainer,
		createWorkerPool: Gen6Trainer.createBrowserWorkerPool
	});
	var edition = Monopoly.Editions.getActive();
	var editionId = Monopoly.Editions.getActiveName();
	var editionSetup = Monopoly.Editions.buildGameSetup(editionId);
	var structuredBoard = editionSetup.board;
	var initialState = GameStateContext.createState({
		player: [],
		editionId: editionId,
		cardDecks: editionSetup.cardDecks,
		playersGame: [],
		pcount: 2,
		auctionEnabled: true,
		pendingAuction: -1,
		freeParkingTaxes: true,
		freeParkingPot: 0,
		turn: 0,
		doublecount: 0,
		lastGamePlayerCount: 2
	});
	GameStateContext.initializeBoardState(initialState, structuredBoard, editionId);
	initialState.seed = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
	initialState.random = (function(seed) { var value = seed >>> 0; return function() { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; })(initialState.seed);
	game = new Game(undefined, initialState);
	game.ui.boardView = new BoardView(game).mount();
	bindBrowserGameState(game);
	resetTokenOverlays(game);

	for (var i = 0; i <= 8; i++) {
		player[i] = new Player("", "", game);
		player[i].index = i;
		if (i > 0) GameStateContext.assignPlayerId(player[i], i);
	}

	AITest3.count = 0;

	player[1].human = true;
	player[0].name = "the bank";

	Object.keys(initialState.cardDecks).forEach(function(deckId) {
		var order = initialState.cardDecks[deckId].order;
		for (var i = order.length - 1; i > 0; i--) {
			var j = Math.floor(initialState.random() * (i + 1)), swap = order[i]; order[i] = order[j]; order[j] = swap;
		}
	});

	createPlayerInputs();
	playernumber_onchange();

	DOMUI.listen("#nextbutton", 'click', game.next);
	DOMUI.setVisible("#noscript", false);
	DOMUI.setVisible("#setup, #noF5", true);

	updateFreeParkingDisplay(game);
	var drag, dragX, dragY, dragObj, dragTop, dragLeft;

	DOMUI.listen("body", 'mousemove', function(e) {
		var object;

		if (e.target) {
			object = e.target;
		} else if (window.event && window.event.srcElement) {
			object = window.event.srcElement;
		}


		if (object.classList.contains("propertycellcolor") || object.classList.contains("statscellcolor")) {
			if (e.clientY + 20 > window.innerHeight - 279) {
				document.getElementById("deed").style.top = (window.innerHeight - 279) + "px";
			} else {
				document.getElementById("deed").style.top = (e.clientY + 20) + "px";
			}
			document.getElementById("deed").style.left = (e.clientX + 10) + "px";


		} else if (drag) {
			if (e) {
				dragObj.style.left = (dragLeft + e.clientX - dragX) + "px";
				dragObj.style.top = (dragTop + e.clientY - dragY) + "px";

			} else if (window.event) {
				dragObj.style.left = (dragLeft + window.event.clientX - dragX) + "px";
				dragObj.style.top = (dragTop + window.event.clientY - dragY) + "px";
			}
		}
	});


	DOMUI.listen("body", 'mouseup', function() {

		drag = false;
	});
	document.getElementById("statsdrag").onmousedown = function(e) {
		dragObj = document.getElementById("stats");
		dragObj.style.position = "relative";

		dragTop = parseInt(dragObj.style.top, 10) || 0;
		dragLeft = parseInt(dragObj.style.left, 10) || 0;

		if (window.event) {
			dragX = window.event.clientX;
			dragY = window.event.clientY;
		} else if (e) {
			dragX = e.clientX;
			dragY = e.clientY;
		}

		drag = true;
	};

	document.getElementById("popupdrag").onmousedown = function(e) {
		dragObj = document.getElementById("popup");
		dragObj.style.position = "relative";

		dragTop = parseInt(dragObj.style.top, 10) || 0;
		dragLeft = parseInt(dragObj.style.left, 10) || 0;

		if (window.event) {
			dragX = window.event.clientX;
			dragY = window.event.clientY;
		} else if (e) {
			dragX = e.clientX;
			dragY = e.clientY;
		}

		drag = true;
	};

	DOMUI.listen("#mortgagebutton", 'click', function() {
		var checkedProperty = getCheckedProperty();
		var s = game.state.board.squaresById[checkedProperty];
		var propertyState = GameStateContext.getSquareState(game.state, checkedProperty);
		var ownerId = GameStateContext.getSquareState(game.state, checkedProperty).ownerId;
		var propertyOwner = GameStateContext.getPlayerById(game.state, ownerId);

		if (propertyState.mortgage) {
			if (propertyOwner.money < Math.round(s.rules.purchasePrice * 0.55)) {
				game.ui.showMessage("You need $" + (Math.round(s.rules.purchasePrice * 0.55) - propertyOwner.money) + " more to unmortgage " + s.presentation.label + ".");

			} else {
				game.ui.confirm(propertyOwner.name + ", are you sure you want to unmortgage " + s.presentation.label + " for $" + Math.round(s.rules.purchasePrice * 0.55) + "?", function() {
					unmortgage(checkedProperty);
				}, "Yes/No");
			}
		} else {
			game.ui.confirm(propertyOwner.name + ", are you sure you want to mortgage " + s.presentation.label + " for $" + Math.round(s.rules.purchasePrice * 0.5) + "?", function() {
				mortgage(checkedProperty);
			}, "Yes/No");
		}

	});

	DOMUI.listen("#buyhousebutton", 'click', function() {
		var checkedProperty = getCheckedProperty();
		var s = game.state.board.squaresById[checkedProperty];
		var squareState = GameStateContext.getSquareState(game.state, checkedProperty);
		var p = GameStateContext.getPlayerById(game.state, GameStateContext.getSquareState(game.state, checkedProperty).ownerId);

		if (p.money < s.rules.houseCost) {
			if (squareState.house === 4) {
				game.ui.popup("<p>You need $" + (s.rules.houseCost - p.money) + " more to buy a hotel for " + s.presentation.label + ".</p>");
				return;
			} else {
				game.ui.popup("<p>You need $" + (s.rules.houseCost - p.money) + " more to buy a house for " + s.presentation.label + ".</p>");
				return;
			}
		}

		var supply = getHouseHotelSupply();

		if (squareState.house < 4 && supply.housesAvailable <= 0) {
			game.ui.popup("<p>All 32 houses are owned. You must wait until one becomes available.</p>");
			return;
		} else if (squareState.house === 4 && supply.hotelsAvailable <= 0) {
			game.ui.popup("<p>All 12 hotels are owned. You must wait until one becomes available.</p>");
			return;
		}

		buyHouse(checkedProperty);

	});


	DOMUI.listen("#sellhousebutton", 'click', function() { sellHouse(getCheckedProperty()); });

	DOMUI.listen("#viewstats", 'click', function() { showStats(game); });
	DOMUI.listen("#statsclose, #statsbackground", 'click', function() {
		DOMUI.setVisible("#statswrap", false);
		DOMUI.fade('#statsbackground', false, 400);
	});

	DOMUI.listen("#buy-menu-item", 'click', function() {
		DOMUI.setVisible("#buy", true);
		DOMUI.setVisible("#manage", false);

		// Scroll alerts to bottom.
		DOMUI.scrollToBottom('#alert', false);
	});


	DOMUI.listen("#manage-menu-item", 'click', function() {
		DOMUI.setVisible("#manage", true);
		DOMUI.setVisible("#buy", false);
	});


	DOMUI.listen("#trade-menu-item", 'click', function() { game.ui.editTrade(); });


};

window.onload = onloadBehavior;

function STOP() {
    turn = -1;
}
