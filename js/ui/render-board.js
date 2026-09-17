// Board rendering: player token positions and the sliding-overlay move animation.

async function updatePosition() {
	var movers = [];

	for (var i = 1; i <= pcount; i++) {
		var p = player[i];
		var previousPosition = lastKnownPosition[i];
		var wasJailed = lastKnownJail[i];

		if (previousPosition !== undefined && !wasJailed && p.jail) {
			movers.push({ index: i, toJail: true });
		} else if (previousPosition !== undefined && !wasJailed && !p.jail && previousPosition !== p.position) {
			movers.push({ index: i, fromIndex: previousPosition, toIndex: p.position, direction: nextMoveDirection });
			nextMoveDirection = 1;
		}
	}

	// Reset borders
	document.getElementById("jail").style.border = "1px solid black";
	document.getElementById("jailpositionholder").innerHTML = "";
	for (var i = 0; i < 40; i++) {
		document.getElementById("cell" + i).style.border = "1px solid black";
		document.getElementById("cell" + i + "positionholder").innerHTML = "";

	}

	var sq, left, top;

	for (var x = 0; x < 40; x++) {
		sq = square[x];
		left = 0;
		top = 0;

		for (var y = turn; y <= pcount; y++) {

			if (player[y].position == x && !player[y].jail) {

				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + y + "' title='" + player[y].name + "' style='background-color: " + player[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) {
					left = 0;
					top = 12;
				} else
					left += 12;
			}
		}

		for (var y = 1; y < turn; y++) {

			if (player[y].position == x && !player[y].jail) {
				document.getElementById("cell" + x + "positionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + y + "' title='" + player[y].name + "' style='background-color: " + player[y].color + "; left: " + left + "px; top: " + top + "px;'></div>";
				if (left == 36) {
					left = 0;
					top = 12;
				} else
					left += 12;
			}
		}
	}

	left = 0;
	top = 53;
	for (var i = turn; i <= pcount; i++) {
		if (player[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + i + "' title='" + player[i].name + "' style='background-color: " + player[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";

			if (left === 36) {
				left = 0;
				top = 41;
			} else {
				left += 12;
			}
		}
	}

	for (var i = 1; i < turn; i++) {
		if (player[i].jail) {
			document.getElementById("jailpositionholder").innerHTML += "<div class='cell-position player-token' id='playertoken" + i + "' title='" + player[i].name + "' style='background-color: " + player[i].color + "; left: " + left + "px; top: " + top + "px;'></div>";
			if (left === 36) {
				left = 0;
				top = 41;
			} else
				left += 12;
		}
	}

	p = player[turn];

	if (p.jail) {
		document.getElementById("jail").style.border = "1px solid " + p.color;
	} else {
		document.getElementById("cell" + p.position).style.border = "1px solid " + p.color;
	}

	// Keep every overlay in sync with its (now hidden) real token, snapping non-movers instantly
	// in case another player's move shifted their stacking offset within a shared cell.
	var movingIndexes = movers.map(function(move) { return move.index; });
	for (var i = 1; i <= pcount; i++) {
		if (movingIndexes.indexOf(i) === -1) {
			snapOverlay(i);
		}
	}

	var animations = movers.map(function(move) {
		return move.toJail ? animateOverlayToJail(move.index) : animateOverlayMove(move.index, move.fromIndex, move.toIndex, move.direction);
	});

	if (animations.length > 0) {
		await Promise.all(animations);
	}

	for (var i = 1; i <= pcount; i++) {
		lastKnownPosition[i] = player[i].position;
		lastKnownJail[i] = player[i].jail;
	}
}

function getCellRect(index) {
	return document.getElementById("cell" + index).getBoundingClientRect();
}

// Returns the corner cells crossed when travelling from fromIndex to toIndex in the given
// direction, in order, followed by toIndex - i.e. the full sequence of stops along the board's
// square path. This lets a move that wraps most of the way around the board (e.g. a "advance to"
// card) slide through every side it actually passes over, instead of cutting across the middle.
function buildWaypointIndexes(fromIndex, toIndex, direction) {
	var distance = direction === 1
		? ((toIndex - fromIndex) % 40 + 40) % 40
		: ((fromIndex - toIndex) % 40 + 40) % 40;

	var waypoints = [];
	for (var step = 1; step < distance; step++) {
		var index = ((fromIndex + direction * step) % 40 + 40) % 40;
		if (boardCorners.indexOf(index) !== -1) {
			waypoints.push(index);
		}
	}

	waypoints.push(toIndex);
	return waypoints;
}

function getOrCreateOverlay(i) {
	var overlay = playerOverlays[i];
	if (!overlay) {
		overlay = document.createElement("div");
		overlay.className = "cell-position token-overlay";
		document.body.appendChild(overlay);
		playerOverlays[i] = overlay;
	}
	overlay.style.backgroundColor = player[i].color;
	return overlay;
}

// The real token div is hidden (see .player-token in styles.css) but still rendered by the normal
// instant-render logic, so its rect already accounts for any multi-token stacking within a cell.
function getRealTokenRect(i) {
	var el = document.getElementById("playertoken" + i);
	return el ? el.getBoundingClientRect() : null;
}

// Instantly moves an overlay to match its real token, with no transition/animation. Falls back to
// the player's cell/jail rect if the real token element isn't found, so the overlay never just
// freezes in place (which looked like the token failing to move until the next render).
function snapOverlay(i) {
	var rect = getRealTokenRect(i) || getFallbackRect(i);
	if (!rect) {
		return;
	}

	var overlay = getOrCreateOverlay(i);
	overlay.style.transition = "none";
	overlay.style.left = rect.left + "px";
	overlay.style.top = rect.top + "px";
	void overlay.offsetHeight;
}

// Rect to fall back to when the real (hidden) token element can't be found for some reason.
function getFallbackRect(i) {
	var p = player[i];
	if (!p) {
		return null;
	}
	return p.jail ? document.getElementById("jail").getBoundingClientRect() : getCellRect(p.position);
}

// Transitions an overlay's left/top style(s) to new values and resolves once done.
function slideOverlay(overlay, changes, duration) {
	return new Promise(function(resolve) {
		overlay.style.transition = Object.keys(changes).map(function(prop) {
			return prop + " " + duration + "ms linear";
		}).join(", ");
		void overlay.offsetHeight;

		Object.keys(changes).forEach(function(prop) {
			overlay.style[prop] = changes[prop];
		});

		setTimeout(resolve, duration);
	});
}

// Slides a token's overlay along the board's square path from fromIndex to toIndex, stopping at
// every corner crossed along the way so long moves travel all the way around instead of cutting
// straight across the board.
async function animateOverlayMove(i, fromIndex, toIndex, direction) {
	var overlay = getOrCreateOverlay(i);
	var waypoints = buildWaypointIndexes(fromIndex, toIndex, direction);
	var currentRect = getCellRect(fromIndex);

	// Snap to the true departure point first; the overlay may not have been positioned yet
	// (e.g. its very first animated move), which previously left it stranded off in a corner.
	overlay.style.transition = "none";
	overlay.style.left = currentRect.left + "px";
	overlay.style.top = currentRect.top + "px";
	void overlay.offsetHeight;

	for (var w = 0; w < waypoints.length; w++) {
		var isLastWaypoint = w === waypoints.length - 1;
		// Always use the plain cell rect to decide whether this leg is horizontal or vertical:
		// the real token rect can be a pixel off (its own border/stacking offset), which previously
		// made the last leg on a top/bottom row misdetect as a vertical move and never slide left.
		var waypointCellRect = getCellRect(waypoints[w]);
		// The real token rect should always exist by now, but fall back to the destination
		// cell's rect rather than silently skipping the step and stranding the token mid-path.
		var nextRect = isLastWaypoint ? (getRealTokenRect(i) || waypointCellRect) : waypointCellRect;

		var sameRow = Math.round(currentRect.top) === Math.round(waypointCellRect.top);
		var prop = sameRow ? "left" : "top";
		var value = (sameRow ? nextRect.left : nextRect.top) + "px";

		await slideOverlay(overlay, { [prop]: value }, 125);
		currentRect = waypointCellRect;
	}

	// Brief pause so the arrival is visible even during a quick string of doubles.
	await sleep(100);
}

// Being sent to jail slides the token directly, in a straight line, instead of following the board path.
async function animateOverlayToJail(i) {
	var overlay = getOrCreateOverlay(i);
	var target = getRealTokenRect(i) || document.getElementById("jail").getBoundingClientRect();

	await slideOverlay(overlay, { left: target.left + "px", top: target.top + "px" }, 250);

	// Brief pause so the arrival is visible even during a quick string of doubles.
	await sleep(100);
}
