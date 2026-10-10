var DOMUI = (typeof globalThis !== 'undefined' && globalThis.DOMUI) ||
	(typeof module !== 'undefined' && module.exports ? require('./dom') : null);

// Browser rendering and form serialization for ID-based square and card transfers.
(function(global) {
	'use strict';
	var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

	function setButtons(editing, responding) {
		DOMUI.setVisible('#proposetradebutton, #canceltradebutton', !!editing);
		DOMUI.setVisible('#accepttradebutton, #rejecttradebutton', !!responding);
	}
	function playerId(player) { return player && player.playerId ? player.playerId : player; }
	function idsFor(board) {
		if (!board) throw new TypeError('Trade view requires the owning Game board.');
		var result = [], cursor = board.startSquareId;
		for (var i = 0; i < Object.keys(board.squaresById).length; i++) { result.push(cursor); cursor = board.squaresById[cursor].nextId; }
		return result;
	}
	function getPlayers(state, gameState) {
		if (!gameState || !global.GameStateContext) throw new TypeError('Trade view requires the owning Game state.');
		return {
			initiator: typeof state.initiator === 'object' ? state.initiator : global.GameStateContext.getPlayerById(gameState, state.initiator),
			recipient: typeof state.recipient === 'object' ? state.recipient : global.GameStateContext.getPlayerById(gameState, state.recipient)
		};
	}
	function resetTrade(state, initiator, recipient, allowRecipientToBeChanged, gameState) {
		if (!gameState || !gameState.board || !gameState.squareStateById) throw new TypeError('Trade view requires the owning Game state.');
		var boardIds = idsFor(gameState.board);
		var players = gameState.player;
		state.gameState = gameState;
		state.initiator = initiator; state.recipient = recipient;
		var leftProperties = document.getElementById('trade-leftp-property');
		var rightProperties = document.getElementById('trade-rightp-property');
		leftProperties.textContent = ''; rightProperties.textContent = '';
		var leftTable = document.createElement('table'), rightTable = document.createElement('table');
		function addRow(table, side, squareId, property) {
			var row = table.insertRow(), checkboxCell = row.insertCell();
			checkboxCell.className = 'propertycellcheckbox';
			var checkbox = document.createElement('input'); checkbox.type = 'checkbox';
			checkbox.id = 'trade' + side + 'square-' + squareId; checkbox.title = 'Include ' + property.name + ' in the trade.'; checkboxCell.appendChild(checkbox);
			var colorCell = row.insertCell(); colorCell.className = 'propertycellcolor';
			var swatch = document.createElement('span'); swatch.className = 'trade-property-swatch';
			colorCell.appendChild(swatch);
			var color = (property.color || '').toLowerCase().replace(/\s/g, '');
			if (color && !['white', '#fff', '#ffffff', 'transparent', 'rgb(255,255,255)', 'rgba(255,255,255,1)'].includes(color)) {
				swatch.style.backgroundColor = property.color;
			} else {
				swatch.title = property.group.label;
				if (property.icon) {
					var thumbnail = document.createElement('img'); thumbnail.src = property.icon; thumbnail.alt = property.group.label;
					thumbnail.onerror = function() { swatch.textContent = property.group.label.charAt(0).toUpperCase(); };
					swatch.appendChild(thumbnail);
				} else swatch.textContent = property.group.label.charAt(0).toUpperCase();
			}
			var nameCell = row.insertCell(); nameCell.className = 'propertycellname'; nameCell.textContent = property.name;
			if (property.mortgage) { nameCell.title = 'Mortgaged'; nameCell.style.color = 'grey'; }
			row.onclick = function(event) { if (event.target !== checkbox) checkbox.checked = !checkbox.checked; setButtons(true, false); };
		}
		boardIds.forEach(function(squareId) {
			var square = gameState.board.squaresById[squareId];
			var squareState = gameState.squareStateById[squareId];
			if (!square.groupId || squareState.ownerId === null) return;
			var group = gameState.board.groupsById[square.groupId].squareIds;
			if (squareState.house > 0 || group.some(function(memberId) { return gameState.squareStateById[memberId].house > 0; })) return;
			var definition = gameState.board.groupsById[square.groupId];
			var icon = definition.presentation.boardIcon || definition.presentation.tokenImage || square.presentation.boardIcon || square.presentation.tokenImage;
			var property = { id: squareId, name: square.presentation.label, color: square.presentation.color, mortgage: squareState.mortgage,
				group: definition, icon: typeof icon === 'string' ? icon : icon && icon.src };
			if (squareState.ownerId === initiator.playerId) addRow(leftTable, 'left', squareId, property);
			else if (squareState.ownerId === recipient.playerId) addRow(rightTable, 'right', squareId, property);
		});
		function addCards(table, side, owner) {
			(owner.heldCards || []).forEach(function(cardId) {
				var row = table.insertRow(), cell = row.insertCell(); cell.className = 'propertycellcheckbox';
				var checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.id = 'trade' + side + 'card-' + encodeURIComponent(cardId); cell.appendChild(checkbox);
				var label = row.insertCell(); label.colSpan = 2; label.className = 'propertycellname'; label.textContent = 'Get Out of Jail Free Card';
				row.onclick = function(event) { if (event.target !== checkbox) checkbox.checked = !checkbox.checked; setButtons(true, false); };
			});
		}
		addCards(leftTable, 'left', initiator); addCards(rightTable, 'right', recipient);
		if (leftTable.rows.length) leftProperties.appendChild(leftTable); else leftProperties.textContent = initiator.name + ' has no properties to trade.';
		if (rightTable.rows.length) rightProperties.appendChild(rightTable); else rightProperties.textContent = recipient.name + ' has no properties to trade.';
		document.getElementById('trade-leftp-name').textContent = initiator.name;
		var rightName = document.getElementById('trade-rightp-name'); rightName.textContent = '';
		if (allowRecipientToBeChanged && gameState.pcount > 2) {
			var select = document.createElement('select');
			for (var playerIndex = 1; playerIndex < players.length; playerIndex++) {
				if (!players[playerIndex] || players[playerIndex] === initiator) continue;
				var option = document.createElement('option'); option.value = players[playerIndex].playerId; option.textContent = players[playerIndex].name;
				option.selected = players[playerIndex] === recipient; select.appendChild(option);
			}
			select.onchange = function() { resetTrade(state, initiator, global.GameStateContext.getPlayerById(gameState, this.value), true, gameState); };
			rightName.appendChild(select);
		} else rightName.textContent = recipient.name;
		document.getElementById('trade-leftp-money').value = '0'; document.getElementById('trade-rightp-money').value = '0'; setButtons(true, false);
	}

	function readTrade(state) {
		var game = state.game, gameState = game && game.state || state.gameState;
		if (!gameState) throw new TypeError('Trade submission requires the owning Game state.');
		var squareIds = idsFor(gameState.board), offered = [], requested = [], heldCards = [];
		squareIds.forEach(function(squareId) {
			var left = document.getElementById('tradeleftsquare-' + squareId), right = document.getElementById('traderightsquare-' + squareId);
			if (left && left.checked) offered.push(squareId); else if (right && right.checked) requested.push(squareId);
		});
		var parties = getPlayers(state, gameState);
		[parties.initiator, parties.recipient].forEach(function(owner, sideIndex) {
			(owner.heldCards || []).forEach(function(cardId) {
				var side = sideIndex === 0 ? 'left' : 'right', checkbox = document.getElementById('trade' + side + 'card-' + encodeURIComponent(cardId));
				if (checkbox && checkbox.checked) heldCards.push({ cardId: cardId, direction: sideIndex === 0 ? 1 : -1 });
			});
		});
		var money = (parseInt(document.getElementById('trade-leftp-money').value, 10) || 0) - (parseInt(document.getElementById('trade-rightp-money').value, 10) || 0);
		return new global.Trade(playerId(state.initiator), playerId(state.recipient), money, offered, requested, heldCards);
	}
	function writeTrade(state, trade, gameState) {
		var players = getPlayers({ initiator: trade.getInitiator(), recipient: trade.getRecipient() }, gameState);
		resetTrade(state, players.initiator, players.recipient, false, gameState);
		trade.getOfferedSquareIds().forEach(function(id) { var box = document.getElementById('tradeleftsquare-' + id); if (box) box.checked = true; });
		trade.getRequestedSquareIds().forEach(function(id) { var box = document.getElementById('traderightsquare-' + id); if (box) box.checked = true; });
		trade.getHeldCards().forEach(function(card) {
			var side = card.direction === 1 ? 'left' : 'right';
			var box = document.getElementById('trade' + side + 'card-' + encodeURIComponent(card.cardId)); if (box) box.checked = true;
		});
		if (trade.getMoney() > 0) document.getElementById('trade-leftp-money').value = String(trade.getMoney());
		else document.getElementById('trade-rightp-money').value = String(-trade.getMoney());
	}
	function readMoneyFields() { return typeof document === 'undefined' ? { left: '0', right: '0' } : { left: document.getElementById('trade-leftp-money').value, right: document.getElementById('trade-rightp-money').value }; }
	function setMoneyError(side, message) { var input = document.getElementById(side === 'left' ? 'trade-leftp-money' : 'trade-rightp-money'); if (input) { input.value = message; input.style.color = 'red'; } }
	function formatTradeResult(label, trade, gameState) {
		var ids = trade.getOfferedSquareIds ? trade.getOfferedSquareIds() : [];
		var requestedIds = trade.getRequestedSquareIds ? trade.getRequestedSquareIds() : [];
		var squares = gameState && gameState.board ? gameState.board.squaresById : null;
		var offered = ids.map(function(id) { return UIHtml.escapeHTML(squares ? squares[id].presentation.label : id); });
		var requested = requestedIds.map(function(id) { return UIHtml.escapeHTML(squares ? squares[id].presentation.label : id); });
		if (trade.getHeldCards) trade.getHeldCards().forEach(function(card) { (card.direction === 1 ? offered : requested).push('Get Out of Jail Free card'); });
		var money = trade.getMoney();
		var initiator = trade.getInitiator(), recipient = trade.getRecipient();
		if (gameState && typeof initiator === 'string') initiator = global.GameStateContext.getPlayerById(gameState, initiator);
		if (gameState && typeof recipient === 'string') recipient = global.GameStateContext.getPlayerById(gameState, recipient);
		var initiatorName = typeof initiator === 'object' ? initiator.name : String(initiator);
		var recipientName = typeof recipient === 'object' ? recipient.name : String(recipient);
		return UIHtml.escapeHTML(label) + ": <table class='trade-summary'><tr><th>" + UIHtml.escapeHTML(initiatorName) + " gives</th><th>" + UIHtml.escapeHTML(recipientName) + " gives</th></tr><tr><td>" + (offered.join(', ') || 'Nothing') + (money > 0 ? ' and $' + money : '') + "</td><td>" + (requested.join(', ') || 'Nothing') + (money < 0 ? ' and $' + (-money) : '') + '</td></tr></table>';
	}
	function initializeInputHandlers() {
		['trade-leftp-money', 'trade-rightp-money'].forEach(function(id) {
			var input = document.getElementById(id); if (!input) return;
			input.onkeydown = function(event) { var key = event.keyCode; if (key === 13) return false; if ([8, 9, 46].indexOf(key) !== -1 || (key >= 35 && key <= 40) || event.ctrlKey) return true; return !event.shiftKey && ((key >= 48 && key <= 57) || (key >= 96 && key <= 105)); };
			input.onfocus = function() { this.style.color = 'black'; if (isNaN(this.value) || this.value === '0') this.value = ''; };
			input.onchange = function() { setButtons(true, false); if (isNaN(this.value)) { this.value = 'This value must be a number.'; this.style.color = 'red'; return false; } var amount = Math.round(this.value) || 0; if (amount < 0) { this.value = 'This value must be greater than 0.'; this.style.color = 'red'; return false; } this.value = amount; return true; };
		});
	}
	var TradeView = { initializeInputHandlers: initializeInputHandlers, reset: resetTrade, read: readTrade, write: writeTrade, formatResult: formatTradeResult, setButtons: setButtons, readMoneyFields: readMoneyFields, setMoneyError: setMoneyError };
	if (typeof module !== 'undefined' && module.exports) module.exports = TradeView;
	global.TradeView = TradeView;
})(typeof window !== 'undefined' ? window : globalThis);
