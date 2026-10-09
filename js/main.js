// Bootstrapping: builds the board DOM, wires global event handlers, and starts on window load.

function sleep(ms) {
	if (typeof game !== 'undefined' && game && game.ui && game.ui.isHeadless) {
		return Promise.resolve();
	}
	return new Promise(resolve => setTimeout(resolve, ms));
}

function bindBrowserGameState(gameInstance) {
	var stateKeys = [
		'player', 'square', 'cardDecks', 'playersGame', 'pcount',
		'auctionEnabled', 'pendingAuction', 'freeParkingTaxes', 'freeParkingPot', 'turn',
		'doublecount', 'lastGamePlayerCount', 'lastKnownPosition', 'lastKnownJail',
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
	window.buy = function() { return gameInstance.buy(); };
	window.mortgage = function(index) { return gameInstance.mortgage(index); };
	window.unmortgage = function(index) { return gameInstance.unmortgage(index); };
	window.buyHouse = function(index) { return gameInstance.buyHouse(index); };
	window.sellHouse = function(index) { return gameInstance.sellHouse(index); };
	window.canSellHouse = function(index) { return gameInstance.canSellHouse(index); };
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
		cell.id = 'cell' + index;
		cell.className = 'cell board-dynamic-cell';
		cell.dataset.squareId = id;
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

// Overwrite an array with numbers from one to the array's length in a random order.
Array.prototype.randomize = function(length) {
	length = (length || this.length);
	var num;
	var indexArray = [];

	for (var i = 0; i < length; i++) {
		indexArray[i] = i;
	}

	for (var i = 0; i < length; i++) {
		// Generate random number between 0 and indexArray.length - 1.
		num = Math.floor(Math.random() * indexArray.length);
		this[i] = indexArray[num] + 1;

		indexArray.splice(num, 1);
	}
};

function onloadBehavior() {
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
		lastKnownPosition: [],
		lastKnownJail: [],
		playerOverlays: [],
		nextMoveDirection: 1
	});
	GameStateContext.initializeBoardState(initialState, structuredBoard, editionId);
	game = new Game(undefined, initialState);
	createBoardSurface(structuredBoard);
	bindBrowserGameState(game);
	resetTokenOverlays();
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

	Object.keys(cardDecks).forEach(function(deckId) {
		cardDecks[deckId].order.sort(function() { return Math.random() - 0.5; });
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
	var boardSquareCount = square.length;
	for (var i = 0; i < boardSquareCount; i++) {
		HTML += "<div id='enlarge" + i + "' class='enlarge'>";
		HTML += "<div id='enlarge" + i + "color' class='enlarge-color'></div><br /><div id='enlarge" + i + "name' class='enlarge-name'></div>";
		HTML += "<br /><div id='enlarge" + i + "price' class='enlarge-price'></div>";
		HTML += "<br /><div id='enlarge" + i + "token' class='enlarge-token'></div></div>";
	}

	enlargeWrap.innerHTML = HTML;

	var currentCell;
	var currentCellAnchor;
	var currentCellPositionHolder;
	var currentCellName;
	var currentCellOwner;

	for (var i = 0; i < boardSquareCount; i++) {
		s = square[i];

		currentCell = document.getElementById("cell" + i);
		currentCell.innerHTML = "";

		currentCellAnchor = currentCell.appendChild(document.createElement("div"));
		currentCellAnchor.id = "cell" + i + "anchor";
		currentCellAnchor.className = "cell-anchor";

		currentCellPositionHolder = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellPositionHolder.id = "cell" + i + "positionholder";
		currentCellPositionHolder.className = "cell-position-holder";
		currentCellPositionHolder.enlargeId = "enlarge" + i;

		if (i === 20) {
			var currentCellPot = currentCellAnchor.appendChild(document.createElement("div"));
			currentCellPot.id = "freeparkingpot";
			currentCellPot.className = "free-parking-pot";
		}

		currentCellName = currentCellAnchor.appendChild(document.createElement("div"));
		currentCellName.id = "cell" + i + "name";
		currentCellName.className = "cell-name";
		currentCellName.textContent = s.name;

		if (square[i].groupNumber) {
			currentCellOwner = currentCellAnchor.appendChild(document.createElement("div"));
			currentCellOwner.id = "cell" + i + "owner";
			currentCellOwner.className = "cell-owner";
		}

		document.getElementById("enlarge" + i + "color").style.backgroundColor = s.color;
		document.getElementById("enlarge" + i + "name").textContent = s.name;
		document.getElementById("enlarge" + i + "price").textContent = s.pricetext;

		if (s.groupNumber === 1 || s.groupNumber === 2) {
			document.getElementById("enlarge" + i).classList.add("enlarge-icon");
		}
	}
	updateFreeParkingDisplay();


	// Add images to enlarges.
	document.getElementById("enlarge0token").innerHTML += '<img src="images/arrow_icon.png" height="40" width="136" alt="" />';
	var freeParkingIndex = square.findIndex(function(item) { return item.id === 'free-parking'; });
	var taxIndex = square.findIndex(function(item) { return item.id === 'luxury-tax' || item.id === 'city-tax'; });
	if (freeParkingIndex !== -1) document.getElementById("enlarge" + freeParkingIndex + "price").innerHTML += "<img src='images/free_parking_icon.png' height='80' width='72' alt='' style='position: relative; top: -20px;' />";
	if (taxIndex !== -1) document.getElementById("enlarge" + taxIndex + "token").innerHTML += '<img src="images/tax_icon.png" height="60" width="70" alt="" style="position: relative; top: -20px;" />';

	EditionRenderer.renderSquareDisplay(square);

	// Jail corrections
	if (!document.getElementById("jailpositionholder")) $("<div>", {id: "jailpositionholder" }).appendTo("#jail");
	$("<span>").text("Jail").appendTo("#jail");

	document.getElementById("jail").enlargeId = "enlarge" + boardSquareCount;

	document.getElementById("enlarge-wrap").innerHTML += "<div id='enlarge" + boardSquareCount + "' class='enlarge'><div id='enlarge" + boardSquareCount + "color' class='enlarge-color'></div><br /><div id='enlarge" + boardSquareCount + "name' class='enlarge-name'>Jail</div><br /><div id='enlarge" + boardSquareCount + "price' class='enlarge-price'><img src='images/jake_icon.png' height='80' width='80' alt='' style='position: relative; top: -20px;' /></div><br /><div id='enlarge" + boardSquareCount + "token' class='enlarge-token'></div></div>";

	document.getElementById("enlarge" + boardSquareCount + "name").innerHTML = "Jail";

	// Create event handlers for hovering and draging.

	var drag, dragX, dragY, dragObj, dragTop, dragLeft;

	$(".cell-position-holder, #jail").on("mouseover", function(){
		var property = parseInt(this.id.replace("cell", "").replace("positionholder", ""), 10);
		var s = isNaN(property) ? null : square[property];
		var rent = isNaN(property) ? null : getCurrentRent(property);
		if (s && rent !== null) {
			var rentText = EditionRenderer.formatRentText(s, rent);
			document.getElementById(this.enlargeId + "price").innerHTML = "Price: " + s.pricetext + "<br />Rent: " + rentText;
		} else if (s) {
			document.getElementById(this.enlargeId + "price").textContent = s.pricetext;
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
		var s = square[checkedProperty];

		if (s.mortgage) {
			if (player[s.owner].money < Math.round(s.price * 0.55)) {
				game.ui.showMessage("You need $" + (Math.round(s.price * 0.55) - player[s.owner].money) + " more to unmortgage " + s.name + ".");

			} else {
				game.ui.confirm(player[s.owner].name + ", are you sure you want to unmortgage " + s.name + " for $" + Math.round(s.price * 0.55) + "?", function() {
					unmortgage(checkedProperty);
				}, "Yes/No");
			}
		} else {
			game.ui.confirm(player[s.owner].name + ", are you sure you want to mortgage " + s.name + " for $" + Math.round(s.price * 0.5) + "?", function() {
				mortgage(checkedProperty);
			}, "Yes/No");
		}

	});

	$("#buyhousebutton").off("click").on("click", function() {
		var checkedProperty = getCheckedProperty();
		var s = square[checkedProperty];
		var p = player[s.owner];

		if (p.money < s.houseprice) {
			if (s.house === 4) {
				game.ui.popup("<p>You need $" + (s.houseprice - player[s.owner].money) + " more to buy a hotel for " + s.name + ".</p>");
				return;
			} else {
				game.ui.popup("<p>You need $" + (s.houseprice - player[s.owner].money) + " more to buy a house for " + s.name + ".</p>");
				return;
			}
		}

		var supply = getHouseHotelSupply();

		if (s.house < 4 && supply.housesAvailable <= 0) {
			game.ui.popup("<p>All 32 houses are owned. You must wait until one becomes available.</p>");
			return;
		} else if (s.house === 4 && supply.hotelsAvailable <= 0) {
			game.ui.popup("<p>All 12 hotels are owned. You must wait until one becomes available.</p>");
			return;
		}

		buyHouse(checkedProperty);

	});


	$("#sellhousebutton").off("click").on("click", function() { sellHouse(getCheckedProperty()); });

	$("#viewstats").on("click", showStats);
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


	$("#trade-menu-item").click(game.trade);

    for(let i = 0; i < boardSquareCount; i++) {
        let c = square[i].color;
        if(/^#[0-9a-f]{6}$/i.test(c) && c.toUpperCase() !== '#FFFFFF') {
            document.querySelector('#cell'+i).style.backgroundColor = 'rgba('+(parseInt(c.substr(1,2),16))+','+(parseInt(c.substr(3,2),16))+','+(parseInt(c.substr(5,2),16))+',0.25)';
        }
        else {
            document.querySelector('#cell'+i).style.backgroundColor = c;
        }
    }

};

window.onload = onloadBehavior;

function STOP() {
    turn = -1;
}
