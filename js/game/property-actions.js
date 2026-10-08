// Direct property actions: buying, mortgaging, and building houses/hotels.

function notifyPropertyUI(game, method) {
	if (!game || !game.ui || typeof game.ui[method] !== 'function') {
		return;
	}
	return game.ui[method].apply(game.ui, Array.prototype.slice.call(arguments, 2));
}

function buy(game) {
	var state = game.state;
	var p = state.player[state.turn];
	var property = state.square[p.position];
	var cost = property.price;

	if (p.money >= cost) {
		p.pay(cost, 0);

		property.owner = state.turn;
		state.pendingAuction = -1;
		notifyPropertyUI(game, "updateButtonState", "End turn", "End turn and advance to the next player.");
		notifyPropertyUI(game, "updateMoney");
		notifyPropertyUI(game, "alert", p.name + " bought " + property.name + " for " + property.pricetext + ".");
		notifyPropertyUI(game, "updateOwned");
		notifyPropertyUI(game, "hideLanded");

	} else {
		notifyPropertyUI(game, "showMessage", p.name + ", you need $" + (property.price - p.money) + " more to buy " + property.name + ".");
	}
}

function mortgage(game, index) {
	var state = game.state;
	var sq = state.square[index];
	var p = state.player[sq.owner];

	if (sq.house > 0 || sq.hotel > 0 || sq.mortgage) {
		return false;
	}

	var group = sq.group || [];
	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = state.square[group[groupIndex]];
		if (groupSquare && (groupSquare.house > 0 || groupSquare.hotel > 0)) {
			return false;
		}
	}

	var mortgagePrice = Math.round(sq.price * 0.5);
	var unmortgagePrice = Math.round(sq.price * 0.55);

	sq.mortgage = true;
	p.money += mortgagePrice;

	notifyPropertyUI(game, "updateMortgageButton", "Unmortgage for $" + unmortgagePrice, "Unmortgage " + sq.name + " for $" + unmortgagePrice + ".");

	notifyPropertyUI(game, "alert", p.name + " mortgaged " + sq.name + " for $" + mortgagePrice + ".");
	notifyPropertyUI(game, "updateOwned");
	notifyPropertyUI(game, "updateMoney");

	notifyPropertyUI(game, "onMortgageChanged", index, true);

	return true;
}

function unmortgage(game, index) {
	var state = game.state;
	var sq = state.square[index];
	var p = state.player[sq.owner];
	var unmortgagePrice = Math.round(sq.price * 0.55);
	var mortgagePrice = Math.round(sq.price * 0.5);

	if (unmortgagePrice > p.money || !sq.mortgage) {
		return false;
	}

	p.pay(unmortgagePrice, 0);
	sq.mortgage = false;

	notifyPropertyUI(game, "updateMortgageButton", "Mortgage for $" + mortgagePrice, "Mortgage " + sq.name + " for $" + mortgagePrice + ".");

	notifyPropertyUI(game, "alert", p.name + " unmortgaged " + sq.name + " for $" + unmortgagePrice + ".");
	notifyPropertyUI(game, "updateOwned");

	notifyPropertyUI(game, "onMortgageChanged", index, false);

	return true;
}

// Shared house/hotel bank (32 houses, 12 hotels total) that buyHouse enforces for every caller, human or bot.
function getHouseHotelSupply(game) {
	var squares = game.state.square;
	var housesInPlay = 0;
	var hotelsInPlay = 0;

	for (var i = 0; i < squares.length; i++) {
		if (squares[i].hotel === 1) {
			hotelsInPlay++;
		} else {
			housesInPlay += squares[i].house;
		}
	}

	return { housesAvailable: 32 - housesInPlay, hotelsAvailable: 12 - hotelsInPlay };
}

function buyHouse(game, index) {
	var state = game.state;
	var sq = state.square[index];
	var p = state.player[sq.owner];
	var group = sq.group || [];

    if(sq.mortgage || sq.hotel === 1) {
        return false;
    }

	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = state.square[group[groupIndex]];
		if (groupSquare && (groupSquare.house < sq.house || groupSquare.mortgage)) {
			return false;
		}
	}

	if (p.money - sq.houseprice < 0) {
		return false;

	} else {
		var supply = getHouseHotelSupply(game);

		if (sq.house < 4) {
			if (supply.housesAvailable <= 0) {
				return false;

			} else {
				sq.house++;
				notifyPropertyUI(game, "alert", p.name + " bought a house on " + sq.name + ".");
				notifyPropertyUI(game, "onHouseChanged", index, sq.house, sq.hotel);
			}

		} else {
			if (supply.hotelsAvailable <= 0) {
				return false;

			} else {
				sq.house = 5;
				sq.hotel = 1;
				notifyPropertyUI(game, "alert", p.name + " bought a hotel on " + sq.name + ".");
				notifyPropertyUI(game, "onHouseChanged", index, sq.house, sq.hotel);
			}
		}

		p.pay(sq.houseprice, 0);

		notifyPropertyUI(game, "updateOwned");
		notifyPropertyUI(game, "updateMoney");

		return true;
	}
}

// Houses/hotels must be sold evenly across a color-group, same as buying.
function canSellHouse(game, index) {
	var state = game.state;
	var sq = state.square[index];
	if (sq.house === 0 && sq.hotel === 0) {
		return false;
	}

	var group = sq.group || [];
	for (var groupIndex = 0; groupIndex < group.length; groupIndex++) {
		var groupSquare = state.square[group[groupIndex]];
		if (groupSquare && groupSquare.house > sq.house) {
			return false;
		}
	}
	return true;
}

function sellHouse(game, index) {
	var state = game.state;
	var sq = state.square[index];
	var p = state.player[sq.owner];

	if (!canSellHouse(game, index)) {
		return false;
	}

	if (sq.hotel === 1) {
		sq.hotel = 0;
		sq.house = 4;
		notifyPropertyUI(game, "alert", p.name + " sold the hotel on " + sq.name + ".");
		notifyPropertyUI(game, "onHouseChanged", index, sq.house, sq.hotel);
		p.money += sq.houseprice * 0.5;
	} else if(sq.house > 0) {
		sq.house--;
		notifyPropertyUI(game, "alert", p.name + " sold a house on " + sq.name + ".");
		notifyPropertyUI(game, "onHouseChanged", index, sq.house, sq.hotel);
		p.money += sq.houseprice * 0.5;
	}
	notifyPropertyUI(game, "updateOwned");
	notifyPropertyUI(game, "updateMoney");
	return true;
}

if (typeof Game !== 'undefined') {
	Game.prototype.buy = function() { return buy(this); };
	Game.prototype.mortgage = function(index) { return mortgage(this, index); };
	Game.prototype.unmortgage = function(index) { return unmortgage(this, index); };
	Game.prototype.buyHouse = function(index) { return buyHouse(this, index); };
	Game.prototype.sellHouse = function(index) { return sellHouse(this, index); };
	Game.prototype.canSellHouse = function(index) { return canSellHouse(this, index); };
	Game.prototype.getHouseHotelSupply = function() { return getHouseHotelSupply(this); };
}

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
