(function(global) {
	'use strict';

	function createState(overrides) {
		return Object.assign({
			player: [],
			square: [],
			communityChestCards: [],
			chanceCards: [],
			playersGame: [],
			pcount: 0,
			turn: 0,
			doublecount: 0,
			pendingAuction: -1,
			auctionEnabled: true,
			freeParkingTaxes: true,
			freeParkingPot: 0,
			playerOverlays: [],
			lastKnownPosition: [],
			lastKnownJail: [],
			nextMoveDirection: 1,
			lastGamePlayerCount: 2
		}, overrides || {});
	}

	var GameStateContext = {
		createState: createState
	};

	global.GameStateContext = GameStateContext;
	if (typeof module !== 'undefined' && module.exports) module.exports = GameStateContext;
})(typeof window !== 'undefined' ? window : globalThis);