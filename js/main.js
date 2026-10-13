// Browser composition root. Match state stays on the current Game.
(function(global) {
    'use strict';
    function BrowserApp(dependencies) {
        this.dependencies = dependencies || {};
        this.game = null;
        this.bindings = [];
        global.GameSetupService.configure({
            aiRegistry: this.dependencies.aiRegistry || global.AISetupRegistry,
            gen6Trainer: global.Gen6Trainer,
            createWorkerPool: global.Gen6Trainer && global.Gen6Trainer.createBrowserWorkerPool
        });
        global.SetupScreen.setSetupService(global.GameSetupService);
        global.SetupScreen.setAISetupRegistry(this.dependencies.aiRegistry || global.AISetupRegistry);
    }
    BrowserApp.prototype.listen = function(target, type, callback) {
        var app = this, game = this.game;
        global.DOMUI.nodes(target).forEach(function(node) {
            var handler = function(event) { if (app.game === game && !game.ui.disposed) callback(event); };
            node.addEventListener(type, handler);
            app.bindings.push([node, type, handler]);
        });
    };
    BrowserApp.prototype.dispose = function() {
        this.bindings.splice(0).forEach(function(binding) { binding[0].removeEventListener(binding[1], binding[2]); });
        var game = this.game;
        if (!game) return;
        game.onGameError = null; game.onGameCompleted = null;
        game.isOver = true;
        game._requests.clear();
        game.controllers.forEach(function(controller) { if (controller.cancel) controller.cancel(new Error('Game restarted.')); });
        game.ui.dispose();
        this.game = null;
    };
    BrowserApp.prototype.mount = function() {
        this.dispose();
        var app = this, editions = global.Monopoly.Editions;
        var editionId = editions.getActiveName(), setup = editions.buildGameSetup(editionId);
        var state = global.GameStateContext.createState({ pcount: 2, cardDecks: setup.cardDecks });
        global.GameStateContext.initializeBoardState(state, setup.board, editionId);
        state.seed = global.crypto && global.crypto.getRandomValues ? global.crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0;
        state.random = (function(seed) { var value = seed >>> 0; return function() { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; }; })(state.seed);
        var game = this.game = new global.Game(new global.BrowserUI(), state);
        game.ui.app = this;
        for (var seat = 0; seat <= 8; seat++) {
            var player = new global.Player('', '', game);
            player.index = seat; state.player[seat] = player;
            if (seat) global.GameStateContext.assignPlayerId(player, seat);
        }
        state.player[0].name = 'the bank';
        global.AITest3.count = 0;
        Object.keys(state.cardDecks).forEach(function(deckId) {
            var order = state.cardDecks[deckId].order;
            for (var i = order.length - 1; i > 0; i--) {
                var j = Math.floor(state.random() * (i + 1)), swap = order[i]; order[i] = order[j]; order[j] = swap;
            }
        });
        game.ui.boardView = new global.BoardView(game).mount();
        game.ui.bindDeeds(document);
        document.getElementById('player-inputs').replaceChildren();
        global.SetupScreen.createPlayerInputs(this);
        global.SetupScreen.playernumber_onchange(this);
        global.DOMUI.setVisible('#noscript', false);
        global.DOMUI.setVisible('#setup, #noF5', true);
        game.ui.updateFreeParking();
        this.listen('#nextbutton', 'click', function() { if (game.isOver) app.restart(); else game.next(); });
        this.listen('#addplayerbutton', 'click', function() { global.SetupScreen.addPlayer(app); });
        this.listen('#startgamebutton', 'click', function() { global.SetupScreen.setup(app); });
        this.listen('#resignbutton', 'click', function() { game.ui.resign(); });
        this.listen('#proposetradebutton', 'click', function() { game.ui.submitTrade(); });
        this.listen('#accepttradebutton', 'click', function() { game.ui.acceptTrade(); });
        this.listen('#canceltradebutton, #rejecttradebutton', 'click', function() { game.ui.cancelTrade(); });
        this.listen('#mortgagebutton', 'click', function() {
            var id = global.RenderPanels.getCheckedProperty();
            if (!id) return;
            var square = global.getSquare(state.board, id), current = state.squareStateById[id];
            var type = current.mortgage ? 'unmortgage' : 'mortgage';
            var error = global.PropertyActions.actionError(state, state.player[state.turn].playerId, type, id);
            if (error) { game.ui.showMessage(error); return; }
            var amount = current.mortgage ? Math.round(square.rules.purchasePrice * 0.55) : square.rules.mortgageValue;
            game.ui.confirm('Are you sure you want to ' + type + ' ' + square.presentation.label + ' for $' + amount + '?', function() {
                if (app.game === game) game.submitPlayerAction({ type: type, squareId: id });
            });
        });
        [['#buyhousebutton', 'buyHouse'], ['#sellhousebutton', 'sellHouse']].forEach(function(binding) {
            app.listen(binding[0], 'click', function() { var id = global.RenderPanels.getCheckedProperty(); if (id) game.submitPlayerAction({ type: binding[1], squareId: id }); });
        });
        this.listen('#viewstats', 'click', function() { global.PopupView.showStats(game); });
        this.listen('#statsclose, #statsbackground', 'click', function() { global.DOMUI.setVisible('#statswrap', false); global.DOMUI.fade('#statsbackground', false, 400); });
        this.listen('#buy-menu-item, #manage-menu-item', 'click', function(event) {
            event.preventDefault(); var manage = event.currentTarget.id === 'manage-menu-item';
            global.DOMUI.setVisible('#manage', manage); global.DOMUI.setVisible('#buy', !manage);
            if (!manage) global.DOMUI.scrollToBottom('#alert', false);
        });
        this.listen('#trade-menu-item', 'click', function(event) { event.preventDefault(); game.ui.editTrade(); });
        this.listen('#open-training-button', 'click', global.TrainingScreen.showTrainingScreen);
        this.listen('#train-gen6-button', 'click', global.TrainingScreen.trainGen6Population);
        this.listen('#stop-training-button', 'click', global.TrainingScreen.stopTraining);
        this.listen('#training-back-button', 'click', global.TrainingScreen.hideTrainingScreen);
        this.listen('#import-data-button', 'click', global.HistoryView.importData);
        this.listen('#export-data-button', 'click', global.HistoryView.exportData);
        this.bindDragging();
        return game;
    };
    BrowserApp.prototype.bindDragging = function() {
        var drag = null, app = this;
        [['#statsdrag', 'stats'], ['#popupdrag', 'popup']].forEach(function(binding) {
            app.listen(binding[0], 'mousedown', function(event) {
                var node = document.getElementById(binding[1]); node.style.position = 'relative';
                drag = { node: node, x: event.clientX, y: event.clientY, left: parseInt(node.style.left, 10) || 0, top: parseInt(node.style.top, 10) || 0 };
            });
        });
        this.listen(document.body, 'mousemove', function(event) {
            if (!drag) return;
            drag.node.style.left = drag.left + event.clientX - drag.x + 'px';
            drag.node.style.top = drag.top + event.clientY - drag.y + 'px';
        });
        this.listen(document.body, 'mouseup', function() { drag = null; });
    };
    BrowserApp.prototype.restart = function() { global.SetupScreen.restartGame(this); };
    global.BrowserApp = BrowserApp;
    if (typeof module !== 'undefined' && module.exports) module.exports = BrowserApp;
    else global.addEventListener('load', function() { global.monopolyApp = new BrowserApp(); global.monopolyApp.mount(); });
})(typeof window !== 'undefined' ? window : globalThis);
