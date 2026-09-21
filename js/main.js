// Bootstrapping: builds the board DOM, wires global event handlers, and starts on window load.

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
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
	game = new Game();
	redefineGame();
	resetTokenOverlays();

	for (var i = 0; i <= 8; i++) {
		player[i] = new Player("", "");
		player[i].index = i;
	}

	var groupPropertyArray = [];
	var groupNumber;

	for (var i = 0; i < 40; i++) {
		groupNumber = square[i].groupNumber;

		if (groupNumber > 0) {
			if (!groupPropertyArray[groupNumber]) {
				groupPropertyArray[groupNumber] = [];
			}

			groupPropertyArray[groupNumber].push(i);
		}
	}

	for (var i = 0; i < 40; i++) {
		groupNumber = square[i].groupNumber;

		if (groupNumber > 0) {
			square[i].group = groupPropertyArray[groupNumber];
		}

		square[i].index = i;
	}

	AITest.count = 0;
	AITest2.count = 0;
	AITest3.count = 0;

	player[1].human = true;
	player[0].name = "the bank";

	communityChestCards.index = 0;
	chanceCards.index = 0;

	communityChestCards.deck = [];
	chanceCards.deck = [];
	for (var i = 0; i < 16; i++) {
		chanceCards.deck[i] = i;
		communityChestCards.deck[i] = i;
	}

	// Shuffle Chance and Community Chest decks.
	chanceCards.deck.sort(function() {return Math.random() - 0.5;});
	communityChestCards.deck.sort(function() {return Math.random() - 0.5;});

	createPlayerInputs();
	playernumber_onchange();

	$("#nextbutton").off("click").on("click", game.next);
	$("#noscript").hide();
	$("#setup, #noF5").show();

	$('#enlargeWrap').remove();
	var enlargeWrap = document.body.appendChild(document.createElement("div"));

	enlargeWrap.id = "enlarge-wrap";

	var HTML = "";
	for (var i = 0; i < 40; i++) {
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

	for (var i = 0; i < 40; i++) {
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
	document.getElementById("enlarge20price").innerHTML += "<img src='images/free_parking_icon.png' height='80' width='72' alt='' style='position: relative; top: -20px;' />";
	document.getElementById("enlarge38token").innerHTML += '<img src="images/tax_icon.png" height="60" width="70" alt="" style="position: relative; top: -20px;" />';

	Monopoly.Editions.getActive().corrections();

	// Jail corrections
	$("<div>", {id: "jailpositionholder" }).appendTo("#jail");
	$("<span>").text("Jail").appendTo("#jail");

	document.getElementById("jail").enlargeId = "enlarge40";

	document.getElementById("enlarge-wrap").innerHTML += "<div id='enlarge40' class='enlarge'><div id='enlarge40color' class='enlarge-color'></div><br /><div id='enlarge40name' class='enlarge-name'>Jail</div><br /><div id='enlarge40price' class='enlarge-price'><img src='images/jake_icon.png' height='80' width='80' alt='' style='position: relative; top: -20px;' /></div><br /><div id='enlarge40token' class='enlarge-token'></div></div>";

	document.getElementById("enlarge40name").innerHTML = "Jail";

	// Create event handlers for hovering and draging.

	var drag, dragX, dragY, dragObj, dragTop, dragLeft;

	$(".cell-position-holder, #jail").on("mouseover", function(){
		var property = parseInt(this.id.replace("cell", "").replace("positionholder", ""), 10);
		var s = isNaN(property) ? null : square[property];
		var rent = isNaN(property) ? null : getCurrentRent(property);
		if (s && rent !== null) {
			document.getElementById(this.enlargeId + "price").innerHTML = "Price: " + s.pricetext + "<br />Rent: $" + rent;
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
				popup("<p>You need $" + (Math.round(s.price * 0.55) - player[s.owner].money) + " more to unmortgage " + s.name + ".</p>");

			} else {
				popup("<p>" + player[s.owner].name + ", are you sure you want to unmortgage " + s.name + " for $" + Math.round(s.price * 0.55) + "?</p>", function() {
					unmortgage(checkedProperty);
				}, "Yes/No");
			}
		} else {
			popup("<p>" + player[s.owner].name + ", are you sure you want to mortgage " + s.name + " for $" + Math.round(s.price * 0.5) + "?</p>", function() {
				mortgage(checkedProperty);
			}, "Yes/No");
		}

	});

	$("#buyhousebutton").off("click").on("click", function() {
		var checkedProperty = getCheckedProperty();
		var s = square[checkedProperty];
		var p = player[s.owner];
		var houseSum = 0;
		var hotelSum = 0;

		if (p.money < s.houseprice) {
			if (s.house === 4) {
				popup("<p>You need $" + (s.houseprice - player[s.owner].money) + " more to buy a hotel for " + s.name + ".</p>");
				return;
			} else {
				popup("<p>You need $" + (s.houseprice - player[s.owner].money) + " more to buy a house for " + s.name + ".</p>");
				return;
			}
		}

		for (var i = 0; i < 40; i++) {
			if (square[i].hotel === 1) {
				hotelSum++;
			} else {
				houseSum += square[i].house;
			}
		}

		if (s.house < 4 && houseSum >= 32) {
			popup("<p>All 32 houses are owned. You must wait until one becomes available.</p>");
			return;
		} else if (s.house === 4 && hotelSum >= 12) {
			popup("<p>All 12 hotels are owned. You must wait until one becomes available.</p>");
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

    for(let i = 0; i < 40; i++) {
        let c = square[i].color;
        if(c !== '#FFFFFF') {
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
