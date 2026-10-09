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

	function createSquareViews(state) {
		var board = state.board, ids = [], indexById = Object.create(null), currentId = board.startSquareId;
		for (var i = 0; i < Object.keys(board.squaresById).length; i++) {
			ids.push(currentId); indexById[currentId] = i; currentId = board.squaresById[currentId].nextId;
		}
		return ids.map(function(squareId, index) {
			var square = board.squaresById[squareId], rules = square.rules;
			var group = square.groupId ? board.groupsById[square.groupId] : null;
			var rentRule = !group ? null : square.kind === 'street'
				? { mode: 'colorGroup', monopolyMultiplier: group.rules.monopolyMultiplier }
				: { mode: square.kind === 'utility' ? 'diceMultiplier' : 'ownershipTier', tiers: group.rules.rentTiers };
			var view = {
				index: index, id: squareId, name: square.presentation.label, color: square.presentation.color,
				pricetext: square.presentation.priceText || '', price: rules.purchasePrice, baserent: rules.baseRent,
				rent1: rules.rentTiers[0] || 0, rent2: rules.rentTiers[1] || 0, rent3: rules.rentTiers[2] || 0,
				rent4: rules.rentTiers[3] || 0, rent5: rules.rentTiers[4] || 0, houseprice: rules.houseCost,
				groupNumber: square.groupId || 0,
				group: group ? group.squareIds.map(function(id) { return indexById[id]; }) : [],
				groupProfile: rentRule ? { kind: square.kind, rentRule: rentRule } : null,
				display: { boardName: square.presentation.boardName, tokenImage: square.presentation.tokenImage, rentText: square.presentation.rentText }
			};
			Object.defineProperty(view, 'owner', {
				enumerable: true,
				get: function() {
					var ownerId = state.squareStateById[squareId].ownerId;
					return ownerId === null ? 0 : state.player.findIndex(function(player) { return player && player.playerId === ownerId; });
				},
				set: function(seat) { state.squareStateById[squareId].ownerId = seat ? state.player[seat].playerId : null; }
			});
			['mortgage', 'house', 'hotel', 'landcount'].forEach(function(field) {
				Object.defineProperty(view, field, {
					enumerable: true,
					get: function() { return state.squareStateById[squareId][field]; },
					set: function(value) { state.squareStateById[squareId][field] = value; }
				});
			});
			return view;
		});
	}

	function initializeBoardState(state, board, editionId) {
		state.board = board;
		state.editionId = editionId || board.editionId;
		state.squareStateById = createSquareStateById(board);
		state.square = createSquareViews(state);
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
			square: [],
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
		createSquareViews: createSquareViews,
		initializeBoardState: initializeBoardState,
		getSquareState: getSquareState,
		setSquareOwner: setSquareOwner,
		getPlayerById: getPlayerById,
		getPlayerAtSeat: getPlayerAtSeat,
		encodeCardId: encodeCardId,
		parseCardId: parseCardId,
		returnHeldCard: returnHeldCard,
		assignPlayerId: assignPlayerId
	};

	global.GameStateContext = GameStateContext;
	if (typeof module !== 'undefined' && module.exports) module.exports = GameStateContext;
})(typeof window !== 'undefined' ? window : globalThis);
