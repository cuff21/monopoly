(function(global) {
	'use strict';

	var BANK_ID = 'bank';
	var getSquare = global.getSquare;
	var getGroup = global.getGroup;
	var getGroupSquareIds = global.getGroupSquareIds;
	var getSquareIds = global.getSquareIds;

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

	function getDecisionView(state) {
		if (!state || !state.board || !state.squareStateById) throw new TypeError('A structured Game state is required.');
		var GameStateContext = api;
		return Object.freeze({
			board: state.board,
			editionId: state.editionId,
			getSquare: function(squareId) { return getSquare(state.board, squareId); },
			getSquareState: function(squareId) { return getSquareState(state, squareId); },
			getGroup: function(groupId) { return getGroup(state.board, groupId); },
			getGroupSquareIds: function(groupId) { return getGroupSquareIds(state.board, groupId); },
			getPlayer: function(playerId) { return GameStateContext.getPlayerById(state, playerId); },
			getPlayers: function() { return GameStateContext.getActivePlayers(state).slice(); },
			getSquareOwner: function(squareId) { return getSquareState(state, squareId).ownerId; },
			getSquareIds: function() { return getSquareIds(state.board); }
		});
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

	function encodeCardId(deckId, cardIndex) {
		if (typeof deckId !== 'string' || !deckId || !Number.isInteger(cardIndex) || cardIndex < 0) {
			throw new RangeError('Card identity requires a deck ID and nonnegative integer card index.');
		}
		return encodeURIComponent(deckId) + ':' + cardIndex;
	}

	function parseCardId(cardId) {
		if (typeof cardId !== 'string') throw new RangeError('Invalid held card identity.');
		var separator = cardId.lastIndexOf(':');
		if (separator <= 0) throw new RangeError('Invalid held card identity.');
		var deckId, cardIndex;
		try {
			deckId = decodeURIComponent(cardId.slice(0, separator));
			cardIndex = Number(cardId.slice(separator + 1));
		} catch (error) {
			throw new RangeError('Invalid held card identity.');
		}
		if (!deckId || !Number.isInteger(cardIndex) || cardIndex < 0) throw new RangeError('Invalid held card identity.');
		return { deckId: deckId, cardIndex: cardIndex };
	}

	function returnHeldCard(state, cardId) {
		var identity = parseCardId(cardId), decks = state && state.cardDecks;
		var deck = decks && Object.prototype.hasOwnProperty.call(decks, identity.deckId) ? decks[identity.deckId] : null;
		if (!deck || !Array.isArray(deck.cards) || !deck.cards[identity.cardIndex] || !deck.cards[identity.cardIndex].keepable || !Array.isArray(deck.order)) {
			throw new RangeError('Held card does not identify a keepable card in a Game deck.');
		}
		if (deck.order.indexOf(identity.cardIndex) !== -1) throw new RangeError('Held card is already present in its deck.');
		var insertionIndex = Number.isInteger(deck.index) ? Math.max(0, Math.min(deck.index, deck.order.length)) : deck.order.length;
		deck.order.splice(insertionIndex, 0, identity.cardIndex);
		deck.index = insertionIndex + 1;
		if (deck.index >= deck.order.length) deck.index = 0;
		return identity;
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
	// encodeCardId/parseCardId preserve a held card's source deck and card index;
	// returnHeldCard validates that identity and restores the physical card to that Game's deck.
	// Landing/card handlers receive { game, state, playerId, squareId, ui }; UI remains outside
	// core rules.

	function createState(overrides) {
		return Object.assign({
			player: [],
			board: null,
			editionId: null,
			squareStateById: {},
			cardDecks: {},
			playersGame: [],
			pcount: 0,
			turn: 0,
			doublecount: 0,
			pendingAuction: -1,
			auctionEnabled: true,
			freeParkingTaxes: true,
			freeParkingPot: 0,
			playerOverlays: Object.create(null),
			lastKnownSquareByPlayerId: Object.create(null),
			lastKnownJailByPlayerId: Object.create(null),
			nextMoveDirection: 1,
			lastGamePlayerCount: 2
		}, overrides || {});
	}

	var api = {
		BANK_ID: BANK_ID,
		createState: createState,
		createSquareStateById: createSquareStateById,
		initializeBoardState: initializeBoardState,
		getSquareState: getSquareState,
		setSquareOwner: setSquareOwner,
		getPlayerById: getPlayerById,
		getPlayerAtSeat: getPlayerAtSeat,
		getActivePlayers: getActivePlayers,
		getDecisionView: getDecisionView,
		encodeCardId: encodeCardId,
		parseCardId: parseCardId,
		returnHeldCard: returnHeldCard,
		assignPlayerId: assignPlayerId
	};

	global.GameStateContext = api;
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
