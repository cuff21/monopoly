// Plain DOM view. Board definitions remain immutable; all display state lives here.
(function(global) {
    'use strict';

    function element(tag, className, parent, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        if (parent) parent.appendChild(node);
        return node;
    }

    function traversal(board) {
        var ids = [], id = board.startSquareId;
        for (var i = 0; i < Object.keys(board.squaresById).length; i++) {
            ids.push(id); id = board.squaresById[id].nextId;
        }
        return ids;
    }

    function gridPosition(index) {
        if (index <= 10) return { row: 11, column: 11 - index, side: index % 10 === 0 ? 'corner' : 'bottom' };
        if (index <= 20) return { row: 21 - index, column: 1, side: index === 20 ? 'corner' : 'left' };
        if (index <= 30) return { row: 1, column: index - 19, side: index === 30 ? 'corner' : 'top' };
        return { row: index - 29, column: 11, side: 'right' };
    }

    function resolveIcon(square, board, decks) {
        var presentation = square.presentation;
        var group = square.groupId && board.groupsById[square.groupId];
        var configured = presentation.boardIcon || presentation.tokenImage || (group && group.presentation && (group.presentation.boardIcon || group.presentation.tokenImage));
        if (configured) return typeof configured === 'string' ? configured : configured.src;
        if (square.kind === 'card') return decks[square.deckId] && decks[square.deckId].icon;
        var defaults = { go: 'arrow', jail: 'jake', 'free-parking': 'free_parking', railroad: 'train' };
        // Percentage tax squares have no icon in the original board.
        if (square.kind === 'tax' && !square.rules.taxPercentOfNetWorth) return 'images/tax_icon.png';
        if (square.kind === 'utility') {
            var utilities = traversal(board).filter(function(id) { return board.squaresById[id].kind === 'utility'; });
            return 'images/' + (utilities.indexOf(square.id) === 0 ? 'electric' : 'water') + '_icon.png';
        }
        return defaults[square.kind] ? 'images/' + defaults[square.kind] + '_icon.png' : null;
    }

    function softColor(color) {
        // Match master's translucent property colors, including CSS named colors in NYC.
        var probe = document.createElement('span');
        probe.style.color = color;
        document.body.appendChild(probe);
        var rgb = getComputedStyle(probe).color;
        probe.remove();
        if (rgb === 'rgb(255, 255, 255)') return 'white';
        return rgb.replace('rgb(', 'rgba(').replace(')', ', 0.25)');
    }

    function BoardView(game) {
        this.game = game;
        this.cells = new Map();
        this.overlays = new Map();
        this.tokens = new Map();
        this.queue = Promise.resolve();
        this.generation = 0;
        this.cancellations = new Set();
        this.disposed = false;
    }

    BoardView.prototype.mount = function() {
        var view = this, board = this.game.state.board, decks = this.game.state.cardDecks;
        var oldBoard = document.getElementById('board');
        var shell = document.getElementById('game-display');
        if (!shell) shell = element('div', 'game-display', oldBoard.parentNode);
        shell.id = 'game-display';
        this.shell = shell;
        var scroll = element('div', 'board-scroll', shell);
        scroll.setAttribute('aria-label', 'Game board'); scroll.tabIndex = 0;
        var surface = element('div', 'board-surface', scroll);
        surface.id = 'board'; this.surface = surface;
        surface.style.display = 'none';
        this.perimeter = (board.editionId === 'Classic' || board.editionId === 'NYC') && traversal(board).length === 40;
        surface.classList.add(this.perimeter ? 'board-perimeter' : 'board-coordinate');
        oldBoard.remove();
        traversal(board).forEach(function(id, index) {
            var square = board.squaresById[id], position = gridPosition(index);
            var cell = element('div', 'cell board-square', surface);
            cell.id = 'square-' + id;
            cell.dataset.squareId = id; cell.dataset.kind = square.kind;
            if (square.groupId) cell.dataset.groupId = square.groupId;
            if (view.perimeter) {
                cell.classList.add('board-' + position.side);
                cell.style.gridRow = position.row; cell.style.gridColumn = position.column;
            } else {
                cell.style.left = square.presentation.x + '%'; cell.style.top = square.presentation.y + '%';
                cell.style.transform = 'translate(-50%, -50%) rotate(' + square.presentation.rotationDegrees + 'deg)';
                var side = square.presentation.x < 20 ? 'left' : square.presentation.x > 80 ? 'right' : square.presentation.y < 50 ? 'top' : 'bottom';
                cell.classList.add('board-' + side);
            }
            cell.style.backgroundColor = softColor(square.presentation.color || 'white');
            var anchor = element('div', 'cell-anchor', cell);
            anchor.id = 'square-' + id + '-anchor';
            var icon = resolveIcon(square, board, decks);
            if (icon && square.kind !== 'jail') {
                var image = element('img', 'board-icon', anchor);
                image.src = icon; image.alt = '';
            }
            var label = element('div', 'cell-name', anchor, square.presentation.boardName || square.presentation.label);
            label.id = 'square-' + id + '-name';
            var holder = element('div', 'cell-position-holder', anchor);
            holder.id = 'square-' + id + '-tokens';
            if (square.kind === 'free-parking') element('div', 'free-parking-pot', anchor).id = 'freeparkingpot';
            if (square.groupId) {
                var owner = element('div', 'cell-owner', anchor);
                owner.id = 'square-' + id + '-owner'; owner.setAttribute('data-square-owner', '');
                element('div', 'cell-buildings', owner).id = 'square-' + id + '-buildings';
            }
            if (square.kind === 'jail') {
                var jail = element('div', 'jail-region', anchor);
                jail.id = 'jail';
                element('span', 'jail-label', jail, 'Jail');
                var jailIcon = element('img', 'jail-icon', jail); jailIcon.src = icon; jailIcon.alt = '';
                element('div', 'jail-tokens', jail).id = 'jailpositionholder';
                cell.classList.add('visiting-square');
            }
            cell.tabIndex = 0;
            cell.setAttribute('aria-label', square.presentation.label);
            view.cells.set(id, cell);
        });
        this.center = element('div', 'board-center-layout', surface);
        this.center.setAttribute('aria-label', 'Game controls and cards');
        this.control = document.getElementById('control');
        this.center.appendChild(this.control);
        this.cards = element('div', '', this.center); this.cards.id = 'drawn-cards';
        this.cards.setAttribute('aria-label', 'Card decks');
        Object.keys(decks).forEach(function(deckId) {
            var deck = decks[deckId];
            var group = element('div', 'drawn-card-group', view.cards); group.id = 'card-deck-' + deckId;
            var stack = element('div', 'drawn-card-stack', group); stack.setAttribute('aria-hidden', 'true');
            if (deck.icon) { var icon = element('img', '', stack); icon.src = deck.icon; icon.alt = ''; }
            var card = element('div', 'drawn-card', group);
            element('div', 'drawn-card-title', card, deck.label);
            element('div', 'drawn-card-text', card, 'No card drawn yet.').id = 'card-deck-' + deckId + '-text';
        });
        this.layer = element('div', 'board-token-layer', surface);
        this.layer.setAttribute('aria-hidden', 'true');
        this.mobile = element('div', 'mobile-game-panels', shell);
        this.money = document.getElementById('moneybarwrap');
        shell.appendChild(this.money);
        this.createDeeds();
        this.media = window.matchMedia('(max-width: 1099px)');
        this.onLayout = function() {
            view.cancelAnimations();
            var parent = view.media.matches ? view.mobile : view.center;
            parent.appendChild(view.control); parent.appendChild(view.cards);
            view.placeMoneyPanel();
            view.syncVisibility();
            view.renderPositions();
        };
        this.media.addEventListener('change', this.onLayout);
        this.onResize = function() { view.cancelAnimations(); view.renderPositions(); };
        window.addEventListener('resize', this.onResize);
        this.observer = new MutationObserver(function() { view.syncVisibility(); });
        this.observer.observe(surface, { attributes: true, attributeFilter: ['style'] });
        this.onLayout();
        return this;
    };

    BoardView.prototype.syncVisibility = function() {
        var visible = getComputedStyle(this.surface).display !== 'none';
        this.cards.hidden = !visible;
        this.shell.classList.toggle('board-visible', visible);
    };

    BoardView.prototype.placeMoneyPanel = function() {
        // Trade lives outside the board shell, so its stats panel must too.
        (this.tradeVisible ? document.body : this.media.matches ? this.mobile : this.shell).appendChild(this.money);
    };

    BoardView.prototype.setTradeVisible = function(visible) {
        this.tradeVisible = !!visible;
        this.placeMoneyPanel();
    };

    BoardView.prototype.createDeeds = function() {
        var view = this, board = this.game.state.board;
        var old = document.getElementById('enlarge-wrap'); if (old) old.remove();
        this.deeds = element('div', '', document.body); this.deeds.id = 'enlarge-wrap';
        this.cells.forEach(function(cell, id) {
            var square = board.squaresById[id];
            var deed = element('div', 'enlarge', view.deeds); deed.id = 'deed-' + id; deed.dataset.squareId = id;
            if (square.kind === 'railroad' || square.kind === 'utility') deed.classList.add('enlarge-icon');
            var color = element('div', 'enlarge-color', deed); color.id = deed.id + '-color'; color.style.backgroundColor = square.presentation.color;
            element('div', 'enlarge-name', deed, square.presentation.label).id = deed.id + '-name';
            var price = element('div', 'enlarge-price', deed, square.presentation.priceText || ''); price.id = deed.id + '-price';
            var imageHolder = element('div', 'enlarge-token', deed); imageHolder.id = deed.id + '-token';
            var icon = resolveIcon(square, board, view.game.state.cardDecks);
            if (icon) { var image = element('img', '', imageHolder); image.src = icon; image.alt = ''; }
            function position(event) {
                var rect = cell.getBoundingClientRect();
                var x = event.clientX === undefined ? rect.right : event.clientX;
                var y = event.clientY === undefined ? rect.top : event.clientY;
                deed.style.left = Math.max(4, Math.min(x + 10, window.innerWidth - 158)) + 'px';
                deed.style.top = Math.max(4, Math.min(y + 20, window.innerHeight - 208)) + 'px';
            }
            function show(event) {
                var propertyState = view.game.state.squareStateById[id];
                var rent = propertyState.ownerId ? global.getCurrentRent(view.game, id) : null;
                price.textContent = square.rules.purchasePrice > 0
                    ? 'Price: ' + (square.presentation.priceText || '$' + square.rules.purchasePrice)
                    : square.presentation.priceText || '';
                if (square.rules.purchasePrice > 0 && rent !== null) {
                    var rentDisplay = square.presentation.rentText;
                    price.textContent += '\nRent: ' + (typeof rentDisplay === 'function' ? rentDisplay(rent, square) : rent && rent.type === 'diceMultiplier' ? rent.multiplier + 'x dice' : '$' + rent);
                }
                deed.style.display = 'block'; position(event);
            }
            cell.addEventListener('mouseenter', show); cell.addEventListener('focus', show);
            cell.addEventListener('mousemove', position);
            cell.addEventListener('mouseleave', function() { deed.style.display = 'none'; });
            cell.addEventListener('blur', function() { deed.style.display = 'none'; });
            cell.addEventListener('keydown', function(event) { if (event.key === 'Escape') deed.style.display = 'none'; });
        });
    };

    BoardView.prototype.cancelAnimations = function() {
        this.generation++;
        this.activeMovement = null;
        this.cancellations.forEach(function(cancel) { cancel(); });
        this.cancellations.clear();
        this.overlays.forEach(function(token) { token.style.transition = 'none'; });
    };

    BoardView.prototype.resetTokens = function() {
        this.cancelAnimations();
        this.overlays.forEach(function(token) { token.remove(); });
        this.overlays.clear(); this.tokens.clear();
        this.cells.forEach(function(cell) { cell.querySelector('.cell-position-holder').replaceChildren(); });
        var jail = this.surface.querySelector('#jailpositionholder'); if (jail) jail.replaceChildren();
    };

    BoardView.prototype.removePlayer = function(id) {
        this.cancelAnimations();
        var token = this.overlays.get(id), slot = this.tokens.get(id);
        if (token) token.remove(); if (slot) slot.remove();
        this.overlays.delete(id); this.tokens.delete(id);
        var view = this;
        Promise.resolve().then(function() { view.renderPositions(); });
    };

    BoardView.prototype.dispose = function() {
        this.disposed = true; this.resetTokens();
        this.media.removeEventListener('change', this.onLayout);
        window.removeEventListener('resize', this.onResize); this.observer.disconnect();
        // Keep the stable panel nodes and board placeholder available for the next mount.
        document.body.appendChild(this.control); document.body.appendChild(this.money);
        document.body.appendChild(this.surface);
        this.shell.remove(); this.deeds.remove();
    };

    global.BoardView = BoardView;
    if (typeof module !== 'undefined' && module.exports) module.exports = { BoardView: BoardView, traversal: traversal, gridPosition: gridPosition, resolveIcon: resolveIcon };
})(typeof window !== 'undefined' ? window : globalThis);
