(function(global) {
	'use strict';

	function escapeHTML(value) {
		return String(value).replace(/[&<>"']/g, function(character) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
		});
	}

	var UIHtml = { escapeHTML: escapeHTML };
	if (typeof module !== 'undefined' && module.exports) module.exports = UIHtml;
	global.UIHtml = UIHtml;
})(typeof window !== 'undefined' ? window : globalThis);