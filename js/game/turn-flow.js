(function(global) {
	'use strict';

	var turnFlow = global.TurnFlow;
	if (!turnFlow && typeof module !== 'undefined' && module.exports) {
		turnFlow = require('./turn-flow-explicit');
	}
	if (turnFlow) global.TurnFlow = turnFlow;
	if (typeof module !== 'undefined' && module.exports) module.exports = turnFlow;
})(typeof window !== 'undefined' ? window : globalThis);
