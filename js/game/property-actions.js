// Direct property actions: buying, mortgaging, and building houses/hotels.

function notifyPropertyUI(method) {
	if (typeof game === 'undefined' || !game || !game.ui || typeof game.ui[method] !== 'function') {
		return;
	}
	return game.ui[method].apply(game.ui, Array.prototype.slice.call(arguments, 1));
}

function buy() {
	var p = player[turn];
	var property = square[p.position];
	var cost = property.price;

	if (p.money >= cost) {
		p.pay(cost, 0);

		property.owner = turn;
		pendingAuction = -1;
		notifyPropertyUI("updateButtonState", "End turn", "End turn and advance to the next player.");
		notifyPropertyUI("updateMoney");
		notifyPropertyUI("alert", p.name + " bought " + property.name + " for " + property.pricetext + ".");
		notifyPropertyUI("updateOwned");
		notifyPropertyUI("hideLanded");

	} else {
		notifyPropertyUI("showMessage", p.name + ", you need $" + (property.price - p.money) + " more to buy " + property.name + ".");
	}
}

function mortgage(index) {
	var sq = square[index];
	var p = player[sq.owner];

	if (sq.house > 0 || sq.hotel > 0 || sq.mortgage) {
		return false;
	}

	var group = sq.group || [];
	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = square[group[groupIndex]];
		if (groupSquare && (groupSquare.house > 0 || groupSquare.hotel > 0)) {
			return false;
		}
	}

	var mortgagePrice = Math.round(sq.price * 0.5);
	var unmortgagePrice = Math.round(sq.price * 0.55);

	sq.mortgage = true;
	p.money += mortgagePrice;

	notifyPropertyUI("updateMortgageButton", "Unmortgage for $" + unmortgagePrice, "Unmortgage " + sq.name + " for $" + unmortgagePrice + ".");

	notifyPropertyUI("alert", p.name + " mortgaged " + sq.name + " for $" + mortgagePrice + ".");
	notifyPropertyUI("updateOwned");
	notifyPropertyUI("updateMoney");

	notifyPropertyUI("onMortgageChanged", index, true);

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

	notifyPropertyUI("updateMortgageButton", "Mortgage for $" + mortgagePrice, "Mortgage " + sq.name + " for $" + mortgagePrice + ".");

	notifyPropertyUI("alert", p.name + " unmortgaged " + sq.name + " for $" + unmortgagePrice + ".");
	notifyPropertyUI("updateOwned");

	notifyPropertyUI("onMortgageChanged", index, false);

	return true;
}

// Shared house/hotel bank (32 houses, 12 hotels total) that buyHouse enforces for every caller, human or bot.
function getHouseHotelSupply() {
	var housesInPlay = 0;
	var hotelsInPlay = 0;

	for (var i = 0; i < 40; i++) {
		if (square[i].hotel === 1) {
			hotelsInPlay++;
		} else {
			housesInPlay += square[i].house;
		}
	}

	return { housesAvailable: 32 - housesInPlay, hotelsAvailable: 12 - hotelsInPlay };
}

function buyHouse(index) {
	var sq = square[index];
	var p = player[sq.owner];
	var group = sq.group || [];

    if(sq.mortgage || sq.hotel === 1) {
        return false;
    }

	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = square[group[groupIndex]];
		if (groupSquare && (groupSquare.house < sq.house || groupSquare.mortgage)) {
			return false;
		}
	}

	if (p.money - sq.houseprice < 0) {
		return false;

	} else {
		var supply = getHouseHotelSupply();

		if (sq.house < 4) {
			if (supply.housesAvailable <= 0) {
				return false;

			} else {
				sq.house++;
				notifyPropertyUI("alert", p.name + " bought a house on " + sq.name + ".");
				notifyPropertyUI("onHouseChanged", index, sq.house, sq.hotel);
			}

		} else {
			if (supply.hotelsAvailable <= 0) {
				return false;

			} else {
				sq.house = 5;
				sq.hotel = 1;
				notifyPropertyUI("alert", p.name + " bought a hotel on " + sq.name + ".");
				notifyPropertyUI("onHouseChanged", index, sq.house, sq.hotel);
			}
		}

		p.pay(sq.houseprice, 0);

		notifyPropertyUI("updateOwned");
		notifyPropertyUI("updateMoney");

		return true;
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
	var sq = square[index];
	var p = player[sq.owner];

	if (!canSellHouse(index)) {
		return false;
	}

	if (sq.hotel === 1) {
		sq.hotel = 0;
		sq.house = 4;
		notifyPropertyUI("alert", p.name + " sold the hotel on " + sq.name + ".");
		notifyPropertyUI("onHouseChanged", index, sq.house, sq.hotel);
		p.money += sq.houseprice * 0.5;
	} else if(sq.house > 0) {
		sq.house--;
		notifyPropertyUI("alert", p.name + " sold a house on " + sq.name + ".");
		notifyPropertyUI("onHouseChanged", index, sq.house, sq.hotel);
		p.money += sq.houseprice * 0.5;
	}
	notifyPropertyUI("updateOwned");
	notifyPropertyUI("updateMoney");
	return true;
}

var _global = typeof window !== 'undefined' ? window : globalThis;
_global.buy = buy;
_global.mortgage = mortgage;
_global.unmortgage = unmortgage;
_global.buyHouse = buyHouse;
_global.sellHouse = sellHouse;
_global.canSellHouse = canSellHouse;
_global.getHouseHotelSupply = getHouseHotelSupply;

if (typeof module !== 'undefined' && module.exports) {
	module.exports = {
		buy: buy,
		mortgage: mortgage,
		unmortgage: unmortgage,
		buyHouse: buyHouse,
		sellHouse: sellHouse,
		canSellHouse: canSellHouse,
		getHouseHotelSupply: getHouseHotelSupply
	};
}
