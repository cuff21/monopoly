 'use strict';
const assert = require('assert');
require('./js/core/board');
require('./js/core/state');
const Context = require('./js/core/game-state-context');
const UI = require('./js/core/ui-bridge');
const Editions = require('./js/editions/edition-registry');
require('./js/editions/classic');
require('./js/editions/newyorkcity');
const { Game } = require('./js/game/game-core');
require('./js/game/property-actions');
require('./js/game/auction');
require('./js/game/trade');
require('./js/game/bankruptcy');
require('./js/game/turn-flow');
const Controllers = require('./js/application/player-controllers');
const Genetic = require('./js/ai/ai-genetic');
const { StrategicAI: Strategic } = require('./js/ai/ai-strategic');
require('./js/ai/ai-gen5/simulation-adapter');
const { Gen6AI } = require('./js/ai/ai-gen6/index');
const { Genotype } = require('./js/ai/ai-gen6/neat/genotype');
const respond = (action, complete = true) => ({ actions: action ? [action] : [], complete });
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(count = 3) {
    const setup = Editions.buildGameSetup('Classic');
    let seed = 719;
    const state = Context.createState({ player: [], pcount: count, turn: 1, cardDecks: setup.cardDecks,
        random: () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296) });
    Context.initializeBoardState(state, setup.board, 'Classic');
    const game = new Game(new UI.HeadlessUI(), state);
    for (let seat = 0; seat <= count; seat++) {
        const player = new global.Player('Player ' + seat, 'red', game);
        player.index = seat; state.player[seat] = player;
        if (seat) { Context.assignPlayerId(player, seat); game.registerController(player.playerId, new Controllers.AIController({})); }
    }
    return game;
}
async function run() {
    // Immutable snapshots, stable identity, explicit completion and stale-response rejection.
    {
        const game = fixture(); let captured;
        game.registerController('player-1', { decide(request) {
            captured = request;
            assert.ok(Object.isFrozen(request.state.player[1]));
            assert.ok(Object.isFrozen(request.state.board.squaresById.boardwalk.rules));
            assert.strictEqual(request.state.player[1].AI, undefined);
            assert.strictEqual(request.state.player[1].human, undefined);
            assert.throws(() => { request.state.player[1].money = 0; }, TypeError);
            return respond(null);
        } });
        await game.requestDecision('manage', 'player-1', {});
        assert.strictEqual((await game.dispatchPlayerAction(captured, { type: 'mortgage', squareId: 'boardwalk' })).ok, false);
        assert.strictEqual(game.state.player[1].money, 1500);
        assert.strictEqual(game._requests.size, 0);
        game.state.player[2].money = -1; game.state.turn = 2;
        await game.bankruptcy();
        assert.strictEqual(game.state.player[2].playerId, 'player-3');
        assert.ok(game.controllers.has('player-3'));
    }
    // Invalid browser input stays pending; duplicates cannot change another request.
    {
        const game = fixture(2); let error, pending;
        game.ui.setAuctionBidError = value => { error = value; };
        const browser = new Controllers.BrowserController(game);
        game.registerController('player-1', browser);
        game.registerController('player-2', new Controllers.AIController({ bid: () => -1 }));
        game.addPropertyToAuctionQueue('boardwalk');
        const completion = game.auction();
        pending = browser.pending.request;
        assert.strictEqual(browser.submit({ type: 'auctionBid', amount: 10.5 }), false);
        assert.strictEqual(browser.submit({ type: 'auctionBid', amount: 2000 }), false);
        assert.strictEqual(browser.submit({ type: 'buyHouse', squareId: 'boardwalk' }), false);
        assert.strictEqual(browser.pending.request, pending);
        assert.ok(error);
        assert.strictEqual(game.auctionState.highestBid, 0);
        assert.strictEqual(browser.submit({ type: 'auctionBid', amount: 10 }), true);
        assert.strictEqual(browser.submit({ type: 'auctionBid', amount: 11 }), false);
        await completion;
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-1');
        assert.strictEqual(game.state.player[1].money, 1490);
        assert.strictEqual((await game.dispatchPlayerAction(pending, { type: 'auctionBid', amount: 12 })).ok, false);
        assert.strictEqual(game.state.player[1].money, 1490);
    }
    // Auction processing does not recurse, resume the turn, or settle after controller failure.
    {
        const game = fixture(2), histories = [];
        game.ui.onAuctionHistory = text => histories.push(text);
        game.registerController('player-1', new Controllers.AIController({ bid: (_, bid) => bid < 251 ? bid + 1 : -1 }));
        game.registerController('player-2', new Controllers.AIController({ bid: (_, bid) => bid < 251 ? bid + 1 : -1 }));
        game.addPropertyToAuctionQueue('boardwalk'); game.addPropertyToAuctionQueue('park-place');
        assert.strictEqual(await game.auction(), true);
        assert.strictEqual(game.auctionState.highestBid, 251);
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-1');
        assert.strictEqual(game.state.squareStateById['park-place'].ownerId, 'player-1');
        assert.strictEqual(histories.filter(text => text.includes(' won for ')).length, 2);
        assert.strictEqual(game.state.turn, 1);
        const failing = fixture(2); let errors = 0;
        failing.onGameError = () => errors++;
        failing.registerController('player-1', { decide() { throw new Error('Policy failure'); } });
        failing.addPropertyToAuctionQueue('boardwalk');
        await assert.rejects(failing.auction(), /Policy failure/);
        assert.strictEqual(failing.state.squareStateById.boardwalk.ownerId, null);
        assert.strictEqual(failing.isOver, true); assert.strictEqual(errors, 1);
        const missing = fixture(2); missing.controllers.delete('player-1');
        await assert.rejects(missing.play(), /Missing controller/);
        assert.strictEqual(missing.state.turn, 1);
    }
    // The same dispatcher enforces ownership, phase, affordability, and building rules.
    {
        const game = fixture(), state = game.state;
        Context.setSquareOwner(state, 'mediterranean-avenue', 'player-1');
        Context.setSquareOwner(state, 'baltic-avenue', 'player-1');
        let captured, resume;
        game.registerController('player-1', { decide(request) { captured = request; return new Promise(resolve => { resume = resolve; }); } });
        const phase = game.requestDecision('manage', 'player-1', {});
        assert.ok(game.validatePlayerAction(captured, { type: 'mortgage', squareId: 'boardwalk' }));
        assert.ok(game.validatePlayerAction(captured, { type: 'roll' }));
        state.squareStateById['baltic-avenue'].house = 1;
        assert.ok(game.validatePlayerAction(captured, { type: 'buyHouse', squareId: 'baltic-avenue' }));
        state.player[1].money = 1;
        assert.ok(game.validatePlayerAction(captured, { type: 'buyHouse', squareId: 'mediterranean-avenue' }));
        state.player[1].money = 1500;
        assert.ok(game.validatePlayerAction(captured, { type: 'mortgage', squareId: 'mediterranean-avenue' }));
        resume(respond({ type: 'buyHouse', squareId: 'mediterranean-avenue' }));
        await phase;
        assert.strictEqual(state.squareStateById['mediterranean-avenue'].house, 1);
        assert.strictEqual(state.player[1].money, 1450);
    }
    // Sequential planners observe execution results and fresh state without mutation access.
    {
        const game = fixture(), player = game.state.player[1];
        Context.setSquareOwner(game.state, 'boardwalk', 'player-1');
        Context.setSquareOwner(game.state, 'park-place', 'player-1');
        player.money = -300;
        const readonly = Controllers.policyPlayer(player);
        assert.strictEqual(readonly.game.mortgage, undefined);
        assert.strictEqual(readonly.pay, undefined);
        assert.throws(() => { readonly.money = 0; }, TypeError);
        assert.throws(() => { readonly.game.state.squareStateById.boardwalk.mortgage = true; }, TypeError);
        const results = [];
        const policy = { *payDebt() {
            results.push(yield [{ type: 'mortgage', squareId: 'boardwalk' }]);
            assert.strictEqual(readonly.money, -100);
            results.push(yield [{ type: 'mortgage', squareId: 'park-place' }]);
            assert.strictEqual(readonly.money, 75);
        } };
        Controllers.bindPolicy(policy, readonly);
        game.registerController('player-1', new Controllers.AIController(policy));
        await game.requestDecision('debt', 'player-1', { hook: 'payDebt' });
        assert.deepStrictEqual(results, [true, true]);
        assert.strictEqual(player.money, 75);
    }
    // A browser turn remains pending while its trade recipient decides, then resumes once.
    for (const accepted of [false, true]) {
        const game = fixture(2), browser = new Controllers.BrowserController(game);
        game.registerController('player-1', browser);
        const recipient = new Controllers.BrowserController(game);
        game.registerController('player-2', recipient);
        Context.setSquareOwner(game.state, 'boardwalk', 'player-1');
        const offer = new global.Trade('player-1', 'player-2', 0, ['boardwalk'], [], []);
        const turn = game.requestDecision('turn', 'player-1', { nextAction: 'endTurn' });
        browser.submit({ type: 'proposeTrade', offer });
        await tick();
        assert.strictEqual(browser.pending, null);
        assert.ok(recipient.pending);
        recipient.submit({ type: accepted ? 'acceptTrade' : 'rejectTrade' });
        await tick();
        assert.ok(browser.pending);
        assert.strictEqual(game.tradeState.pending, false);
        browser.submit({ type: 'endTurn' }); await turn;
        assert.strictEqual(game.state.turn, 1);
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, accepted ? 'player-2' : 'player-1');
    }
    // Counters need reciprocal approval. Automatic negotiation limits belong to controllers.
    {
        const game = fixture(2); let calls = 0;
        Context.setSquareOwner(game.state, 'boardwalk', 'player-1');
        const policy = { acceptTrade(offer) { calls++; return new global.Trade(offer.getInitiator(), offer.getRecipient(), offer.getMoney(), offer.getOfferedSquareIds(), offer.getRequestedSquareIds(), []); } };
        game.registerController('player-1', new Controllers.AIController(policy));
        game.registerController('player-2', new Controllers.AIController(policy));
        assert.strictEqual(await game.trade(new global.Trade('player-1', 'player-2', 0, ['boardwalk'], [], [])), false);
        assert.strictEqual(calls, 6); assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-1');
        game.registerController('player-1', new Controllers.AIController({ acceptTrade: () => false }));
        assert.strictEqual(await game.trade(new global.Trade('player-1', 'player-2', 0, ['boardwalk'], [], [])), false);
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-1');
    }
    // Independent policy guards reject malformed inputs and preserve intended ceilings.
    {
        const game = fixture(), player = game.state.player[1];
        const genetic = new Genetic(player, { purchaseThreshold: 0, housePurchaseThreshold: 0 });
        const strategic = new Strategic(player, { name: 'Balanced' });
        const gen5 = new global.Gen5AI(player, { name: 'Tactician' }, {});
        const gen6 = new Gen6AI(player, Genotype.createInitial(147, 9));
        gen6.getDecision = () => ({ bidValue: 120.9 });
        assert.strictEqual(gen6.bid('boardwalk', 100), 120);
        player.money = 110.9; assert.strictEqual(gen6.bid('boardwalk', 100), 110);
        for (const value of [NaN, Infinity, -Infinity]) {
            gen6.getDecision = () => ({ bidValue: value });
            assert.strictEqual(gen6.bid('boardwalk', 100), -1);
        }
        player.money = 5000;
        for (const policy of [genetic, strategic, gen5, gen6]) {
            for (const bid of [NaN, Infinity, -1, 0.5]) assert.strictEqual(policy.bid('boardwalk', bid), -1);
            assert.strictEqual(policy.bid('unknown', 0), -1);
            Context.setSquareOwner(game.state, 'boardwalk', 'player-2');
            assert.strictEqual(policy.bid('boardwalk', 0), -1);
            Context.setSquareOwner(game.state, 'boardwalk', null);
        }
        gen6.getDecision = property => { assert.strictEqual(property, 39); return { bidValue: 5001 }; };
        assert.strictEqual(gen6.bid('boardwalk', 4999), 5000);
        assert.strictEqual(gen6.bid('boardwalk', 5000), -1);
        assert.strictEqual(genetic.bid('boardwalk', 600), -1, 'Genetic retains its 150% ceiling');
        player.money = 100; assert.strictEqual(genetic.bid('boardwalk', 50), -1, 'Genetic preserves $50 in cash');
        player.money = NaN;
        for (const policy of [genetic, strategic, gen5, gen6]) assert.strictEqual(policy.bid('boardwalk', 0), -1);
    }
    // Planners yield action lists without mutating the source Game; request binding
    // also prevents a policy from reading changes made after its snapshot was taken.
    {
        const game = fixture(), player = game.state.player[1];
        Context.setSquareOwner(game.state, 'mediterranean-avenue', 'player-1');
        Context.setSquareOwner(game.state, 'baltic-avenue', 'player-1');
        player.money = 5000;
        const policies = [new Genetic(player, { housePurchaseThreshold: 0 }), new Strategic(player, { name: 'Balanced' }),
            new global.Gen5AI(player, { name: 'Tactician' }, { batchBuildMinROI: 0.001 }), new Gen6AI(player, Genotype.createInitial(147, 9))];
        policies[3].getDecision = () => ({ buildHouseCount: 1 });
        for (const policy of policies) {
            const before = JSON.stringify(Controllers.copy(game.state));
            const step = policy.beforeTurn().next();
            assert.strictEqual(JSON.stringify(Controllers.copy(game.state)), before);
            assert.strictEqual(step.done, false);
            assert.strictEqual(step.value.length, 1);
            assert.strictEqual(step.value[0].type, 'buyHouse');
        }
        const readonly = Controllers.policyPlayer(player);
        const snapshot = Controllers.copy(game.state);
        player.money = 1;
        const policy = { buyProperty: () => readonly.money >= 400 };
        Controllers.bindPolicy(policy, readonly);
        const controller = new Controllers.AIController(policy);
        assert.strictEqual(controller.decide({ kind: 'purchase', playerId: 'player-1', state: snapshot, options: { squareId: 'boardwalk' } }).actions[0].type, 'buy');
        assert.strictEqual(readonly.money, 1, 'request snapshot binding is scoped to the policy call');
        player.money = 5000;
        game.state.squareStateById['mediterranean-avenue'].mortgage = true;
        assert.strictEqual(policies[1].inherit(['mediterranean-avenue']).length, 1);
        policies[1].profile.name = 'Defensive';
        assert.deepStrictEqual(policies[1].inherit(['mediterranean-avenue']), []);
    }
    // Keep the dependency boundary enforceable as new decisions are added.
    {
        const fs = require('fs'), path = require('path');
        for (const directory of ['js/game', 'js/editions']) {
            for (const file of fs.readdirSync(path.join(__dirname, directory)).filter(file => file.endsWith('.js'))) {
                assert.ok(!/\.human\b|\.AI\b/.test(fs.readFileSync(path.join(__dirname, directory, file), 'utf8')), directory + '/' + file + ' must use controllers');
            }
        }
    }
    // Repeated play callers share one runner and one completion notification.
    {
        const game = fixture(2); let completed = 0;
        game.maxTurns = 2; game.state.turn = 0;
        game.onGameCompleted = () => completed++;
        const first = game.play(), second = game.play();
        assert.strictEqual(first, second);
        await first;
        assert.strictEqual(game.turnCount, 2); assert.strictEqual(completed, 1);
        await game.play(); assert.strictEqual(completed, 1);
    }
    console.log('Player controllers, action validation, policy isolation, async continuation, and AI bidding safeguards passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
