// Direct property actions: buying, mortgaging, and building houses/hotels.

function buy() {
	var p = player[turn];
	var property = square[p.position];
	var cost = property.price;

	if (p.money >= cost) {
		p.pay(cost, 0);

		property.owner = turn;
		pendingAuction = -1;
		document.getElementById("nextbutton").value = "End turn";
		document.getElementById("nextbutton").title = "End turn and advance to the next player.";
		updateMoney();
		addAlert(p.name + " bought " + property.name + " for " + property.pricetext + ".");

		updateOwned();

		$("#landed").hide();

	} else {
		popup("<p>" + p.name + ", you need $" + (property.price - p.money) + " more to buy " + property.name + ".</p>");
	}
}

function mortgage(index) {
	var sq = square[index];
	var p = player[sq.owner];

	if (sq.house > 0 || sq.hotel > 0 || sq.mortgage) {
		return false;
	}

	var mortgagePrice = Math.round(sq.price * 0.5);
	var unmortgagePrice = Math.round(sq.price * 0.55);

	sq.mortgage = true;
	p.money += mortgagePrice;

	document.getElementById("mortgagebutton").value = "Unmortgage for $" + unmortgagePrice;
	document.getElementById("mortgagebutton").title = "Unmortgage " + sq.name + " for $" + unmortgagePrice + ".";

	addAlert(p.name + " mortgaged " + sq.name + " for $" + mortgagePrice + ".");
	updateOwned();
	updateMoney();
    document.querySelector('#cell' + index).classList.add('mortgaged');

	return true;
}

function unmortgage(index) {
	var sq = square[index];
	var p = player[sq.owner];
	var unmortgagePrice = Math.round(sq.price * 0.55);
	var mortgagePrice = Math.round(sq.price * 0.5);

	if (unmortgagePrice > p.money || !sq.mortgage) {
		return false;
	}

	p.pay(unmortgagePrice, 0);
	sq.mortgage = false;
	document.getElementById("mortgagebutton").value = "Mortgage for $" + mortgagePrice;
	document.getElementById("mortgagebutton").title = "Mortgage " + sq.name + " for $" + mortgagePrice + ".";

	addAlert(p.name + " unmortgaged " + sq.name + " for $" + unmortgagePrice + ".");
	updateOwned();
    document.querySelector('#cell' + index).classList.remove('mortgaged');
	return true;
}

function buyHouse(index) {
	var sq = square[index];
	var p = player[sq.owner];
	var houseSum = 0;
	var hotelSum = 0;
	var group = sq.group || [];

    if(sq.mortgage || sq.hotel === 1) {
        return false;
    }

	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = square[group[groupIndex]];
		if (groupSquare && groupSquare.house < sq.house) {
			return false;
		}
	}

	if (p.money - sq.houseprice < 0) {
		if (sq.house == 4) {
			return false;
		} else {
			return false;
		}

	} else {
		for (var i = 0; i < 40; i++) {
			if (square[i].hotel === 1) {
				hotelSum++;
			} else {
				houseSum += square[i].house;
			}
		}

		if (sq.house < 4) {
			if (houseSum >= 32) {
				return false;

			} else {
				sq.house++;
				console.log(p.name + " placed a house on " + sq.name + ".");
				document.getElementById("cell" + index + "owner").innerHTML += '<div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div>';
			}

		} else {
			if (hotelSum >= 12) {
				return;

			} else {
				sq.house = 5;
				sq.hotel = 1;
				console.log(p.name + " placed a hotel on " + sq.name + ".");
				document.getElementById("cell" + index + "owner").innerHTML = '<div class="cell-position cell-hotel" title="house" style="display: inline-block;background-color: red; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div>';
			}
		}

		p.pay(sq.houseprice, 0);

		updateOwned();
		updateMoney();
	}
}

// Houses/hotels must be sold evenly across a color-group, same as buying.
function canSellHouse(index) {
	var sq = square[index];
	if (sq.house === 0 && sq.hotel === 0) {
		return false;
	}

	var group = sq.group || [];
	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = square[group[groupIndex]];
		if (groupSquare && groupSquare.house > sq.house) {
			return false;
		}
	}
	return true;
}

function sellHouse(index) {
	sq = square[index];
	p = player[sq.owner];

	if (!canSellHouse(index)) {
		return false;
	}

	if (sq.hotel === 1) {
		sq.hotel = 0;
		sq.house = 4;
		addAlert(p.name + " sold the hotel on " + sq.name + ".");
        document.getElementById("cell" + index + "owner").innerHTML = '<div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div><div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div><div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div><div class="cell-position cell-house" title="house" style="display: inline-block;background-color: green; border: 1px;border-style: solid;position:relative; vertical-align:middle"></div>';
        p.money += sq.houseprice * 0.5;
	} else if(sq.house > 0) {
		sq.house--;
		addAlert(p.name + " sold a house on " + sq.name + ".");
        let element = document.querySelector('#cell' + index + 'owner .cell-house');
        element.parentElement.removeChild(element);
        p.money += sq.houseprice * 0.5;
	}
	updateOwned();
	updateMoney();
	return true;
}
