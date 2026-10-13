// Rule actions over stable square IDs and per-game square state.
(function(global) {
	'use strict';

	function context(game, squareId) {
		var state = game && game.state;
		if (!state || !state.board) throw new RangeError('Property action requires a Game Board.');
		var square = global.getSquare(state.board, squareId);
		var squareState = global.GameStateContext.getSquareState(state, squareId);
		return { state: state, square: square, squareState: squareState };
	}
	function notify(game, method) {
		if (game.ui && typeof game.ui[method] === 'function') game.ui[method].apply(game.ui, Array.prototype.slice.call(arguments, 2));
	}
	function owner(game, ownerId) {
		return global.GameStateContext.getPlayerById(game.state, ownerId);
	}
	function groupState(game, square) {
		return square.groupId ? global.getGroupSquareIds(game.state.board, square.groupId).map(function(id) {
			return { id: id, square: global.getSquare(game.state.board, id), state: global.GameStateContext.getSquareState(game.state, id) };
		}) : [];
	}
	// Shared eligibility for controller validation and browser controls. No mutation.
	function actionError(state, playerId, type, squareId) {
		var square = state.board.squaresById[squareId], property = state.squareStateById[squareId];
		if (!square || !property || property.ownerId !== playerId) return 'Player does not own this property.';
		var player = global.GameStateContext.getPlayerById(state, playerId);
		var members = square.groupId ? global.getGroupSquareIds(state.board, square.groupId) : [];
		var group = members.map(function(id) { return state.squareStateById[id]; });
		if (type === 'mortgage' && (property.mortgage || property.house || property.hotel || group.some(function(ss) { return ss.house || ss.hotel; }))) return 'Property cannot be mortgaged.';
		if (type === 'unmortgage' && (!property.mortgage || player.money < Math.round(square.rules.purchasePrice * 0.55))) return 'Property cannot be unmortgaged with available cash.';
		if (type === 'sellHouse' && ((!property.house && !property.hotel) || group.some(function(ss) { return ss.house > property.house; }))) return 'Buildings must be sold evenly.';
		if (type === 'buyHouse') {
			var available = supply({ state: state });
			if (square.kind !== 'street' || property.hotel || property.mortgage || !group.length || !group.every(function(ss) { return ss.ownerId === playerId && !ss.mortgage && ss.house >= property.house; }) || player.money < square.rules.houseCost || (property.house < 4 ? available.housesAvailable <= 0 : available.hotelsAvailable <= 0)) return 'Building is unavailable under the cash, ownership, supply, or even-building rules.';
		}
		return null;
	}
	function buy(game, squareId) {
		var c = context(game, squareId), p = game.state.player[game.state.turn], rules = c.square.rules;
		if (c.squareState.ownerId !== null || rules.purchasePrice <= 0) return false;
		if (p.money < rules.purchasePrice) return false;
		p.pay(rules.purchasePrice, global.GameStateContext.BANK_ID);
		global.GameStateContext.setSquareOwner(game.state, squareId, p.playerId);
		game.state.pendingAuction = null;
		notify(game, 'hideLanded');
		notify(game, 'updateMoney'); notify(game, 'updateOwned');
		return true;
	}
	function mortgage(game, squareId) {
		var c = context(game, squareId), s = c.squareState;
		if (s.ownerId === null || s.ownerId !== game.state.player[game.state.turn].playerId || s.house || s.hotel || s.mortgage) return false;
		if (groupState(game, c.square).some(function(m) { return m.state.house || m.state.hotel; })) return false;
		var p = owner(game, s.ownerId), amount = c.square.rules.mortgageValue;
		s.mortgage = true; p.money += amount;
		notify(game, 'updateOwned'); notify(game, 'updateMoney');
		return true;
	}
	function unmortgage(game, squareId) {
		var c = context(game, squareId), s = c.squareState;
		if (s.ownerId === null || s.ownerId !== game.state.player[game.state.turn].playerId || !s.mortgage) return false;
		var p = owner(game, s.ownerId), amount = Math.round(c.square.rules.purchasePrice * 0.55);
		if (p.money < amount) return false;
		p.pay(amount, global.GameStateContext.BANK_ID); s.mortgage = false;
		notify(game, 'updateOwned'); notify(game, 'updateMoney');
		return true;
	}
	function supply(game) {
		var houses = 0, hotels = 0;
		Object.keys(game.state.squareStateById).forEach(function(id) {
			var s = game.state.squareStateById[id];
			if (s.hotel) hotels += 1; else houses += s.house;
		});
		return { housesAvailable: game.state.board.rules.houseTotal - houses, hotelsAvailable: game.state.board.rules.hotelTotal - hotels };
	}
	function build(game, squareId) {
		var c = context(game, squareId), s = c.squareState, group = groupState(game, c.square);
		if (s.ownerId === null || s.ownerId !== game.state.player[game.state.turn].playerId || c.square.kind !== 'street' || s.mortgage || s.hotel) return false;
		if (!group.length || !group.every(function(m) { return m.state.ownerId === s.ownerId && !m.state.mortgage; })) return false;
		if (group.some(function(m) { return m.state.house < s.house; })) return false;
		var p = owner(game, s.ownerId), cost = c.square.rules.houseCost, available = supply(game);
		if (p.money < cost) return false;
		if (s.house < 4 && available.housesAvailable <= 0) return false;
		if (s.house === 4 && available.hotelsAvailable <= 0) return false;
		if (s.house < 4) s.house += 1; else { s.house = 5; s.hotel = 1; }
		p.pay(cost, global.GameStateContext.BANK_ID);
		notify(game, 'updateOwned'); notify(game, 'updateMoney');
		return true;
	}
	function canSell(game, squareId) {
		var c = context(game, squareId), s = c.squareState;
		if (s.ownerId === null || s.ownerId !== game.state.player[game.state.turn].playerId || (!s.house && !s.hotel)) return false;
		return !groupState(game, c.square).some(function(m) { return m.id !== squareId && m.state.house > s.house; });
	}
	function sell(game, squareId) {
		if (!canSell(game, squareId)) return false;
		var c = context(game, squareId), s = c.squareState, p = owner(game, s.ownerId);
		if (s.hotel) { s.hotel = 0; s.house = 4; } else s.house -= 1;
		p.money += c.square.rules.houseCost / 2;
		notify(game, 'updateOwned'); notify(game, 'updateMoney');
		return true;
	}

	var api = { actionError: actionError, buy: buy, mortgage: mortgage, unmortgage: unmortgage, buyHouse: build, sellHouse: sell, canSellHouse: canSell, getHouseHotelSupply: supply };
	global.PropertyActions = api;
	if (typeof Game !== 'undefined') {
		Game.prototype.buy = function(squareId) { return buy(this, squareId); };
		Game.prototype.mortgage = function(squareId) { return mortgage(this, squareId); };
		Game.prototype.unmortgage = function(squareId) { return unmortgage(this, squareId); };
		Game.prototype.buyHouse = function(squareId) { return build(this, squareId); };
		Game.prototype.sellHouse = function(squareId) { return sell(this, squareId); };
		Game.prototype.canSellHouse = function(squareId) { return canSell(this, squareId); };
		Game.prototype.getHouseHotelSupply = function() { return supply(this); };
	}
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
