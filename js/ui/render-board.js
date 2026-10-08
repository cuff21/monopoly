// Board rendering: player token positions and the sliding-overlay move animation.

async function updatePosition(gameInstance) {
	if (gameInstance && gameInstance.ui && gameInstance.ui.isHeadless) return Promise.resolve();
	if (!gameInstance && typeof game !== 'undefined' && game && game.ui && game.ui.isHeadless) return Promise.resolve();

	var gameState = gameInstance && gameInstance.state;
	var players = gameState ? gameState.player : player;
	var playerCount = gameState ? gameState.pcount : pcount;
	var currentTurn = gameState ? gameState.turn : turn;
	var previousPositions = gameState ? (gameState.lastKnownPosition || (gameState.lastKnownPosition = [])) : lastKnownPosition;
	var previousJails = gameState ? (gameState.lastKnownJail || (gameState.lastKnownJail = [])) : lastKnownJail;
	var moveDirection = gameState ? (gameState.nextMoveDirection || 1) : nextMoveDirection;
	var movers = [];

	for (var i = 1; i <= playerCount; i++) {
		var currentPlayer = players[i];
		var previousPosition = previousPositions[i];
		var wasJailed = previousJails[i];
		if (previousPosition !== undefined && !wasJailed && currentPlayer.jail) {
			movers.push({ index: i, toJail: true });
		} else if (previousPosition !== undefined && !wasJailed && !currentPlayer.jail && previousPosition !== currentPlayer.position) {
			movers.push({ index: i, fromIndex: previousPosition, toIndex: currentPlayer.position, direction: moveDirection });
			if (gameState) gameState.nextMoveDirection = 1;
			else nextMoveDirection = 1;
			moveDirection = 1;
		}
	}

	document.getElementById("jail").style.border = "1px solid black";
	document.getElementById("jailpositionholder").innerHTML = "";
	for (var i = 0; i < 40; i++) {
		document.getElementById("cell" + i).style.border = "1px solid black";
		document.getElementById("cell" + i + "positionholder").innerHTML = "";
	}

	var left, top;
	for (var x = 0; x < 40; x++) {
		left = 0;
		top = 0;
		for (var y = currentTurn; y <= playerCount; y++) {
			if (players[y].position == x && !players[y].jail) {
				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + y + "' title='" + players[y].name + "' style='background-color: " + players[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) { left = 0; top = 12; } else left += 12;
			}
		}
		for (var y = 1; y < currentTurn; y++) {
			if (players[y].position == x && !players[y].jail) {
				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + y + "' title='" + players[y].name + "' style='background-color: " + players[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) { left = 0; top = 12; } else left += 12;
			}
		}
	}

	left = 0;
	top = 53;
	for (var i = currentTurn; i <= playerCount; i++) {
		if (players[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + i + "' title='" + players[i].name + "' style='background-color: " + players[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) { left = 0; top = 41; } else left += 12;
		}
	}
	for (var i = 1; i < currentTurn; i++) {
		if (players[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + i + "' title='" + players[i].name + "' style='background-color: " + players[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) { left = 0; top = 41; } else left += 12;
		}
	}

	var currentPlayer = players[currentTurn];
	if (currentPlayer.jail) document.getElementById("jail").style.border = "1px solid " + currentPlayer.color;
	else document.getElementById("cell" + currentPlayer.position).style.border = "1px solid " + currentPlayer.color;

	var movingIndexes = movers.map(function(move) { return move.index; });
	for (var i = 1; i <= playerCount; i++) {
		if (movingIndexes.indexOf(i) === -1) snapOverlay(i, gameState);
	}
	var animations = movers.map(function(move) {
		return move.toJail
			? animateOverlayToJail(move.index, gameState)
			: animateOverlayMove(move.index, move.fromIndex, move.toIndex, move.direction, gameState);
	});
	if (animations.length > 0) await Promise.all(animations);
	for (var i = 1; i <= playerCount; i++) {
		previousPositions[i] = players[i].position;
		previousJails[i] = players[i].jail;
	}
}

function getCellRect(index) {
	return document.getElementById("cell" + index).getBoundingClientRect();
}

var boardCorners = [0, 10, 20, 30];

// Include crossed corners so long moves follow the board path rather than cutting across it.
function buildWaypointIndexes(fromIndex, toIndex, direction) {
	var distance = direction === 1
		? ((toIndex - fromIndex) % 40 + 40) % 40
		: ((fromIndex - toIndex) % 40 + 40) % 40;
	var waypoints = [];
	for (var step = 1; step < distance; step++) {
		var index = ((fromIndex + direction * step) % 40 + 40) % 40;
		if (boardCorners.indexOf(index) !== -1) waypoints.push(index);
	}
	waypoints.push(toIndex);
	return waypoints;
}

// Overlay state belongs to the supplied Game; legacy browser startup uses the globals.
function getOrCreateOverlay(i, gameState) {
	var overlays = gameState ? (gameState.playerOverlays || (gameState.playerOverlays = [])) : playerOverlays;
	var players = gameState ? gameState.player : player;
	var overlay = overlays[i];
	if (!overlay) {
		overlay = document.createElement("div");
		overlay.className = "cell-position token-overlay";
		document.body.appendChild(overlay);
		overlays[i] = overlay;
	}
	overlay.style.backgroundColor = players[i].color;
	return overlay;
}

function setTokenOverlaysVisible(visible, gameInstance) {
	var overlays = gameInstance && gameInstance.state ? gameInstance.state.playerOverlays || [] : playerOverlays;
	for (var i = 0; i < overlays.length; i++) {
		if (overlays[i]) overlays[i].style.display = visible ? "" : "none";
	}
}

function resetTokenOverlays() {
	for (var i = 0; i < playerOverlays.length; i++) {
		if (playerOverlays[i] && playerOverlays[i].parentNode) playerOverlays[i].parentNode.removeChild(playerOverlays[i]);
	}
	playerOverlays.length = 0;
}

function getRealTokenRect(i) {
	var el = document.getElementById("playertoken" + i);
	return el ? el.getBoundingClientRect() : null;
}

function toPagePosition(rect) {
	return { left: rect.left + window.scrollX, top: rect.top + window.scrollY };
}

// Snap non-movers to their rendered token, falling back to the state-owned player position.
function snapOverlay(i, gameState) {
	var rect = getRealTokenRect(i) || getFallbackRect(i, gameState);
	if (!rect) return;
	var overlay = getOrCreateOverlay(i, gameState);
	var pos = toPagePosition(rect);
	overlay.style.transition = "none";
	overlay.style.left = pos.left + "px";
	overlay.style.top = pos.top + "px";
	void overlay.offsetHeight;
}

function getFallbackRect(i, gameState) {
	var players = gameState ? gameState.player : player;
	var p = players[i];
	if (!p) return null;
	return p.jail ? document.getElementById("jail").getBoundingClientRect() : getCellRect(p.position);
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

async function animateOverlayMove(i, fromIndex, toIndex, direction, gameState) {
	var overlay = getOrCreateOverlay(i, gameState);
	var waypoints = buildWaypointIndexes(fromIndex, toIndex, direction);
	var currentRect = getCellRect(fromIndex);
	var currentPos = toPagePosition(currentRect);
	overlay.style.transition = "none";
	overlay.style.left = currentPos.left + "px";
	overlay.style.top = currentPos.top + "px";
	void overlay.offsetHeight;
	for (var w = 0; w < waypoints.length; w++) {
		var isLastWaypoint = w === waypoints.length - 1;
		var waypointCellRect = getCellRect(waypoints[w]);
		var nextRect = isLastWaypoint ? (getRealTokenRect(i) || waypointCellRect) : waypointCellRect;
		var sameRow = Math.round(currentRect.top) === Math.round(waypointCellRect.top);
		var prop = sameRow ? "left" : "top";
		var nextPos = toPagePosition(nextRect);
		var value = (sameRow ? nextPos.left : nextPos.top) + "px";
		await slideOverlay(overlay, { [prop]: value }, 125);
		currentRect = waypointCellRect;
	}
	await sleep(250);
}

async function animateOverlayToJail(i, gameState) {
	var overlay = getOrCreateOverlay(i, gameState);
	var target = getRealTokenRect(i) || document.getElementById("jail").getBoundingClientRect();
	var pos = toPagePosition(target);
	await slideOverlay(overlay, { left: pos.left + "px", top: pos.top + "px" }, 250);
	await sleep(250);
}

if (typeof module !== 'undefined' && module.exports) {
	module.exports = { updatePosition: updatePosition, setTokenOverlaysVisible: setTokenOverlaysVisible };
}
