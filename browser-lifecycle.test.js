'use strict';
const assert = require('node:assert/strict');
require('./js/core/board');
const Context = require('./js/core/game-state-context');
require('./js/core/state');
require('./js/core/ui-bridge');
const { Game } = require('./js/game/game-core');
const Properties = require('./js/game/property-actions');
const Editions = require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
const Panels = require('./js/ui/render-panels');
const Popup = require('./js/ui/popup');
require('./js/application/game-setup-service');
require('./js/ui/setup-screen');
const BrowserApp = require('./js/main');

class Node {
    constructor() { this.style = {}; this.listeners = new Map(); this.classList = { contains: () => false }; }
    addEventListener(type, handler) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(handler); }
    removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
    insertAdjacentHTML() {}
    focus() {}
}
const nodes = new Map();
function node(id) { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); }
global.document = {
    getElementById: node,
    querySelectorAll: selector => selector.split(',').map(id => node(id.trim().slice(1))),
    querySelector: () => ({ dataset: { squareId: 'mediterranean-avenue' } }),
    addEventListener: (...args) => node('document').addEventListener(...args),
    removeEventListener: (...args) => node('document').removeEventListener(...args)
};

async function run() {
    // Every UI availability result must agree with controller validation.
    for (const edition of ['Classic', 'NYC']) {
        const setup = Editions.buildGameSetup(edition), state = Context.createState({ pcount: 2, turn: 1 });
        Context.initializeBoardState(state, setup.board);
        const game = new Game(new global.HeadlessUI(), state);
        state.player = [null, new global.Player('One', 'red', game), new global.Player('Two', 'blue', game)];
        state.player.slice(1).forEach((p, i) => Context.assignPlayerId(p, i + 1));
        const id = global.getSquareIds(state.board).find(id => state.board.squaresById[id].kind === 'street');
        document.querySelector = () => ({ dataset: { squareId: id } });
        const square = state.board.squaresById[id], property = state.squareStateById[id];
        const group = state.board.groupsById[square.groupId].squareIds;
        for (const scenario of ['unowned', 'other-owner', 'partial-group', 'cash', 'mortgage', 'uneven', 'supply', 'hotel', 'available']) {
            Object.values(state.squareStateById).forEach(ss => Object.assign(ss, { ownerId: null, mortgage: false, house: 0, hotel: 0 }));
            state.player[1].money = 5000;
            group.forEach(id => { state.squareStateById[id].ownerId = 'player-1'; });
            if (scenario === 'unowned') property.ownerId = null;
            if (scenario === 'other-owner') property.ownerId = 'player-2';
            if (scenario === 'partial-group') state.squareStateById[group[1]].ownerId = 'player-2';
            if (scenario === 'cash') state.player[1].money = 0;
            if (scenario === 'mortgage') state.squareStateById[group[1]].mortgage = true;
            if (scenario === 'uneven') property.house = 2;
            if (scenario === 'supply') state.squareStateById[global.getSquareIds(state.board).find(other => !group.includes(other))].house = state.board.rules.houseTotal;
            if (scenario === 'hotel') { property.house = 5; property.hotel = 1; }
            Panels.updateOption(game);
            for (const [button, type] of [['buyhousebutton', 'buyHouse'], ['sellhousebutton', 'sellHouse'], ['mortgagebutton', property.mortgage ? 'unmortgage' : 'mortgage']]) {
                const error = Properties.actionError(state, 'player-1', type, id);
                assert.equal(node(button).disabled, !!error, edition + ' ' + scenario + ' ' + type);
                const request = { kind: 'manage', playerId: 'player-1', options: {} };
                game._requests.set(request.requestId, request);
                assert.equal(game.validatePlayerAction(request, { type, squareId: id }), error);
                game._requests.clear();
            }
        }
    }

    // Old handlers cannot operate on a replacement Game, even if retained externally.
    const app = new BrowserApp(), control = node('control');
    let actions = 0, cancels = 0, disposals = 0;
    for (let i = 0; i < 3; i++) {
        app.game = { controllers: new Map([['player-1', { cancel() { cancels++; } }]]), _requests: new Map(), ui: { disposed: false, dispose() { this.disposed = true; disposals++; } } };
        app.listen(control, 'click', () => { actions++; });
        const oldHandler = [...control.listeners.get('click')][0];
        oldHandler(); app.dispose(); oldHandler();
        assert.equal(control.listeners.get('click').size, 0);
    }
    assert.equal(actions, 3); assert.equal(cancels, 3); assert.equal(disposals, 3);
    for (const key of ['game', 'player', 'square', 'turn', 'pcount', 'pendingAuction', 'buy', 'buyHouse']) assert.equal(Object.hasOwn(global, key), false, key);

    // Debt UI must not keep the restart button hidden once bankruptcy ends play.
    const { BrowserUI } = require('./js/ui/browser-ui');
    const ui = new BrowserUI();
    ui.game = { state: { player: [null, { human: true }], turn: 1 } };
    const human = ui.game.state.player[1], bot = { name: 'Bot', human: false };
    ui.game.state.player.push(bot);
    ui.updateTurnDisplay(human);
    assert.equal(node('nextbutton').disabled, false);
    assert.equal(node('nextbutton').value, 'Roll Dice');
    ui.game.state.turn = 2;
    ui.updateTurnDisplay(bot);
    for (const label of ['Roll Dice', 'Roll again', 'End turn']) {
        ui.updateButtonState(label, 'Bot action');
        assert.equal(node('nextbutton').disabled, true);
        assert.equal(node('nextbutton').value, 'End turn');
        assert.equal(node('nextbutton').title, 'Wait for the bot to finish its turn.');
    }
    ui.game.state.turn = 1;
    ui.updateTurnDisplay(human);
    assert.equal(node('nextbutton').disabled, false);
    assert.equal(node('nextbutton').value, 'Roll Dice');
    ui.game.state.turn = 2;
    ui.updateTurnDisplay(bot);
    node('nextbutton').style.display = 'none';
    ui.onGameOver('Winner');
    assert.equal(node('nextbutton').disabled, false);
    assert.equal(node('nextbutton').value, 'Restart Game');
    assert.notEqual(node('nextbutton').style.display, 'none');
    assert.equal(node('resignbutton').style.display, 'none');
    ui.popupView.dispose();

    // Closing/replacing a modal resolves waits and invalidates retained callbacks.
    const view = new Popup.PopupView({ game: { state: { player: [null, { human: true }], turn: 1 } } });
    let confirmations = 0;
    view.show('First', { onConfirm: () => { confirmations++; }, timeoutSeconds: 0 });
    const stale = [...node('popupclose').listeners.get('click')][0];
    const closed = view.whenClosed();
    view.show('Replacement', { timeoutSeconds: 0 });
    await closed; stale(); assert.equal(confirmations, 0);
    const current = [...node('popupclose').listeners.get('click')][0];
    view.dispose(); current(); assert.equal(confirmations, 0);
    assert.equal(view.autoCloseTimer, null);
    console.log('Browser ownership, modal cancellation, and property eligibility parity pass.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
