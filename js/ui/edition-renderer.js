(function(global) {
	'use strict';

	var UIHtml = global.UIHtml || (typeof module !== 'undefined' && module.exports ? require('./html-escape') : null);

	function renderSquareDisplay(squares) {
		squares.forEach(function(square) {
			var display = square.presentation || square.display || {};
			var nameElement = document.getElementById('square-' + square.id + '-name');
			if (display.boardName && nameElement) nameElement.textContent = display.boardName;

			if (!display.tokenImage) return;
			var tokenElement = document.getElementById('deed-' + square.id + '-token');
			if (!tokenElement) return;

			var image = document.createElement('img');
			image.src = display.tokenImage.src;
			image.height = display.tokenImage.height;
			image.width = display.tokenImage.width;
			image.alt = '';
			tokenElement.appendChild(image);
		});
	}

	function renderSpecialDeedText(groupProfile) {
		var deed = groupProfile.deed;
		if (groupProfile.kind === 'utility') {
			return '<p>If one Utility is owned, rent is ' + UIHtml.escapeHTML(deed.multipliers[0]) + ' times the amount shown on the dice.</p>' +
				'<p>If both Utilities are owned, rent is ' + UIHtml.escapeHTML(deed.multipliers[1]) + ' times the amount shown on the dice.</p>';
		}

		var rows = deed.rents.map(function(rent, index) {
			var label = index === 0 ? 'Rent' : 'If ' + (index + 1) + ' ' + deed.groupName + ' are owned';
			return '<div class="deed-rent-row"><span>' + UIHtml.escapeHTML(label) + '</span><span>$' + UIHtml.escapeHTML(rent) + '</span></div>';
		});
		return '<div class="deed-rent-schedule">' + rows.join('') + '</div>';
	}

	function formatRentText(square, rent) {
		var display = square.presentation || square.display || {};
		var formatter = display.rentText;
		var rentText = typeof formatter === 'function' ? formatter(rent, square)
			: rent && rent.type === 'diceMultiplier' ? rent.multiplier + 'x dice' : '$' + rent;
		return UIHtml.escapeHTML(rentText);
	}

	var EditionRenderer = {
		renderSquareDisplay: renderSquareDisplay,
		renderSpecialDeedText: renderSpecialDeedText,
		formatRentText: formatRentText
	};
	global.EditionRenderer = EditionRenderer;
	if (typeof module !== 'undefined' && module.exports) module.exports = EditionRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
