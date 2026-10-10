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
    // Chance movement must finish before the turn offers its next decision.
    for (const edition of ['Classic', 'NYC']) {
        const game = fixture(2), setup = Editions.buildGameSetup(edition);
        Context.initializeBoardState(game.state, setup.board, edition);
        game.state.cardDecks = setup.cardDecks;
        game.state.cardDecks.chance.order = [7]; // Advance to the nearest railroad.
        game.state.turn = 0; game.maxTurns = 1;
        game.getDie = index => index === 1 ? 3 : 4;
        const browser = new Controllers.BrowserController(game), movements = [];
        game.registerController('player-1', browser);
        let finishCardMovement;
        game.ui.animateMovement = movement => {
            movements.push(movement);
            if (movement.toSquareId === 'chance-south') return Promise.resolve();
            return new Promise(resolve => { finishCardMovement = resolve; });
        };
        const turn = game.play();
        await tick();
        assert.strictEqual(browser.pending.request.kind, 'turn');
        browser.submit({ type: 'roll' });
        await tick();
        assert.strictEqual(movements.length, 2);
        assert.strictEqual(browser.pending, null, 'no new player decision while a card move is animating');
        finishCardMovement();
        await tick();
        assert.strictEqual(browser.pending.request.kind, 'purchase', 'destination purchase is offered before ending the turn');
        browser.submit({ type: 'buy', squareId: game.state.player[1].squareId });
        await tick();
        assert.strictEqual(browser.pending.request.kind, 'turn');
        assert.strictEqual(browser.pending.request.options.nextAction, 'endTurn');
        browser.submit({ type: 'endTurn' });
        await turn;
        assert.strictEqual(game.error, undefined);
        assert.strictEqual(game._requests.size, 0);
    }
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
        const firstBoard = captured.state.board;
        await game.requestDecision('manage', 'player-1', {});
        assert.strictEqual(captured.state.board, firstBoard, 'immutable definitions are shared between snapshots');
        assert.ok(Object.values(firstBoard.squaresById).every(square => square.behavior === undefined),
            'shared definitions must not expose executable board behavior');
        assert.throws(() => { firstBoard.squaresById.boardwalk.rules.purchasePrice = 1; }, TypeError);
        game.state.player[2].money = -1; game.state.turn = 2;
        await game.bankruptcy();
        assert.strictEqual(game.state.player[2].playerId, 'player-3');
        assert.ok(game.controllers.has('player-3'));
    }
    // Invalid browser input stays pending; duplicates cannot change another request.
    {
        const game = fixture(2); let error, pending;
        game.state.turn = 2; // Player 2 declined; the human gets the opening bid.
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
    // Purchase controls describe the configured alternative to buying.
    for (const auctionEnabled of [true, false]) {
        const game = fixture(2);
        game.state.auctionEnabled = auctionEnabled;
        let label, title;
        game.ui.updateButtonState = (value, help) => { label = value; title = help; };
        const browser = new Controllers.BrowserController(game);
        game.registerController('player-1', browser);
        const completion = game.requestDecision('purchase', 'player-1', { squareId: 'boardwalk' });
        assert.strictEqual(label, auctionEnabled ? 'Auction property' : 'Decline property');
        assert.strictEqual(title.includes('auction'), auctionEnabled);
        browser.submit({ type: 'next' });
        await completion;
        assert.strictEqual(game.state.pendingAuction, auctionEnabled ? 'boardwalk' : -1);
    }
    // An auction with no buyers must leave a result in the persistent play history.
    {
        const game = fixture(2), playHistory = [], auctionHistory = [];
        game.ui.alert = text => playHistory.push(text);
        game.ui.onAuctionHistory = text => auctionHistory.push(text);
        for (const id of ['player-1', 'player-2']) game.registerController(id, new Controllers.AIController({ bid: () => -1 }));
        game.addPropertyToAuctionQueue('boardwalk');
        await game.auction();
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, null);
        assert.deepStrictEqual(playHistory, ['Boardwalk remains on the market because there were no buyers at the auction.']);
        assert.ok(auctionHistory.includes('No player bought Boardwalk.'));
    }
    // The declining player never gets an opening bid when nobody else joins.
    for (const initiatorSeat of [1, 3]) {
        for (const originType of ['bot', 'human']) {
            for (const responses of [[0, 0], [-1, -1], [0, -1]]) {
                const game = fixture(3), offered = [];
                game.state.turn = initiatorSeat;
                let originOffers = 0;
                const origin = originType === 'bot'
                    ? new Controllers.AIController({ bid: () => { originOffers++; return 1; } })
                    : new Controllers.BrowserController(game);
                if (originType === 'human') origin.decide = () => { originOffers++; throw new Error('Uncontested opening bid offered to initiator'); };
                game.registerController('player-' + initiatorSeat, origin);
                for (let offset = 1; offset < 3; offset++) {
                    const seat = (initiatorSeat + offset - 1) % 3 + 1;
                    game.registerController('player-' + seat, new Controllers.AIController({ bid: () => { offered.push(seat); return responses[offset - 1]; } }));
                }
                game.addPropertyToAuctionQueue('boardwalk');
                await game.auction();
                assert.strictEqual(originOffers, 0, 'humans and bots cannot buy their own uncontested auction');
                assert.strictEqual(offered.length, 2);
                assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, null);
                assert.strictEqual(game.state.player[initiatorSeat].money, 1500);
            }
        }
    }
    // A pass lasts until bidding continues; an exit lasts for the whole auction.
    for (const scenario of [
        { count: 3, turns: [[2, 0], [3, 10], [1, 20], [2, 30], [3, 0], [1, 0]], winner: 2, price: 30 },
        { count: 4, turns: [[2, -1], [3, 10], [4, 0], [1, 20], [3, 0], [4, 30], [1, 0], [3, 0]], winner: 4, price: 30 },
        { count: 3, turns: [[2, 10], [3, 0], [1, 0]], winner: 2, price: 10 },
    ]) {
        const game = fixture(scenario.count), turns = scenario.turns.slice();
        for (let seat = 1; seat <= scenario.count; seat++) {
            game.registerController('player-' + seat, new Controllers.AIController({ bid: () => {
                const expected = turns.shift();
                assert.ok(expected, 'auction should finish after all remaining bidders pass');
                assert.strictEqual(seat, expected[0], 'passing bidders return, exited bidders do not');
                return expected[1];
            } }));
        }
        game.addPropertyToAuctionQueue('boardwalk');
        await game.auction();
        assert.strictEqual(turns.length, 0);
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-' + scenario.winner);
        assert.strictEqual(game.state.player[scenario.winner].money, 1500 - scenario.price);
    }
    // The browser Pass action stays eligible for its next bidding opportunity.
    {
        const game = fixture(3), browser = new Controllers.BrowserController(game);
        game.registerController('player-2', browser);
        game.registerController('player-3', new Controllers.AIController({ bid: (_, current) => current === 0 ? 10 : -1 }));
        game.registerController('player-1', new Controllers.AIController({ bid: () => -1 }));
        game.addPropertyToAuctionQueue('boardwalk');
        const completion = game.auction();
        assert.strictEqual(browser.submit({ type: 'auctionPass' }), true);
        await tick();
        assert.ok(browser.pending, 'human receives another offer after passing and another player bidding');
        assert.strictEqual(game.state.player[2].bidding, true);
        assert.strictEqual(browser.submit({ type: 'auctionBid', amount: 20 }), true);
        await completion;
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-2');
        assert.strictEqual(game.state.player[2].money, 1480);
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
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-2');
        assert.strictEqual(game.state.squareStateById['park-place'].ownerId, 'player-2');
        assert.strictEqual(histories.filter(text => text.includes(' won for ')).length, 2);
        assert.strictEqual(game.state.turn, 1);
        const failing = fixture(2); let errors = 0;
        failing.state.turn = 2;
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
    // Overshoot property counters cannot promise more cash than the bot holds.
    {
        const game = fixture(2), initiator = game.state.player[1], recipient = game.state.player[2];
        initiator.money = 0; recipient.money = 29;
        Context.setSquareOwner(game.state, 'boardwalk', initiator.playerId);
        Context.setSquareOwner(game.state, 'mediterranean-avenue', recipient.playerId);
        const policy = new global.Gen5AI(recipient, { name: 'Tactician' }, {});
        const offer = new global.Trade(initiator.playerId, recipient.playerId, 0, [], ['mediterranean-avenue'], []);
        const counter = policy.acceptTrade(offer);
        assert.ok(counter instanceof global.Trade, 'property overshoot produces a counteroffer');
        assert.ok(counter.getMoney() >= -recipient.money, 'negative cash means the recipient must pay');
        assert.ok(game.validateTrade(counter), 'the generated counter must pass settlement validation');
        game.registerController(recipient.playerId, new Controllers.AIController(policy));
        assert.strictEqual(await game.trade(offer), false, 'a declined counter ends negotiation normally');
        assert.strictEqual(game.error, undefined);
        assert.strictEqual(game._requests.size, 0);
        assert.strictEqual(game.tradeState.pending, false);
        assert.strictEqual(game.acceptTrade(game.reverseTrade(counter)), true);
        assert.strictEqual(recipient.money, 0, 'accepting the counter never overdraws the bot');
        assert.strictEqual(initiator.money, 29);
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, recipient.playerId);
        assert.strictEqual(game.state.squareStateById['mediterranean-avenue'].ownerId, initiator.playerId);
    }
    // A bot rejection reports the result and waits for the human's popup dismissal.
    {
        const game = fixture(2), history = [], results = [];
        Context.setSquareOwner(game.state, 'boardwalk', 'player-1');
        game.registerController('player-1', new Controllers.BrowserController(game));
        game.registerController('player-2', new Controllers.AIController({ acceptTrade: () => false }));
        const offer = new global.Trade('player-1', 'player-2', 50, ['boardwalk'], [], []);
        let dismiss, closed = false, completed = false;
        game.ui.alert = (text, seat) => history.push([text, seat]);
        game.ui.showTradeResult = (label, displayedOffer, result) => {
            assert.deepStrictEqual(result, { declined: true });
            results.push([label, displayedOffer]);
            return new Promise(resolve => { dismiss = resolve; });
        };
        game.ui.setTradePanelVisible = visible => { closed = !visible; };
        const rejection = game.trade(offer).then(result => { completed = true; return result; });
        await tick();
        assert.deepStrictEqual(history, [['Player 2 declined the trade from Player 1.', 2]]);
        assert.deepStrictEqual(results, [['Player 2 declined the trade from Player 1', offer]]);
        assert.strictEqual(completed, false, 'trade remains pending until the result popup is dismissed');
        assert.strictEqual(game.state.squareStateById.boardwalk.ownerId, 'player-1');
        assert.strictEqual(game.state.player[1].money, 1500);
        assert.strictEqual(game.state.player[2].money, 1500);
        dismiss();
        assert.strictEqual(await rejection, false);
        assert.strictEqual(game.tradeState.pending, false);
        assert.strictEqual(closed, true);
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
    // Request caches reuse stable queries without hiding changes on the next
    // snapshot, or during direct policy calls outside a decision.
    {
        const game = fixture(), actor = Controllers.policyPlayer(game.state.player[1]);
        const view = actor.game.decisionView;
        assert.strictEqual(Context.getDecisionView(game.state), Context.getDecisionView(game.state));
        const originalSupply = global.PropertyActions.getHouseHotelSupply;
        let supplyCalls = 0, retainedProperty;
        const policy = { buyProperty() {
            const property = view.getSquareState('mediterranean-avenue');
            if (!retainedProperty) retainedProperty = property;
            assert.strictEqual(property.house, retainedProperty.house, 'held references follow request snapshots');
            assert.throws(() => { property.house = 99; }, TypeError);
            const first = actor.game.getHouseHotelSupply(), second = actor.game.getHouseHotelSupply();
            assert.strictEqual(first, second, 'supply totals are computed once per request');
            assert.ok(Object.isFrozen(first));
            assert.strictEqual(first.housesAvailable, 32 - property.house);
            assert.strictEqual(view.getSquareOwner('mediterranean-avenue'), property.ownerId);
            assert.throws(() => view.getSquareState('unknown-square'), RangeError);
            return false;
        } };
        Controllers.bindPolicy(policy, actor);
        const controller = new Controllers.AIController(policy);
        global.PropertyActions.getHouseHotelSupply = (...args) => { supplyCalls++; return originalSupply(...args); };
        try {
            for (const houses of [0, 1]) {
                game.state.squareStateById['mediterranean-avenue'].house = houses;
                Context.setSquareOwner(game.state, 'mediterranean-avenue', houses ? 'player-2' : null);
                controller.decide({ kind: 'purchase', playerId: 'player-1', state: Controllers.copy(game.state),
                    options: { squareId: 'boardwalk' } });
            }
            assert.strictEqual(supplyCalls, 2);
            game.state.squareStateById['mediterranean-avenue'].house = 2;
            assert.strictEqual(retainedProperty.house, 2, 'direct queries retain live reads');
            assert.strictEqual(actor.game.getHouseHotelSupply().housesAvailable, 30);
            game.state.squareStateById['mediterranean-avenue'].house = 3;
            assert.strictEqual(actor.game.getHouseHotelSupply().housesAvailable, 29);
        } finally { global.PropertyActions.getHouseHotelSupply = originalSupply; }
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
