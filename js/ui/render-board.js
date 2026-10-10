// Snapshot synchronization and explicit, serialized movement in board-local coordinates.
(function(global) {
    'use strict';
    var BoardView = global.BoardView || (typeof module !== 'undefined' && module.exports ? require('./board-view').BoardView : null);
    function localPosition(view, node) {
        var rect = node.getBoundingClientRect(), root = view.layer.getBoundingClientRect();
        return { left: rect.left - root.left, top: rect.top - root.top };
    }
    function place(token, point) { token.style.left = point.left + 'px'; token.style.top = point.top + 'px'; }
    BoardView.prototype.renderPositions = function(movingId, movement) {
        if (this.disposed) return;
        if (!movement && this.activeMovement) {
            movement = this.activeMovement; movingId = movement.playerId;
        }
        var view = this, state = this.game.state, players = state.player.slice(1, state.pcount + 1).filter(Boolean);
        var current = state.player[state.turn];
        if (current && players.includes(current)) players = players.slice(players.indexOf(current)).concat(players.slice(0, players.indexOf(current)));
        var counts = new Map(), active = new Set(players.map(function(p) { return p.playerId; }));
        this.cells.forEach(function(cell) { cell.style.borderColor = '#222'; cell.querySelector('.cell-position-holder').replaceChildren(); });
        var jail = this.surface.querySelector('#jail'), jailHolder = this.surface.querySelector('#jailpositionholder');
        if (jail) jail.style.borderColor = '#222';
        if (jailHolder) jailHolder.replaceChildren();
        this.tokens.clear();
        this.overlays.forEach(function(token, id) { if (!active.has(id)) { token.remove(); view.overlays.delete(id); } });
        players.forEach(function(player) {
            var squareId = movement && player.playerId === movingId ? movement.toSquareId : player.squareId;
            var jailed = movement && player.playerId === movingId ? movement.toJail : player.jail;
            var cell = view.cells.get(squareId);
            if (!cell) return;
            var holder = jailed ? jailHolder : cell.querySelector('.cell-position-holder');
            if (!holder) return;
            var index = counts.get(holder) || 0; counts.set(holder, index + 1);
            var slot = document.createElement('div'); slot.className = 'cell-position player-token';
            slot.id = 'token-' + player.playerId; slot.dataset.playerId = player.playerId; slot.title = player.name;
            slot.style.left = (index % 4 * 12) + 'px';
            slot.style.top = (jailed ? 53 - Math.floor(index / 4) * 12 : Math.floor(index / 4) * 12) + 'px';
            holder.appendChild(slot); view.tokens.set(player.playerId, slot);
            var overlay = view.overlays.get(player.playerId);
            if (!overlay) {
                overlay = document.createElement('div'); overlay.className = 'cell-position token-overlay';
                overlay.dataset.playerId = player.playerId; view.layer.appendChild(overlay); view.overlays.set(player.playerId, overlay);
            }
            overlay.style.backgroundColor = player.color; overlay.title = player.name;
            if (player.playerId !== movingId) { overlay.style.transition = 'none'; place(overlay, localPosition(view, slot)); }
            if (player === current) (jailed && jail ? jail : cell).style.borderColor = player.color;
        });
    };
    // Preserve direction changes, repeated visits, and complete laps.
    function pathBends(points) {
        if (points.length < 3) return points.slice(1);
        var result = [];
        for (var i = 1; i < points.length - 1; i++) {
            var a = points[i - 1], b = points[i], c = points[i + 1];
            var dx = b.left - a.left, dy = b.top - a.top, nx = c.left - b.left, ny = c.top - b.top;
            if (Math.abs(dx * ny - dy * nx) > 0.01 || dx * nx + dy * ny <= 0) result.push(b);
        }
        result.push(points[points.length - 1]); return result;
    }
    BoardView.prototype.wait = function(ms, token, point) {
        var view = this;
        return new Promise(function(resolve) {
            var timer;
            function finish() { clearTimeout(timer); view.cancellations.delete(finish); resolve(); }
            view.cancellations.add(finish);
            if (token && point) {
                token.style.transition = 'left ' + ms + 'ms linear, top ' + ms + 'ms linear';
                void token.offsetHeight; place(token, point);
            }
            timer = setTimeout(finish, ms);
        });
    };
    BoardView.prototype.animateMovement = function(movement) {
        var view = this, generation = this.generation;
        var next = this.queue.then(async function() {
            if (view.disposed || generation !== view.generation) return;
            var overlay = view.overlays.get(movement.playerId), originCell = view.cells.get(movement.fromSquareId);
            var direct = movement.fromJail || movement.toJail;
            // Match master's true departure point: plain cell geometry for board
            // travel, actual token geometry only for direct jail transfers.
            var start = direct && overlay ? { left: parseFloat(overlay.style.left), top: parseFloat(overlay.style.top) }
                : originCell ? localPosition(view, originCell) : null;
            view.activeMovement = movement;
            try {
                view.renderPositions(movement.playerId, movement);
                overlay = view.overlays.get(movement.playerId);
                var targetSlot = view.tokens.get(movement.playerId);
                if (!overlay || !targetSlot) return;
                var target = localPosition(view, targetSlot);
                // Board movement communicates the route taken. Keep master's
                // animation even when decorative effects use reduced motion.
                if (!start || !Number.isFinite(start.left) || !Number.isFinite(start.top)) {
                    overlay.style.transition = 'none'; place(overlay, target); return;
                }
                overlay.style.transition = 'none'; place(overlay, start);
                void overlay.offsetHeight;
                var points = [start];
                if (!direct && !movement.traversedIds.length) { place(overlay, target); return; }
                if (!direct && originCell) {
                    movement.traversedIds.forEach(function(id) {
                        var cell = view.cells.get(id);
                        if (cell) points.push(localPosition(view, cell));
                    });
                }
                if (direct || points.length === 1) points.push(target);
                var stops = direct ? [target] : pathBends(points), current = start;
                for (var i = 0; i < stops.length; i++) {
                    if (generation !== view.generation || view.disposed) return;
                    var cellPoint = stops[i], point = cellPoint;
                    if (!direct && view.perimeter) {
                        // Use cell rows to choose the axis, never the destination's
                        // border/stacking offsets. Only the final leg targets a slot.
                        var horizontal = Math.round(current.top) === Math.round(cellPoint.top);
                        var destination = i === stops.length - 1 ? target : cellPoint;
                        point = horizontal ? { left: destination.left, top: current.top }
                            : { left: current.left, top: destination.top };
                    }
                    await view.wait(direct ? 250 : 125, overlay, point);
                    current = cellPoint;
                }
                if (generation !== view.generation || view.disposed) return;
                await view.wait(250);
                if (generation !== view.generation || view.disposed) return;
                overlay.style.transition = 'none'; place(overlay, target);
            } finally {
                if (view.activeMovement === movement) view.activeMovement = null;
            }
        });
        this.queue = next.catch(function() {}); return next;
    };
    function updatePosition(game) {
        if (!game || !game.state) throw new TypeError('Board rendering requires its owning Game.');
        if (game.ui && !game.ui.isHeadless && game.ui.boardView) game.ui.boardView.renderPositions();
        return Promise.resolve();
    }
    function setTokenOverlaysVisible(visible, game) {
        var view = game && game.ui && game.ui.boardView;
        if (view) view.layer.hidden = !visible;
    }
    function resetTokenOverlays(game) {
        var view = game && game.ui && game.ui.boardView;
        if (view) view.resetTokens();
    }
    function buildWaypointSquareIds(fromId, toId, direction, board) {
        if (!board || !board.squaresById[fromId] || !board.squaresById[toId]) return [];
        var ids = [], cursor = fromId;
        for (var n = 0; n < Object.keys(board.squaresById).length && cursor !== toId; n++) {
            cursor = board.squaresById[cursor][direction === 1 ? 'nextId' : 'previousId'];
            if (!board.squaresById[cursor]) throw new RangeError('Unknown square ID: ' + cursor);
            ids.push(cursor);
        }
        return ids;
    }
    global.updatePosition = updatePosition; global.setTokenOverlaysVisible = setTokenOverlaysVisible; global.resetTokenOverlays = resetTokenOverlays;
    if (typeof module !== 'undefined' && module.exports) module.exports = { updatePosition: updatePosition, setTokenOverlaysVisible: setTokenOverlaysVisible, resetTokenOverlays: resetTokenOverlays, buildWaypointSquareIds: buildWaypointSquareIds, pathBends: pathBends };
})(typeof window !== 'undefined' ? window : globalThis);
