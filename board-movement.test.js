const assert = require('node:assert/strict');
require('./js/core/board');
const State = require('./js/core/game-state-context');
const { Player } = require('./js/core/state');
const { Game } = require('./js/game/game-core');
const { GameUI, HeadlessUI } = require('./js/core/ui-bridge');
require('./js/game/turn-flow');
require('./js/editions/edition-registry');
require('./js/editions/classic');
const { pathBends } = require('./js/ui/render-board');
const { BoardView } = require('./js/ui/board-view');

async function checkRenderedMovement(reducedMotion) {
    const savedWindow = global.window;
    // OS/browser reduced-motion preferences must not bypass essential board
    // movement. The original master renderer always animates these tokens.
    global.window = { matchMedia: () => ({ matches: reducedMotion }) };
    try {
        const view = new BoardView({});
        view.perimeter = true;
        const nodeAt = (left, top) => ({ getBoundingClientRect: () => ({ left, top }), dataset: {} });
        view.layer = nodeAt(20, 30);
        view.cells = new Map([
            ['a', nodeAt(20, 30)], ['b', nodeAt(30, 30)],
            ['c', nodeAt(40, 30)], ['d', nodeAt(40, 40)],
        ]);
        const token = { style: { left: '3px', top: '7px' } };
        view.overlays.set('player-1', token);
        view.renderPositions = (id, movement) => {
            const rect = view.cells.get(movement.toSquareId).getBoundingClientRect();
            view.tokens.set(id, nodeAt(rect.left + 1, rect.top + 1));
        };
        const steps = [];
        const pauses = [];
        view.wait = async (ms, overlay, point) => {
            if (point) {
                steps.push({ ms, ...point });
                overlay.style.left = point.left + 'px';
                overlay.style.top = point.top + 'px';
            } else pauses.push(ms);
        };
        const movement = { playerId: 'player-1', fromSquareId: 'a', toSquareId: 'd',
            traversedIds: ['b', 'c', 'd'], fromJail: false, toJail: false };
        await view.animateMovement(movement);
        assert.deepEqual(steps, [
            { ms: 125, left: 20, top: 0 }, { ms: 125, left: 20, top: 11 },
        ], 'match master: one axis and 125 ms per straight leg, stopping at corners');
        assert.deepEqual(pauses, [250], 'match master: pause 250 ms on arrival');
        assert.equal(token.style.left, '21px', 'arrival aligns to the stacked token slot');
        assert.equal(token.style.top, '11px');

        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'd', toSquareId: 'd',
            traversedIds: ['c', 'b', 'a', 'b', 'c', 'd'] });
        assert.deepEqual(steps, [
            { ms: 125, left: 20, top: 0 }, { ms: 125, left: 0, top: 0 },
            { ms: 125, left: 20, top: 0 }, { ms: 125, left: 20, top: 11 },
        ], 'returning to the same square preserves direction changes and the full path');

        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'd', toSquareId: 'a',
            traversedIds: [], toJail: true });
        assert.deepEqual(steps, [{ ms: 250, left: 1, top: 1 }], 'jail transfers use a direct animation');

        // A full clockwise lap and a backward corner crossing use master's
        // axis-aligned corner stops, even with one-pixel slot borders.
        view.cells = new Map([
            ['go', nodeAt(40, 50)], ['south', nodeAt(30, 50)], ['jail', nodeAt(20, 50)],
            ['west', nodeAt(20, 40)], ['parking', nodeAt(20, 30)], ['north', nodeAt(30, 30)],
            ['go-to-jail', nodeAt(40, 30)], ['east', nodeAt(40, 40)],
        ]);
        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'go', toSquareId: 'go',
            traversedIds: ['south', 'jail', 'west', 'parking', 'north', 'go-to-jail', 'east', 'go'] });
        assert.deepEqual(steps, [
            { ms: 125, left: 0, top: 20 }, { ms: 125, left: 0, top: 0 },
            { ms: 125, left: 20, top: 0 }, { ms: 125, left: 20, top: 21 },
        ]);
        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'go', toSquareId: 'south', traversedIds: ['south'] });
        assert.deepEqual(steps, [{ ms: 125, left: 11, top: 20 }], 'a destination slot border must not turn a horizontal move into a vertical one');
        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'south', toSquareId: 'east',
            traversedIds: ['go', 'east'] });
        assert.deepEqual(steps, [
            { ms: 125, left: 20, top: 20 }, { ms: 125, left: 20, top: 11 },
        ], 'backward moves turn at GO rather than cutting across the board');
        steps.length = 0;
        await view.animateMovement({ ...movement, fromSquareId: 'jail', toSquareId: 'west', traversedIds: ['west'] });
        assert.deepEqual(steps, [{ ms: 125, left: 0, top: 11 }], 'leaving Just Visiting uses the plain jail cell rather than its offset visiting holder');
    } finally {
        if (savedWindow === undefined) delete global.window;
        else global.window = savedWindow;
    }
}

