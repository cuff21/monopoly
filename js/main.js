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
		'doublecount', 'lastGamePlayerCount', 'lastKnownSquareByPlayerId', 'lastKnownJailByPlayerId',
		'playerOverlays', 'nextMoveDirection'
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

function getBoardTraversal(board) {
	var ids = [], currentId = board.startSquareId;
	for (var i = 0; i < Object.keys(board.squaresById).length; i++) {
		ids.push(currentId);
		currentId = board.squaresById[currentId].nextId;
	}
	return ids;
}

function createBoardSurface(board) {
	var oldBoard = document.getElementById('board');
	if (!oldBoard) return;
	var surface = document.createElement('div');
	surface.id = 'board';
	surface.style.cssText = 'position:relative;width:min(90vw,900px);height:min(90vw,900px);min-width:600px;min-height:600px;border:2px solid #222;background:#eee;box-sizing:border-box;';
	var ids = getBoardTraversal(board);
	ids.forEach(function(id, index) {
		var square = board.squaresById[id];
		var cell = document.createElement('div');
		cell.id = 'square-' + id;
		cell.className = 'cell board-dynamic-cell';
		cell.dataset.squareId = id;
		if (square.groupId) cell.dataset.groupId = square.groupId;
		cell.style.cssText = 'position:absolute;left:' + square.presentation.x + '%;top:' + square.presentation.y + '%;width:7%;height:7%;transform:translate(-50%,-50%) rotate(' + (square.presentation.rotationDegrees || 0) + 'deg);background:' + (square.presentation.color || '#fff') + ';border:1px solid #222;box-sizing:border-box;';
		surface.appendChild(cell);
	});
	var center = document.createElement('div');
	center.className = 'board-dynamic-center';
	center.style.cssText = 'position:absolute;left:50%;top:50%;width:70%;height:70%;transform:translate(-50%,-50%);display:flex;align-items:center;justify-content:center;';
	center.innerHTML = '<div id="drawn-cards" aria-label="Card decks"></div><div id="jail"><div id="jailpositionholder"></div></div>';
	surface.appendChild(center);
	oldBoard.parentNode.replaceChild(surface, oldBoard);
}

