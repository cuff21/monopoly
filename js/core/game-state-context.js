(function(global) {
	'use strict';

	var BANK_ID = 'bank';

	function createSquareStateById(board) {
		var squareStateById = {};
		Object.keys(board.squaresById).forEach(function(squareId) {
			squareStateById[squareId] = {
				ownerId: null,
				mortgage: false,
				house: 0,
				hotel: 0,
				landcount: 0
			};
		});
		return squareStateById;
	}

	function initializeBoardState(state, board, editionId) {
		state.board = board;
		state.editionId = editionId || board.editionId;
		state.squareStateById = createSquareStateById(board);
		return state;
	}

	function getSquareState(state, squareId) {
		if (!state || !state.squareStateById || !Object.prototype.hasOwnProperty.call(state.squareStateById, squareId)) {
			throw new RangeError('Unknown square ID: ' + squareId);
		}
		return state.squareStateById[squareId];
	}

	function getActivePlayers(state) {
		var players;
		if (Array.isArray(state.players) && (state.players.length > 0 || !Array.isArray(state.player))) {
			players = state.players;
		} else if (Array.isArray(state.player)) {
			var end = Number.isInteger(state.pcount) ? state.pcount + 1 : state.player.length;
			players = state.player.slice(1, end);
		} else {
			players = [];
		}
		return players.filter(function(player) {
			return player && player.active !== false && player.eliminated !== true;
		});
	}

	function getPlayerById(state, playerId) {
		var player = getActivePlayers(state).filter(function(candidate) {
			return candidate.playerId === playerId;
		})[0];
		if (!player) throw new RangeError('Unknown active player ID: ' + playerId);
		return player;
	}

	function getPlayerAtSeat(state, originalSeatOrdinal) {
		if (!Number.isInteger(originalSeatOrdinal) || originalSeatOrdinal < 1) {
			throw new RangeError('Original seat ordinal must be a positive integer.');
		}
		return getPlayerById(state, 'player-' + originalSeatOrdinal);
	}

	function setSquareOwner(state, squareId, ownerId) {
		if (ownerId !== null) {
			if (ownerId === BANK_ID) throw new RangeError('The bank cannot own a square.');
			getPlayerById(state, ownerId);
		}
		var squareState = getSquareState(state, squareId);
		squareState.ownerId = ownerId;
		return squareState;
	}

	function assignPlayerId(player, originalSeatOrdinal) {
		if (!Number.isInteger(originalSeatOrdinal) || originalSeatOrdinal < 1) {
			throw new RangeError('Original seat ordinal must be a positive integer.');
		}
		var playerId = 'player-' + originalSeatOrdinal;
		if (player.playerId !== undefined && player.playerId !== playerId) {
			throw new RangeError('Player identity cannot be changed from ' + player.playerId + ' to ' + playerId + '.');
		}
		if (player.playerId === undefined) {
			Object.defineProperty(player, 'playerId', {
				value: playerId,
				enumerable: true,
				writable: false,
				configurable: false
			});
		}
		return playerId;
	}

	// Structured Game-state API contract (introduced in Phase 2):
	// getSquareState(state, squareId), setSquareOwner(state, squareId, ownerId),
	// getPlayerById(state, playerId), and getPlayerAtSeat(state, originalSeatOrdinal).
	// Each Game owns squareStateById with ownerId=null, mortgage=false, house=0, hotel=0,
	// and landcount=0 initially. BANK_ID is "bank" for creditor references only; null means
	// unowned or bank-held, and square owners are null or active player IDs. Unknown IDs throw
	// RangeError. Player IDs retain their original one-based seat ordinal after elimination.
	// Movement results contain destination ID, ordered traversed IDs, and crossedStart.
	// Landing/card handlers receive { game, state, playerId, squareId, ui }; UI remains outside
	// core rules.

	function createState(overrides) {
		return Object.assign({
			player: [],
			square: [],
			board: null,
			editionId: null,
			squareStateById: {},
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
		BANK_ID: BANK_ID,
		createState: createState,
		createSquareStateById: createSquareStateById,
		initializeBoardState: initializeBoardState,
		getSquareState: getSquareState,
		setSquareOwner: setSquareOwner,
		getPlayerById: getPlayerById,
		getPlayerAtSeat: getPlayerAtSeat,
		assignPlayerId: assignPlayerId
	};

	global.GameStateContext = GameStateContext;
	if (typeof module !== 'undefined' && module.exports) module.exports = GameStateContext;
})(typeof window !== 'undefined' ? window : globalThis);