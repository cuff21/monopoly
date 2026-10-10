// Board rendering: player token positions and the sliding-overlay move animation.

async function updatePosition(gameInstance) {
	if (!gameInstance || !gameInstance.state) throw new TypeError('Board rendering requires its owning Game.');
	if (gameInstance.ui && gameInstance.ui.isHeadless) return Promise.resolve();
	var gameState = gameInstance.state;
	var players = gameState.player;
	var playerCount = gameState.pcount;
	var currentTurn = gameState.turn;
	var board = gameState.board;
	var boardIds = [];
	if (board) {
		var cursor = board.startSquareId;
		for (var boardIndex = 0; boardIndex < Object.keys(board.squaresById).length; boardIndex++) {
			boardIds.push(cursor);
			cursor = board.squaresById[cursor].nextId;
		}
	}
	var previousPositions = gameState.lastKnownSquareByPlayerId || (gameState.lastKnownSquareByPlayerId = Object.create(null));
	var previousJails = gameState.lastKnownJailByPlayerId || (gameState.lastKnownJailByPlayerId = Object.create(null));
	var moveDirection = gameState.nextMoveDirection || 1;
	var movers = [];

	for (var i = 1; i <= playerCount; i++) {
		var currentPlayer = players[i];
		var playerId = currentPlayer.playerId;
		var previousSquareId = previousPositions[playerId];
		var wasJailed = previousJails[playerId];
		if (previousSquareId !== undefined && !wasJailed && currentPlayer.jail) {
			movers.push({ playerId: playerId, toJail: true });
		} else if (previousSquareId !== undefined && !wasJailed && !currentPlayer.jail && previousSquareId !== currentPlayer.squareId) {
			movers.push({ playerId: playerId, fromSquareId: previousPositions[playerId], toSquareId: currentPlayer.squareId, direction: moveDirection });
			gameState.nextMoveDirection = 1;
			moveDirection = 1;
		}
	}

	document.getElementById("jail").style.border = "1px solid black";
	document.getElementById("jailpositionholder").innerHTML = "";
	for (var i = 0; i < boardIds.length; i++) {
		var squareId = boardIds[i];
		var cell = document.getElementById("square-" + squareId);
		var holder = document.getElementById("square-" + squareId + "-tokens");
		if (cell) cell.style.border = "1px solid black";
		if (holder) holder.innerHTML = "";
	}

	var left, top;
	boardIds.forEach(function(squareId) {
		left = 0;
		top = 0;
		for (var y = currentTurn; y <= playerCount; y++) {
			if (players[y].squareId === squareId && !players[y].jail) {
				document.getElementById("square-" + squareId + "-tokens").innerHTML += "<div class='cell-position player-token' id='token-" + players[y].playerId + "' data-player-id='" + players[y].playerId + "' title='" + players[y].name + "' style='background-color: " + players[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) { left = 0; top = 12; } else left += 12;
			}
		}
		for (var y = 1; y < currentTurn; y++) {
			if (players[y].squareId === squareId && !players[y].jail) {
				document.getElementById("square-" + squareId + "-tokens").innerHTML += "<div class='cell-position player-token' id='token-" + players[y].playerId + "' data-player-id='" + players[y].playerId + "' title='" + players[y].name + "' style='background-color: " + players[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) { left = 0; top = 12; } else left += 12;
			}
		}
	});

	left = 0;
	top = 53;
	for (var i = currentTurn; i <= playerCount; i++) {
		if (players[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='token-" + players[i].playerId + "' data-player-id='" + players[i].playerId + "' title='" + players[i].name + "' style='background-color: " + players[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) { left = 0; top = 41; } else left += 12;
		}
	}
	for (var i = 1; i < currentTurn; i++) {
		if (players[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='token-" + players[i].playerId + "' data-player-id='" + players[i].playerId + "' title='" + players[i].name + "' style='background-color: " + players[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) { left = 0; top = 41; } else left += 12;
		}
	}

	var currentPlayer = players[currentTurn];
	if (currentPlayer.jail) document.getElementById("jail").style.border = "1px solid " + currentPlayer.color;
	else if (document.getElementById("square-" + currentPlayer.squareId)) document.getElementById("square-" + currentPlayer.squareId).style.border = "1px solid " + currentPlayer.color;

	var movingPlayerIds = movers.map(function(move) { return move.playerId; });
	for (var i = 1; i <= playerCount; i++) {
		if (movingPlayerIds.indexOf(players[i].playerId) === -1) snapOverlay(players[i].playerId, gameState);
	}
	var animations = movers.map(function(move) {
		return move.toJail
			? animateOverlayToJail(move.playerId, gameState)
			: animateOverlayMove(move.playerId, move.fromSquareId, move.toSquareId, move.direction, gameState, board);
	});
	if (animations.length > 0) await Promise.all(animations);
	for (var i = 1; i <= playerCount; i++) {
		previousPositions[players[i].playerId] = players[i].squareId;
		previousJails[players[i].playerId] = players[i].jail;
	}
}

function getCellRect(squareId) {
	var cell = document.getElementById("square-" + squareId);
	return cell ? cell.getBoundingClientRect() : null;
}

// Include crossed corners so long moves follow the Board traversal rather than cutting across it.
function buildWaypointSquareIds(fromSquareId, toSquareId, direction, board) {
	if (!board || !board.squaresById[fromSquareId] || !board.squaresById[toSquareId]) return [];
	var waypoints = [], cursor = fromSquareId;
	for (var visited = 0; visited < Object.keys(board.squaresById).length && cursor !== toSquareId; visited++) {
		var square = board.squaresById[cursor];
		cursor = direction === 1 ? square.nextId : square.previousId;
		if (!board.squaresById[cursor]) throw new RangeError('Board traversal reached an unknown square ID: ' + cursor);
		waypoints.push(cursor);
	}
	return cursor === toSquareId ? waypoints : [];
}

function getOrCreateOverlay(playerId, gameState) {
	if (!gameState) throw new TypeError('Token overlays require their owning Game state.');
	var overlays = gameState.playerOverlays || (gameState.playerOverlays = Object.create(null));
	var player = globalThis.GameStateContext.getPlayerById(gameState, playerId);
	var overlay = overlays[playerId];
	if (!overlay) {
		overlay = document.createElement("div");
		overlay.className = "cell-position token-overlay";
		overlay.dataset.playerId = playerId;
		document.body.appendChild(overlay);
		overlays[playerId] = overlay;
	}
	overlay.style.backgroundColor = player.color;
	return overlay;
}

function setTokenOverlaysVisible(visible, gameInstance) {
	var overlays = gameInstance && gameInstance.state && gameInstance.state.playerOverlays;
	if (overlays) Object.keys(overlays).forEach(function(playerId) { overlays[playerId].style.display = visible ? "" : "none"; });
}

function resetTokenOverlays(gameInstance) {
	var overlays = gameInstance && gameInstance.state && gameInstance.state.playerOverlays;
	if (!overlays) return;
	Object.keys(overlays).forEach(function(playerId) {
		var overlay = overlays[playerId];
		if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
		delete overlays[playerId];
	});
}

function getRealTokenRect(playerId) {
	var el = document.getElementById("token-" + playerId);
	return el ? el.getBoundingClientRect() : null;
}

function toPagePosition(rect) {
	return { left: rect.left + window.scrollX, top: rect.top + window.scrollY };
}

// Snap non-movers to their rendered token, falling back to the state-owned player position.
function snapOverlay(playerId, gameState) {
	var rect = getRealTokenRect(playerId) || getFallbackRect(playerId, gameState);
	if (!rect) return;
	var overlay = getOrCreateOverlay(playerId, gameState);
	var pos = toPagePosition(rect);
	overlay.style.transition = "none";
	overlay.style.left = pos.left + "px";
	overlay.style.top = pos.top + "px";
	void overlay.offsetHeight;
}

function getFallbackRect(playerId, gameState) {
	var p = gameState && globalThis.GameStateContext.getPlayerById(gameState, playerId);
	if (!p) return null;
	if (p.jail) return document.getElementById("jail").getBoundingClientRect();
	var board = gameState && gameState.board;
	var cursor = board && board.startSquareId;
	for (var index = 0; board && index < Object.keys(board.squaresById).length; index++) {
		if (cursor === p.squareId) return getCellRect(cursor);
		cursor = board.squaresById[cursor].nextId;
	}
	return null;
}

function slideOverlay(overlay, changes, duration) {
	return new Promise(function(resolve) {
		overlay.style.transition = Object.keys(changes).map(function(prop) {
			return prop + " " + duration + "ms linear";
		}).join(", ");
		void overlay.offsetHeight;
		Object.keys(changes).forEach(function(prop) { overlay.style[prop] = changes[prop]; });
		setTimeout(resolve, duration);
	});
}


async function animateOverlayMove(playerId, fromSquareId, toSquareId, direction, gameState, board) {
	var overlay = getOrCreateOverlay(playerId, gameState);
	var waypoints = buildWaypointSquareIds(fromSquareId, toSquareId, direction, board);
	var currentRect = getCellRect(fromSquareId);
	if (!currentRect) return;
	var currentPos = toPagePosition(currentRect);
	overlay.style.transition = "none";
	overlay.style.left = currentPos.left + "px";
	overlay.style.top = currentPos.top + "px";
	void overlay.offsetHeight;
	for (var w = 0; w < waypoints.length; w++) {
		var isLastWaypoint = w === waypoints.length - 1;
		var waypointCellRect = getCellRect(waypoints[w]);
		if (!waypointCellRect) continue;
		var nextRect = isLastWaypoint ? (getRealTokenRect(playerId) || waypointCellRect) : waypointCellRect;
		var nextPos = toPagePosition(nextRect);
		await slideOverlay(overlay, { left: nextPos.left + "px", top: nextPos.top + "px" }, 125);
		currentRect = waypointCellRect;
	}
	await sleep(250);
}

async function animateOverlayToJail(playerId, gameState) {
	var overlay = getOrCreateOverlay(playerId, gameState);
	var target = getRealTokenRect(playerId) || document.getElementById("jail").getBoundingClientRect();
	var pos = toPagePosition(target);
	await slideOverlay(overlay, { left: pos.left + "px", top: pos.top + "px" }, 250);
	await sleep(250);
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { updatePosition: updatePosition, setTokenOverlaysVisible: setTokenOverlaysVisible,
		buildWaypointSquareIds: buildWaypointSquareIds };
}
