// Browser rendering and form serialization for player trades.
(function(global) {
	'use strict';
	var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

	function setButtons(editing, responding) {
		if (typeof global.$ === 'undefined') return;
		global.$('#proposetradebutton, #canceltradebutton').toggle(!!editing);
		global.$('#accepttradebutton, #rejecttradebutton').toggle(!!responding);
	}

	function resetTrade(state, initiator, recipient, allowRecipientToBeChanged, gameState) {
		var squares = gameState ? gameState.square : global.square;
		var players = gameState ? gameState.player : global.player;
		var playerCount = gameState ? gameState.pcount : global.pcount;
		state.initiator = initiator;
		state.recipient = recipient;

		var leftProperties = document.getElementById('trade-leftp-property');
		var rightProperties = document.getElementById('trade-rightp-property');
		leftProperties.textContent = '';
		rightProperties.textContent = '';

		var leftTable = document.createElement('table');
		var rightTable = document.createElement('table');

		function addRow(table, propertyIndex, property, checkboxId) {
			var row = table.insertRow();
			var checkboxCell = row.insertCell();
			checkboxCell.className = 'propertycellcheckbox';
			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = checkboxId;
			checkbox.title = 'Check this box to include ' + property.name + ' in the trade.';
			checkboxCell.appendChild(checkbox);

			var colorCell = row.insertCell();
			colorCell.className = 'propertycellcolor';
			colorCell.style.backgroundColor = property.color || 'white';
			colorCell.style.borderColor = property.groupNumber === 1 || property.groupNumber === 2 ? 'grey' : (property.color || 'grey');
			colorCell.onmouseover = function() { global.showdeed(propertyIndex); };
			colorCell.onmouseout = global.hidedeed;

			var nameCell = row.insertCell();
			nameCell.className = 'propertycellname';
			nameCell.textContent = property.name;
			if (property.mortgage) {
				nameCell.title = 'Mortgaged';
				nameCell.style.color = 'grey';
			}

			row.onclick = function(event) {
				if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
				setButtons(true, false);
			};
		}

		for (var i = 0; i < 40; i++) {
			var property = squares[i];
			if (!property || !property.groupNumber || property.owner === 0) continue;
			var group = property.group || [];
			if (property.house > 0 || group.some(function(index) { return squares[index].house > 0; })) continue;
			if (property.owner === initiator.index) addRow(leftTable, i, property, 'tradeleftcheckbox' + i);
			else if (property.owner === recipient.index) addRow(rightTable, i, property, 'traderightcheckbox' + i);
		}

		function addJailCard(table, player, propertyIndex, checkboxId) {
			var row = table.insertRow();
			var checkboxCell = row.insertCell();
			checkboxCell.className = 'propertycellcheckbox';
			var checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.id = checkboxId;
			checkbox.title = 'Check this box to include this Get Out of Jail Free card.';
			checkboxCell.appendChild(checkbox);
			var colorCell = row.insertCell();
			colorCell.className = 'propertycellcolor';
			colorCell.style.backgroundColor = 'white';
			colorCell.style.borderColor = 'grey';
			var nameCell = row.insertCell();
			nameCell.className = 'propertycellname';
			nameCell.textContent = 'Get Out of Jail Free Card';
			row.onclick = function(event) {
				if (event.target !== checkbox) checkbox.checked = !checkbox.checked;
				setButtons(true, false);
			};
		}

		if (initiator.communityChestJailCard) addJailCard(leftTable, initiator, 40, 'tradeleftcheckbox40');
		else if (recipient.communityChestJailCard) addJailCard(rightTable, recipient, 40, 'traderightcheckbox40');
		if (initiator.chanceJailCard) addJailCard(leftTable, initiator, 41, 'tradeleftcheckbox41');
		else if (recipient.chanceJailCard) addJailCard(rightTable, recipient, 41, 'traderightcheckbox41');

		if (leftTable.rows.length) leftProperties.appendChild(leftTable);
		else leftProperties.textContent = initiator.name + ' has no properties to trade.';
		if (rightTable.rows.length) rightProperties.appendChild(rightTable);
		else rightProperties.textContent = recipient.name + ' has no properties to trade.';

		document.getElementById('trade-leftp-name').textContent = initiator.name;
		var rightName = document.getElementById('trade-rightp-name');
		rightName.textContent = '';
		if (allowRecipientToBeChanged && playerCount > 2) {
			var select = document.createElement('select');
			for (var playerIndex = 1; playerIndex <= playerCount; playerIndex++) {
				if (playerIndex === initiator.index) continue;
				var option = document.createElement('option');
				option.value = playerIndex;
				option.textContent = players[playerIndex].name;
				option.style.color = players[playerIndex].color;
				option.selected = playerIndex === recipient.index;
				select.appendChild(option);
			}
			select.title = 'Select a player to trade with.';
			select.onchange = function() { resetTrade(state, initiator, players[parseInt(this.value, 10)], true, gameState); };
			rightName.appendChild(select);
		} else {
			rightName.textContent = recipient.name;
		}

		document.getElementById('trade-leftp-money').value = '0';
		document.getElementById('trade-rightp-money').value = '0';
		setButtons(true, false);
	}

	function readTrade(state) {
		var properties = new Array(40);
		for (var i = 0; i < 40; i++) {
			var offered = document.getElementById('tradeleftcheckbox' + i);
			var requested = document.getElementById('traderightcheckbox' + i);
			properties[i] = offered && offered.checked ? 1 : (requested && requested.checked ? -1 : 0);
		}
		function cardValue(leftId, rightId) {
			var left = document.getElementById(leftId);
			var right = document.getElementById(rightId);
			return left && left.checked ? 1 : (right && right.checked ? -1 : 0);
		}
		var money = (parseInt(document.getElementById('trade-leftp-money').value, 10) || 0) -
			(parseInt(document.getElementById('trade-rightp-money').value, 10) || 0);
		return new global.Trade(state.initiator, state.recipient, money, properties,
			cardValue('tradeleftcheckbox40', 'traderightcheckbox40'),
			cardValue('tradeleftcheckbox41', 'traderightcheckbox41'));
	}

	function writeTrade(state, trade, gameState) {
		resetTrade(state, trade.getInitiator(), trade.getRecipient(), false, gameState);
		for (var i = 0; i < 40; i++) {
			var left = document.getElementById('tradeleftcheckbox' + i);
			var right = document.getElementById('traderightcheckbox' + i);
			if (left) left.checked = trade.getProperty(i) === 1;
			if (right) right.checked = trade.getProperty(i) === -1;
		}
		[['40', trade.getCommunityChestJailCard()], ['41', trade.getChanceJailCard()]].forEach(function(entry) {
			var left = document.getElementById('tradeleftcheckbox' + entry[0]);
			var right = document.getElementById('traderightcheckbox' + entry[0]);
			if (left) left.checked = entry[1] === 1;
			if (right) right.checked = entry[1] === -1;
		});
		if (trade.getMoney() > 0) document.getElementById('trade-leftp-money').value = String(trade.getMoney());
		else document.getElementById('trade-rightp-money').value = String(-trade.getMoney());
	}

	function readMoneyFields() {
		if (typeof document === 'undefined') return { left: '0', right: '0' };
		return {
			left: document.getElementById('trade-leftp-money').value,
			right: document.getElementById('trade-rightp-money').value
		};
	}

	function setMoneyError(side, message) {
		var input = document.getElementById(side === 'left' ? 'trade-leftp-money' : 'trade-rightp-money');
		if (!input) return;
		input.value = message;
		input.style.color = 'red';
	}

	function formatTradeResult(label, trade, squares) {
		squares = squares || global.square;
		var offered = [];
		var requested = [];
		for (var i = 0; i < 40; i++) {
			if (trade.getProperty(i) === 1) offered.push(UIHtml.escapeHTML(squares[i].name));
			else if (trade.getProperty(i) === -1) requested.push(UIHtml.escapeHTML(squares[i].name));
		}
		if (trade.getCommunityChestJailCard() === 1 || trade.getChanceJailCard() === 1) offered.push('Get Out of Jail Free card');
		if (trade.getCommunityChestJailCard() === -1 || trade.getChanceJailCard() === -1) requested.push('Get Out of Jail Free card');
		var money = trade.getMoney();
		return UIHtml.escapeHTML(label) + ": <table class='trade-summary'><tr><th>" + UIHtml.escapeHTML(trade.getInitiator().name) + " gives</th><th>" + UIHtml.escapeHTML(trade.getRecipient().name) + " gives</th></tr><tr><td>" + (offered.join(', ') || 'Nothing') + (money > 0 ? ' and $' + money : '') + "</td><td>" + (requested.join(', ') || 'Nothing') + (money < 0 ? ' and $' + (-money) : '') + '</td></tr></table>';
	}

	function initializeInputHandlers() {
		['trade-leftp-money', 'trade-rightp-money'].forEach(function(id) {
			var input = document.getElementById(id);
			if (!input) return;
			input.onkeydown = function(event) {
				var key = event.keyCode;
				if (key === 13) return false;
				if (key === 8 || key === 9 || key === 46 || (key >= 35 && key <= 40) || event.ctrlKey) return true;
				return !event.shiftKey && ((key >= 48 && key <= 57) || (key >= 96 && key <= 105));
			};
			input.onfocus = function() {
				this.style.color = 'black';
				if (isNaN(this.value) || this.value === '0') this.value = '';
			};
			input.onchange = function() {
				setButtons(true, false);
				if (isNaN(this.value)) {
					this.value = 'This value must be a number.';
					this.style.color = 'red';
					return false;
				}
				var amount = Math.round(this.value) || 0;
				if (amount < 0) {
					this.value = 'This value must be greater than 0.';
					this.style.color = 'red';
					return false;
				}
				this.value = amount;
				return true;
			};
		});
	}

	var TradeView = {
		initializeInputHandlers: initializeInputHandlers,
		reset: resetTrade,
		read: readTrade,
		write: writeTrade,
		formatResult: formatTradeResult,
		setButtons: setButtons,
		readMoneyFields: readMoneyFields,
		setMoneyError: setMoneyError
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = TradeView;
	global.TradeView = TradeView;
})(typeof window !== 'undefined' ? window : globalThis);