function onloadBehavior() {
	if (typeof game !== 'undefined' && game) resetTokenOverlays(game);
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
		lastGamePlayerCount: 2,
		lastKnownSquareByPlayerId: Object.create(null),
		lastKnownJailByPlayerId: Object.create(null),
		playerOverlays: Object.create(null),
		nextMoveDirection: 1
	});
	GameStateContext.initializeBoardState(initialState, structuredBoard, editionId);
	initialState.seed = (window.crypto && window.crypto.getRandomValues) ? window.crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
	initialState.random = (function(seed) { var value = seed >>> 0; return function() { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; })(initialState.seed);
	game = new Game(undefined, initialState);
	createBoardSurface(structuredBoard);
	bindBrowserGameState(game);
	resetTokenOverlays(game);
	var drawnCards = document.getElementById('drawn-cards');
	if (drawnCards) {
		drawnCards.innerHTML = '';
		Object.keys(cardDecks).forEach(function(deckId) {
			var deck = cardDecks[deckId];
			var group = document.createElement('div');
			group.className = 'drawn-card-group';
			group.id = 'card-deck-' + deckId;
			var stack = document.createElement('div');
			stack.className = 'drawn-card-stack';
			stack.setAttribute('aria-hidden', 'true');
			var icon = document.createElement('img');
			icon.src = deck.icon;
			icon.alt = '';
			stack.appendChild(icon);
			var card = document.createElement('div');
			card.className = 'drawn-card';
			var title = document.createElement('div');
			title.className = 'drawn-card-title';
			title.textContent = deck.label;
			var text = document.createElement('div');
			text.className = 'drawn-card-text';
			text.id = 'card-deck-' + deckId + '-text';
			text.textContent = 'No card drawn yet.';
			card.appendChild(title);
			card.appendChild(text);
			group.appendChild(stack);
			group.appendChild(card);
			drawnCards.appendChild(group);
		});
	}

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

	$("#nextbutton").off("click").on("click", game.next);
	$("#noscript").hide();
	$("#setup, #noF5").show();

	$('#enlargeWrap').remove();
	var enlargeWrap = document.body.appendChild(document.createElement("div"));

	enlargeWrap.id = "enlarge-wrap";

	var HTML = "";
	var boardOrderIds = getSquareIds(structuredBoard);
	var boardSquareCount = boardOrderIds.length;
	for (var i = 0; i < boardSquareCount; i++) {
		var squareId = boardOrderIds[i];
		HTML += "<div id='deed-" + squareId + "' class='enlarge' data-square-id='" + squareId + "'>";
		HTML += "<div id='deed-" + squareId + "-color' class='enlarge-color'></div><br /><div id='deed-" + squareId + "-name' class='enlarge-name'></div>";
		HTML += "<br /><div id='deed-" + squareId + "-price' class='enlarge-price'></div>";
		HTML += "<br /><div id='deed-" + squareId + "-token' class='enlarge-token'></div></div>";
	}

	enlargeWrap.innerHTML = HTML;

	var currentCell;
	var currentCellAnchor;
	var currentCellPositionHolder;
	var currentCellName;
	var currentCellOwner;

	for (var i = 0; i < boardSquareCount; i++) {
		var squareId = boardOrderIds[i];
		var s = structuredBoard.squaresById[squareId];
		var displayName = s.presentation.boardName || s.presentation.label;
		var displayColor = s.presentation.color;
		var priceText = s.presentation.priceText || '';

		currentCell = document.getElementById("square-" + squareId);
		currentCell.innerHTML = "";

		currentCellAnchor = currentCell.appendChild(document.createElement("div"));
		currentCellAnchor.id = "square-" + squareId + "-anchor";
		currentCellAnchor.className = "cell-anchor";

		currentCellPositionHolder = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellPositionHolder.id = "square-" + squareId + "-tokens";
		currentCellPositionHolder.className = "cell-position-holder";
		currentCellPositionHolder.enlargeId = "deed-" + squareId;

		if (squareId === 'free-parking') {
			var currentCellPot = currentCellAnchor.appendChild(document.createElement("div"));
			currentCellPot.id = "freeparkingpot";
			currentCellPot.className = "free-parking-pot";
		}

		currentCellName = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellName.id = "square-" + squareId + "-name";
		currentCellName.className = "cell-name";
		currentCellName.textContent = displayName;

		if (s.groupId) {
			currentCellOwner = currentCellAnchor.appendChild(document.createElement("div"));
			currentCellOwner.id = "square-" + squareId + "-owner";
			currentCellOwner.className = "cell-owner";
			currentCellOwner.setAttribute('data-square-owner', '');
		}

		document.getElementById("deed-" + squareId + "-color").style.backgroundColor = displayColor;
		document.getElementById("deed-" + squareId + "-name").textContent = displayName;
		document.getElementById("deed-" + squareId + "-price").textContent = priceText;

		if (s.kind === 'railroad' || s.kind === 'utility') {
			document.getElementById("deed-" + squareId).classList.add("enlarge-icon");
		}
	}
	updateFreeParkingDisplay(game);


	// Add images to enlarges.
	document.getElementById("deed-go-token").innerHTML += '<img src="images/arrow_icon.png" height="40" width="136" alt="" />';
	if (structuredBoard.squaresById['free-parking']) document.getElementById("deed-free-parking-price").innerHTML += "<img src='images/free_parking_icon.png' height='80' width='72' alt='' style='position: relative; top: -20px;' />";
	var taxSquareId = boardOrderIds.find(function(id) { return id === 'luxury-tax' || id === 'city-tax'; });
	if (taxSquareId) document.getElementById("deed-" + taxSquareId + "-token").innerHTML += '<img src="images/tax_icon.png" height="60" width="70" alt="" style="position: relative; top: -20px;" />';
	if (structuredBoard.squaresById.jail) document.getElementById("deed-jail-price").innerHTML += '<img src="images/jake_icon.png" height="80" width="80" alt="" style="position: relative; top: -20px;" />';

	EditionRenderer.renderSquareDisplay(boardOrderIds.map(function(id) { return structuredBoard.squaresById[id]; }));

	// Jail corrections
	if (!document.getElementById("jailpositionholder")) $("<div>", {id: "jailpositionholder" }).appendTo("#jail");
	$("<span>").text("Jail").appendTo("#jail");

	document.getElementById("jail").enlargeId = "deed-jail";
	if (document.getElementById("deed-jail-name")) document.getElementById("deed-jail-name").textContent = "Jail";

	// Create event handlers for hovering and draging.

	var drag, dragX, dragY, dragObj, dragTop, dragLeft;

	$(".cell-position-holder, #jail").on("mouseover", function(){
		var cellId = this.parentElement.parentElement.dataset.squareId;
		var s = cellId ? structuredBoard.squaresById[cellId] : null;
		var rent = cellId ? getCurrentRent(game, cellId) : null;
		if (s && rent !== null) {
			var rentText = EditionRenderer.formatRentText(s, rent);
			document.getElementById(this.enlargeId + "-price").innerHTML = "Price: " + (s.presentation.priceText || '') + "<br />Rent: " + rentText;
		} else if (s) {
			document.getElementById(this.enlargeId + "-price").textContent = s.presentation.priceText || '';
		}
		$("#" + this.enlargeId).show();

	}).on("mouseout", function() {
		$("#" + this.enlargeId).hide();

	}).on("mousemove", function(e) {
		var element = document.getElementById(this.enlargeId);

		if (e.clientY + 20 > window.innerHeight - 204) {
			element.style.top = (window.innerHeight - 204) + "px";
		} else {
			element.style.top = (e.clientY + 20) + "px";
		}

		element.style.left = (e.clientX + 10) + "px";
	});


	$("body").on("mousemove", function(e) {
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


	$("body").on("mouseup", function() {

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

	$("#mortgagebutton").off("click").on("click", function() {
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

	$("#buyhousebutton").off("click").on("click", function() {
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


	$("#sellhousebutton").off("click").on("click", function() { sellHouse(getCheckedProperty()); });

	$("#viewstats").on("click", function() { showStats(game); });
	$("#statsclose, #statsbackground").on("click", function() {
		$("#statswrap").hide();
		$("#statsbackground").fadeOut(400);
	});

	$("#buy-menu-item").click(function() {
		$("#buy").show();
		$("#manage").hide();

		// Scroll alerts to bottom.
		$("#alert").scrollTop($("#alert").prop("scrollHeight"));
	});


	$("#manage-menu-item").click(function() {
		$("#manage").show();
		$("#buy").hide();
	});


	$("#trade-menu-item").off("click").on("click", function() { game.ui.editTrade(); });

    for(let i = 0; i < boardSquareCount; i++) {
        let c = structuredBoard.squaresById[boardOrderIds[i]].presentation.color;
        if(/^#[0-9a-f]{6}$/i.test(c) && c.toUpperCase() !== '#FFFFFF') {
		document.getElementById('square-' + boardOrderIds[i]).style.backgroundColor = 'rgba('+(parseInt(c.substr(1,2),16))+','+(parseInt(c.substr(3,2),16))+','+(parseInt(c.substr(5,2),16))+',0.25)';
        }
        else {
			document.getElementById('square-' + boardOrderIds[i]).style.backgroundColor = c;
        }
    }

};

window.onload = onloadBehavior;

function STOP() {
    turn = -1;
}