async function checkTransitionScheduling() {
    const saved = { window: global.window, setTimeout: global.setTimeout, clearTimeout: global.clearTimeout };
    const timers = new Map(), layoutReads = [];
    let timerId = 0;
    global.window = { matchMedia: () => ({ matches: true }) };
    global.setTimeout = (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; };
    global.clearTimeout = id => timers.delete(id);
    try {
        const view = new BoardView({});
        view.perimeter = true;
        const nodeAt = (left, top) => ({ getBoundingClientRect: () => ({ left, top }) });
        view.layer = nodeAt(0, 0);
        view.cells = new Map([['go', nodeAt(100, 100)], ['next', nodeAt(80, 100)]]);
        const token = { style: { left: '100px', top: '100px' },
            get offsetHeight() { layoutReads.push({ ...this.style }); return 12; } };
        view.overlays.set('player-1', token);
        view.renderPositions = () => view.tokens.set('player-1', nodeAt(81, 101));
        let completed = false;
        const movement = view.animateMovement({ playerId: 'player-1', fromSquareId: 'go', toSquareId: 'next',
            traversedIds: ['next'], fromJail: false, toJail: false }).then(() => { completed = true; });
        await Promise.resolve();
        assert.strictEqual(completed, false);
        assert.strictEqual(view.activeMovement.playerId, 'player-1');
        assert.deepEqual(layoutReads[0], { left: '100px', top: '100px', transition: 'none' }, 'departure is committed to layout before sliding');
        assert.strictEqual(layoutReads[1].left, '100px', 'the transition is installed while the token is still at its origin');
        assert.strictEqual(token.style.transition, 'left 125ms linear, top 125ms linear');
        assert.strictEqual(token.style.left, '81px');
        assert.strictEqual(token.style.top, '100px', 'the slide changes only the travel axis');
        let timer = timers.values().next().value;
        assert.strictEqual(timer.ms, 125, 'real transition retains master timing');
        timer.callback();
        await Promise.resolve();
        timer = timers.values().next().value;
        assert.strictEqual(timer.ms, 250, 'arrival remains visible before landing decisions continue');
        assert.strictEqual(completed, false);
        timer.callback();
        await movement;
        assert.strictEqual(token.style.top, '101px', 'stacking alignment happens after the animation');
        assert.strictEqual(view.activeMovement, null);
        assert.strictEqual(view.cancellations.size, 0);
        assert.strictEqual(timers.size, 0);
    } finally {
        if (saved.window === undefined) delete global.window;
        else global.window = saved.window;
        global.setTimeout = saved.setTimeout; global.clearTimeout = saved.clearTimeout;
    }
}

async function run() {
    const setup = global.Monopoly.Editions.buildGameSetup('Classic');
    const state = State.createState({ pcount: 1, turn: 1, cardDecks: setup.cardDecks });
    State.initializeBoardState(state, setup.board);
    const ui = new GameUI(), game = new Game(ui, state);
    const player = new Player('Traveler', 'yellow', game);
    State.assignPlayerId(player, 1); player.index = 1;
    state.player = [null, player];
    const events = [];
    let finishAnimation;
    ui.animateMovement = movement => { events.push(movement); return new Promise(resolve => { finishAnimation = resolve; }); };
    game.requestDecision = async kind => { events.push(kind); return { type: 'decline' }; };

    const advance = game.advanceToSquare('mediterranean-avenue','never');
    assert.equal(player.squareId, 'mediterranean-avenue');
    assert.equal(events.length, 1, 'landing decisions must wait for animation');
    assert.deepEqual(events[0], { playerId: player.playerId, fromSquareId: 'go', toSquareId: 'mediterranean-avenue', traversedIds: ['mediterranean-avenue'], fromJail: false, toJail: false });
    finishAnimation(); await advance;
    assert.equal(events[1], 'purchase');

    ui.animateMovement = async movement => events.push(movement);
    const lap = game.move(80);
    assert.equal(lap.traversedIds.length, 80);
    assert.equal(lap.fromSquareId, lap.toSquareId);
    assert.equal(player.money, 1700, 'animation metadata must not change the salary rule');
    await game.moveRelative(-1);
    const backwards = events.findLast(event => typeof event === 'object');
    assert.equal(backwards.fromSquareId, 'mediterranean-avenue');
    assert.deepEqual(backwards.traversedIds, ['go']);
    assert.equal(player.money, 1700);

    await game.goToJail();
    assert.equal(events.at(-1).toJail, true);
    assert.deepEqual(events.at(-1).traversedIds, []);
    await game.payBail();
    assert.equal(events.at(-1).fromJail, true);
    assert.equal(events.at(-1).toJail, false);
    assert.equal(player.jail, false);

    assert.deepEqual(pathBends([
        {left:10,top:10},{left:5,top:10},{left:0,top:10},
        {left:0,top:5},{left:0,top:0},{left:5,top:0},{left:10,top:0},{left:10,top:10},
    ]), [{left:0,top:10},{left:0,top:0},{left:10,top:0},{left:10,top:10}]);
    await new HeadlessUI().animateMovement(lap);
    assert.equal(state.playerOverlays, undefined);
    await checkRenderedMovement(false);
    await checkRenderedMovement(true);
    await checkTransitionScheduling();
    console.log('Explicit movement paths, awaited landing decisions, jail transfers, full laps, and animation bends pass.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
