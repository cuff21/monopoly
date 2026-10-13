// Player input and policy orchestration. Rule code knows only this controller contract.
(function(global) {
    'use strict';
    function copy(value, seen) {
        if (value === null || typeof value !== 'object') return typeof value === 'function' ? undefined : value;
        seen = seen || new WeakMap();
        if (seen.has(value)) return seen.get(value);
        var result = Array.isArray(value) ? [] : {};
        seen.set(value, result);
        Object.keys(value).forEach(function(key) {
            if (key === 'game' || key === 'AI' || key === 'human' || key === 'behavior' || key === 'random') return;
            var item = copy(value[key], seen);
            if (item !== undefined) result[key] = item;
        });
        return Object.freeze(result);
    }
    var policyContexts = new WeakMap();
    var arrayQueries = new Set(['map','filter','find','findIndex','some','every','forEach','slice','includes','indexOf','reduce','concat','join','entries','values',Symbol.iterator]);
    var policyBoards = new WeakMap();
    function policyBoard(board) {
        if (!board) return board;
        if (!Object.isFrozen(board)) return copy(board);
        if (!policyBoards.has(board)) policyBoards.set(board, copy(board));
        return policyBoards.get(board);
    }
    // A planner's references follow the current request snapshot when resumed. Direct
    // policy helpers retain read-only queries for callers outside the decision loop.
    function policyPlayer(player) {
        var game = player.game, context = { state: null }, cache = new Map();
        var supplySnapshot, supplyValue;
        function state() { return context.state || game.state; }
        function readonly(read, path) {
            var initial = read();
            if (!initial || typeof initial !== 'object') return initial;
            if (cache.has(path)) return cache.get(path);
            // A request snapshot never changes. Resolve each proxy's path once
            // per snapshot, while retaining live reads outside a decision and
            // refreshing held references when a planner resumes on a new one.
            var resolvedSnapshot, resolvedValue, boundMethods = new Map();
            function resolve() {
                if (!context.state) return read();
                if (resolvedSnapshot !== context.state) {
                    resolvedValue = read(); resolvedSnapshot = context.state;
                }
                return resolvedValue;
            }
            var proxy = new Proxy(Array.isArray(initial) ? [] : {}, {
                get: function(_, key) {
                    var value = resolve();
                    if (value === null || value === undefined) return undefined;
                    if (key === 'AI' || key === 'human' || key === 'pay' || key === 'behavior') return undefined;
                    if (key === 'game') return facade;
                    // Definitions are immutable and sanitized once, so querying
                    // them needs no dynamic proxy for mutable player state.
                    if (key === 'board' && path === 'state') return context.state ? context.state.board : policyBoard(game.state.board);
                    if (key === 'policyMetadata' && !context.state) {
                        var controller = game.controllers && game.controllers.get(value.playerId);
                        return controller && controller.metadata ? controller.metadata(global.GameStateContext.getActivePlayers(game.state)) : value.policyMetadata;
                    }
                    var item = value[key];
                    if (typeof item === 'function') {
                        if (Array.isArray(value) && arrayQueries.has(key)) {
                            var bound = boundMethods.get(key);
                            if (!bound || bound.source !== item) {
                                bound = { source: item, method: item.bind(proxy) }; boundMethods.set(key, bound);
                            }
                            return bound.method;
                        }
                        if (key === 'random') return item;
                        return undefined;
                    }
                    if (item === null || typeof item !== 'object') return item;
                    var childPath = path + '/' + String(key);
                    if (cache.has(childPath)) return cache.get(childPath);
                    return readonly(function() {
                        var parent = resolve(); return parent && parent[key];
                    }, childPath);
                },
                has: function(_, key) { return key in resolve(); },
                ownKeys: function() { return Reflect.ownKeys(resolve()); },
                getOwnPropertyDescriptor: function(_, key) {
                    var value = resolve();
                    if (key === 'length' && Array.isArray(value)) return { value: value.length, writable: true, enumerable: false, configurable: false };
                    return key in value ? { enumerable: true, configurable: true } : undefined;
                },
                set: function() { throw new TypeError('Policy state is read-only.'); },
                defineProperty: function() { throw new TypeError('Policy state is read-only.'); },
                deleteProperty: function() { throw new TypeError('Policy state is read-only.'); }
            });
            cache.set(path, proxy); return proxy;
        }
        var readonlyState = readonly(state, 'state');
        var facade = Object.freeze({ state: readonlyState, decisionView: game.state.board ? global.GameStateContext.getDecisionView(readonlyState, function() { return context.state; }) : null,
            getDie: function(index) { return game.getDie(index); },
            canSellHouse: function(id) { return global.PropertyActions.canSellHouse({ state: state() }, id); },
            getHouseHotelSupply: function() {
                if (context.state && supplySnapshot === context.state) return supplyValue;
                var current = state();
                var result = copy(global.PropertyActions.getHouseHotelSupply({ state: current }));
                if (context.state) { supplySnapshot = context.state; supplyValue = result; }
                return result;
            }
        });
        var result = readonly(function() {
            return context.state ? context.state.player.find(function(p) { return p && p.playerId === player.playerId; }) : player;
        }, 'actor');
        policyContexts.set(result, context);
        return result;
    }
    function bindPolicy(policy, player) { policyContexts.set(policy, policyContexts.get(player)); }
    function decision(action, complete) { return { actions: action ? [action] : [], complete: complete !== false }; }
    function AIController(policy, ui) { this.policy = policy; this.ui = ui; this.planners = new Map(); this.purchasePlans = new Map(); }

    function nextPurchaseFundingAction(request, plan) {
        var state = request.state, player = state.player.find(function(item) { return item && item.playerId === request.playerId; });
        var squareId = request.options.squareId, price = state.board.squaresById[squareId].rules.purchasePrice;
        var needed = price - player.money, ids = global.getSquareIds(state.board), candidates = [];
        // Try asset-for-cash trades before selling or mortgaging. Keep offers within
        // the value of the property being acquired and skip properties with buildings.
        if (global.Trade) {
            for (var i = 0; i < ids.length; i++) {
                var offeredId = ids[i], offeredSquare = state.board.squaresById[offeredId], offeredState = state.squareStateById[offeredId];
                if (offeredState.ownerId !== player.playerId || offeredState.mortgage) continue;
                var groupIds = offeredSquare.groupId ? global.getGroupSquareIds(state.board, offeredSquare.groupId) : [offeredId];
                if (groupIds.some(function(id) { var item = state.squareStateById[id]; return item.house || item.hotel; })) continue;
                if (offeredSquare.rules.purchasePrice < needed) continue;
                for (var seat = 1; seat < state.player.length; seat++) {
                    var recipient = state.player[seat];
                    if (!recipient || recipient.playerId === player.playerId || recipient.active === false || recipient.money < needed) continue;
                    var key = 'trade:' + recipient.playerId + ':' + offeredId;
                    if (plan.attempted.has(key)) continue;
                    plan.attempted.add(key);
                    return { type: 'proposeTrade', offer: new global.Trade(player.playerId, recipient.playerId, -needed, [offeredId], [], []) };
                }
            }
        }
        // Mortgage the least valuable eligible asset first. The action validator
        // still enforces even-building rules and ownership at the time of use.
        for (var m = 0; m < ids.length; m++) {
            var mortgageId = ids[m], mortgageState = state.squareStateById[mortgageId];
            if (mortgageState.ownerId !== player.playerId || mortgageState.mortgage) continue;
            var mortgageKey = 'mortgage:' + mortgageId;
            if (plan.attempted.has(mortgageKey)) continue;
            if (global.PropertyActions.actionError(state, player.playerId, 'mortgage', mortgageId)) continue;
            candidates.push({ squareId: mortgageId, value: state.board.squaresById[mortgageId].rules.purchasePrice });
        }
        candidates.sort(function(a, b) { return a.value - b.value; });
        if (candidates.length) {
            plan.attempted.add('mortgage:' + candidates[0].squareId);
            return { type: 'mortgage', squareId: candidates[0].squareId };
        }
        // Selling buildings can both raise cash and unlock mortgages in their group.
        for (var h = 0; h < ids.length; h++) {
            var houseId = ids[h], houseState = state.squareStateById[houseId], houseKey = 'sellHouse:' + houseId;
            if (houseState.ownerId !== player.playerId || (!houseState.house && !houseState.hotel) || plan.attempted.has(houseKey)) continue;
            if (global.PropertyActions.canSellHouse({ state: state }, houseId)) candidates.push({ squareId: houseId, value: state.board.squaresById[houseId].rules.houseCost });
        }
        candidates.sort(function(a, b) { return a.value - b.value; });
        if (candidates.length) {
            plan.attempted.add('sellHouse:' + candidates[0].squareId);
            return { type: 'sellHouse', squareId: candidates[0].squareId };
        }
        return null;
    }
    AIController.prototype.metadata = function(players) {
        var p = this.policy, biases = {};
        if (p.getTradeBias) players.forEach(function(player) { biases[player.playerId] = p.getTradeBias(copy(player)); });
        return copy({ profile: p.profile, personality: p.personality, turnNumber: p.turnNumber, tradeBiases: biases });
    };
    AIController.prototype.decide = function(request) {
        var p = this.policy, o = request.options, state = request.state;
        var player = state.player.find(function(item) { return item && item.playerId === request.playerId; });
        switch (request.kind) {
        case 'auction':
            var amount = p.bid ? p.bid(o.squareId, o.currentBid) : -1;
            return decision(Number.isInteger(amount) && amount > o.currentBid && amount > 0 && amount <= player.money
                ? { type: 'auctionBid', amount: amount } : { type: amount === 0 ? 'auctionPass' : 'auctionExit' });
        case 'purchase':
            var purchaseId = request.phaseId, purchasePlan = this.purchasePlans.get(purchaseId);
            if (!purchasePlan) {
                if (!p.buyProperty || !p.buyProperty(o.squareId)) return decision({ type: 'decline', squareId: o.squareId });
                purchasePlan = { attempted: new Set() };
                this.purchasePlans.set(purchaseId, purchasePlan);
            }
            var buyer = state.player.find(function(item) { return item && item.playerId === request.playerId; });
            var purchasePrice = state.board.squaresById[o.squareId].rules.purchasePrice;
            if (buyer.money >= purchasePrice) {
                this.purchasePlans.delete(purchaseId);
                return decision({ type: 'buy', squareId: o.squareId });
            }
            var fundingAction = nextPurchaseFundingAction(request, purchasePlan);
            if (fundingAction) return { actions: [fundingAction], complete: false };
            this.purchasePlans.delete(purchaseId);
            return decision({ type: 'decline', squareId: o.squareId });
        case 'turn': return decision({ type: o.nextAction });
        case 'jail': return decision(p.postBail && p.postBail() ? { type: player.heldCards.length ? 'useJailCard' : 'payBail', cardId: player.heldCards[0] } : null);
        case 'tax': return decision({ type: 'tax', amount: o.fixedAmount });
        case 'acknowledge':
            if (o.deckId && this.ui && this.ui.delay) return Promise.resolve(this.ui.delay(500)).then(function() { return decision({ type: 'acknowledge' }); });
            return decision({ type: 'acknowledge' });
        case 'trade':
            if (o.round >= 6) return decision({ type: 'rejectTrade' });
            var reply = p.acceptTrade ? p.acceptTrade(o.offer) : false;
            return decision(reply === true ? { type: 'acceptTrade' } : reply instanceof global.Trade ? { type: 'counterTrade', offer: reply } : { type: 'rejectTrade' });
        case 'inherit':
            var actions = p.inherit ? p.inherit(o.squareIds) : [];
            if (!Array.isArray(actions) || actions.length > 1) throw new TypeError('Inheritance policy must return at most one action.');
            return { actions: actions, complete: actions.length === 0 };
        case 'manage': case 'debt':
            var key = request.phaseId, iterator = this.planners.get(key);
            if (!iterator) {
                var result = p[o.hook] ? p[o.hook]() : null;
                if (!result || typeof result.next !== 'function') return decision(null);
                iterator = result; this.planners.set(key, iterator);
            }
            var step = iterator.next(request.previousResults.length ? request.previousResults[0].ok : undefined);
            if (step.done) { this.planners.delete(key); return decision(null); }
            if (!Array.isArray(step.value) || step.value.length !== 1) throw new TypeError('A policy planner must yield a list containing one action.');
            return { actions: step.value, complete: false };
        default: throw new Error('Unsupported AI decision: ' + request.kind);
        }
    };
    AIController.prototype.cancel = function() { this.planners.clear(); this.purchasePlans.clear(); };
    var decideAI = AIController.prototype.decide;
    AIController.prototype.decide = function(request) {
        var context = policyContexts.get(this.policy), previous = context && context.state;
        if (context) context.state = request.state;
        try { return decideAI.call(this, request); }
        finally { if (context) context.state = previous; }
    };
    function BrowserController(game) {
        this.game = game; this.pending = null;
        if (game.ui && game.ui.initializeTradeInputHandlers) game.ui.initializeTradeInputHandlers();
    }
    BrowserController.prototype.decide = function(request) {
        var ui = this.game.ui, o = request.options;
        if (request.kind === 'manage' || request.kind === 'jail') return decision(null);
        var self = this;
        return new Promise(function(resolve, reject) {
            self.pending = { request: request, resolve: resolve, reject: reject };
            if (request.kind === 'acknowledge') {
                var acknowledge = function() { self.submit({ type: 'acknowledge' }); };
                if (o.deckId && ui.showCard) ui.showCard(o.deckId, o.message, acknowledge);
                else ui.showMessage(o.message, acknowledge, undefined, 0);
            }
            if (request.kind === 'auction') { ui.updateAuctionTurn(o.name, true); if (ui.focusAuctionBid) ui.focusAuctionBid(); }
            if (request.kind === 'purchase') {
                ui.displayPropertyPurchase(o.squareId, self.game.state.board.squaresById[o.squareId]);
                ui.updateButtonState(self.game.state.auctionEnabled ? 'Auction property' : 'Decline property',
                    self.game.state.auctionEnabled ? 'Decline purchase and auction this property.' : 'Decline purchase and continue.');
            }
            if (request.kind === 'turn' || request.kind === 'debt') { ui.updateButtonState(o.nextAction === 'roll' ? 'Roll Dice' : 'End turn', 'Continue your turn.'); if (ui.focusNextButton) ui.focusNextButton(); }
            if (request.kind === 'trade') {
                ui.writeTradeView(self.game.reverseTrade(o.offer)); ui.setTradePanelVisible(true); ui.setTradeButtons(false, true);
            }
            if (request.kind === 'tax') ui.chooseTax(o.fixedAmount, o.percentageAmount, function(amount) { self.submit({ type: 'tax', amount: amount }); });
            if (request.kind === 'inherit') {
                var properties = o.squareIds.filter(function(id) { return self.game.state.squareStateById[id].mortgage; }).map(function(id) {
                    var square = self.game.state.board.squaresById[id];
                    return { squareId: id, name: square.presentation.label, color: square.presentation.color, kind: square.kind, price: Math.round(square.rules.purchasePrice * 0.5) };
                });
                if (!properties.length) { if (ui.closeDecisionPopup) ui.closeDecisionPopup(); self.submit(null); }
                else ui.showBankruptcyUnmortgage(o.name, properties, function(id) { return self.submit({ type: 'inheritUnmortgage', squareId: id }); }, function() { self.submit(null); });
            }
        });
    };
    BrowserController.prototype.cancel = function(error) {
        if (this.pending) { var pending = this.pending; this.pending = null; pending.reject(error); }
    };
    BrowserController.prototype.submit = function(action) {
        if (!this.pending) return false;
        var pending = this.pending;
        if (action && action.type === 'next') action = { type: pending.request.options.nextAction || (pending.request.kind === 'purchase' ? 'decline' : 'finish') };
        var error = this.game.validatePlayerAction(pending.request, action);
        if (error) {
            if (pending.request.kind === 'auction') this.game.ui.setAuctionBidError(error);
            else if (pending.request.kind === 'inherit' && this.game.ui.alert) this.game.ui.alert(error);
            else if (this.game.ui.showMessage) this.game.ui.showMessage(error);
            return false;
        }
        this.pending = null;
        pending.resolve(decision(action, !(action && ['buyHouse','sellHouse','mortgage','unmortgage','proposeTrade','payBail','useJailCard','inheritUnmortgage'].includes(action.type))));
        return true;
    };
    function init(game) {
        game.controllers = new Map(); game._requests = new Map(); game._decisionSequence = 0;
    }
    var allowed = {
        auction: ['auctionBid','auctionPass','auctionExit'], purchase: ['buy','decline','buyHouse','sellHouse','mortgage','unmortgage','proposeTrade'],
        turn: ['roll','endTurn','buyHouse','sellHouse','mortgage','unmortgage','proposeTrade','payBail','useJailCard','resign'],
        manage: ['buyHouse','sellHouse','mortgage','unmortgage','proposeTrade'], debt: ['sellHouse','mortgage','proposeTrade','resign','finish'],
        jail: ['payBail','useJailCard'], tax: ['tax'], acknowledge: ['acknowledge'],
        trade: ['acceptTrade','rejectTrade','counterTrade'], inherit: ['inheritUnmortgage']
    };
    function decisionSnapshot(game) {
        var state = Object.assign({}, game.state);
        var activePlayers = global.GameStateContext.getActivePlayers(game.state);
        state.player = (game.state.player || []).map(function(player) {
            if (!player) return player;
            var controller = game.controllers.get(player.playerId);
            return Object.assign({}, player, { policyMetadata: controller && controller.metadata ? controller.metadata(activePlayers) : null });
        });
        var board = policyBoard(state.board);
        delete state.board;
        return Object.freeze(Object.assign({}, copy(state), { board: board }));
    }
    function freezeOptions(options) {
        var result = {};
        Object.keys(options || {}).forEach(function(key) {
            var value = options[key];
            if (value instanceof global.Trade) {
                value = new global.Trade(value.getInitiator(), value.getRecipient(), value.getMoney(), value.getOfferedSquareIds(), value.getRequestedSquareIds(), value.getHeldCards());
                Object.freeze(value.offeredSquareIds); Object.freeze(value.requestedSquareIds);
                value.heldCards.forEach(Object.freeze); Object.freeze(value.heldCards); Object.freeze(value);
                result[key] = value;
            } else result[key] = copy(value);
        });
        return Object.freeze(result);
    }
    function install(Game) {
        Game.prototype.fail = function(error) {
            this.isOver = true; this._requests.clear();
            if (this.error) return;
            this.error = error;
            this.controllers.forEach(function(controller) { if (controller.cancel) controller.cancel(error); });
            if (this.onGameError) this.onGameError(error);
        };
        Game.prototype.completeGame = function() {
            if (this.error || this._completionReported) return;
            this._completionReported = true;
            if (this.onGameCompleted) this.onGameCompleted();
        };
        Game.prototype.registerController = function(id, controller) {
            global.GameStateContext.getPlayerById(this.state, id);
            if (!controller || typeof controller.decide !== 'function') throw new TypeError('A player controller must implement decide(request).');
            this.controllers.set(id, controller);
        };
        Game.prototype.submitPlayerAction = function(action, id) {
            var controller = id ? this.controllers.get(id) : Array.from(this.controllers.values()).find(function(c) { return c.pending; });
            return !!(controller && controller.submit && controller.submit(action));
        };
        Game.prototype.validatePlayerAction = function(request, action) {
            if (this._requests.get(request.requestId) !== request) return 'This decision is no longer active.';
            if (!action) return ['manage','debt','jail','inherit'].includes(request.kind) ? null : 'An action is required.';
            if (!allowed[request.kind] || !allowed[request.kind].includes(action.type)) return 'Action is not permitted during this phase.';
            var player;
            try { player = global.GameStateContext.getPlayerById(this.state, request.playerId); } catch (_) { return 'Player is no longer active.'; }
            if (!['auction','trade','inherit','acknowledge'].includes(request.kind) && player !== this.state.player[this.state.turn]) return "It is another player's turn.";
            if (action.type === 'auctionBid' && (!Number.isFinite(player.money) || !Number.isInteger(action.amount) || action.amount <= this.auctionState.highestBid || action.amount <= 0 || action.amount > player.money)) return 'Bid must be a positive whole amount above the current bid and within available cash.';
            if (request.kind === 'auction' && this.state.player[this.auctionState.currentBidder] !== player) return "It is another bidder's turn.";
            if (['roll','endTurn'].includes(action.type) && action.type !== request.options.nextAction) return 'That turn action is not available.';
            if (action.type === 'tax' && ![request.options.fixedAmount,request.options.percentageAmount].includes(action.amount)) return 'Choose one of the offered tax amounts.';
            if (action.type === 'buy' && (action.squareId !== request.options.squareId
                || (player.human && player.money < this.state.board.squaresById[action.squareId].rules.purchasePrice))) return 'Property is unavailable or exceeds available cash.';
            if (['buyHouse','sellHouse','mortgage','unmortgage','inheritUnmortgage'].includes(action.type)) {
                var property = this.state.squareStateById[action.squareId];
                if (!property || property.ownerId !== player.playerId) return 'Player does not own this property.';
                if (action.type === 'inheritUnmortgage' && (!request.options.squareIds.includes(action.squareId) || !property.mortgage)) return 'Property was not inherited in this transfer.';
                if (action.type === 'inheritUnmortgage') {
                    if (player.money < Math.round(this.state.board.squaresById[action.squareId].rules.purchasePrice * 0.5)) return 'Inherited property exceeds available cash.';
                } else {
                    var propertyError = global.PropertyActions.actionError(this.state, player.playerId, action.type, action.squareId);
                    if (propertyError) return propertyError;
                }
            }
            if (action.type === 'payBail' && !player.jail) return 'Bail is unavailable.';
            if (action.type === 'useJailCard' && (!player.jail || !player.heldCards.includes(action.cardId))) return 'Jail card is unavailable.';
            if (action.type === 'resign' && player.money >= 0) return 'Bankruptcy requires unpaid debt.';
            if (['proposeTrade','counterTrade'].includes(action.type)) {
                try {
                    if (!this.validateTrade(action.offer)) return 'Invalid trade offer.';
                    if (action.type === 'proposeTrade' && action.offer.getInitiator() !== player.playerId) return 'Player must initiate their own offer.';
                    if (action.type === 'counterTrade' && (action.offer.getInitiator() !== request.options.offer.getInitiator() || action.offer.getRecipient() !== request.options.offer.getRecipient())) return 'Counteroffer must preserve the incoming parties.';
                } catch (_) { return 'Invalid trade offer.'; }
            }
            return null;
        };
        Game.prototype.dispatchPlayerAction = async function(request, action) {
            var error = this.validatePlayerAction(request, action);
            if (error) return { ok: false, error: error };
            this._requests.delete(request.requestId);
            if (!action) return { ok: true };
            var result = true;
            switch (action.type) {
            case 'buy':
                var player = global.GameStateContext.getPlayerById(this.state, request.playerId);
                var purchasePrice = this.state.board.squaresById[request.options.squareId].rules.purchasePrice;
                if (player.money < purchasePrice) {
                    if (this.state.auctionEnabled) this.state.pendingAuction = request.options.squareId;
                } else result = this.buy(action.squareId);
                break;
            case 'decline': if (this.state.auctionEnabled) this.state.pendingAuction = request.options.squareId; break;
            case 'buyHouse': case 'sellHouse': case 'mortgage': case 'unmortgage': result = this[action.type](action.squareId); break;
            case 'proposeTrade': result = await this.trade(action.offer); break;
            case 'payBail': await this.payBail(); break;
            case 'useJailCard': await this.useJailCard(action.cardId); break;
            case 'inheritUnmortgage': result = this.confirmBankruptcyUnmortgage(action.squareId); break;
            case 'resign': await this.bankruptcy(); break;
            }
            return { ok: result !== false, action: action };
        };
        Game.prototype.requestDecision = async function(kind, playerId, options) {
            var controller = this.controllers.get(playerId);
            var phaseId = ++this._decisionSequence, previous = [];
            try {
                if (!controller) throw new Error('Missing controller for ' + playerId);
                if (this._requests.size) throw new Error('A player decision is already pending.');
                while (!this.isOver) {
                    var request = Object.freeze({ requestId: ++this._decisionSequence, phaseId: phaseId, playerId: playerId, kind: kind,
                        state: decisionSnapshot(this), options: freezeOptions(options), previousResults: copy(previous) });
                    this._requests.set(request.requestId, request);
                    var reply = await controller.decide(request);
                    if (!reply || !Array.isArray(reply.actions) || reply.actions.length > 1 || typeof reply.complete !== 'boolean' || (!reply.complete && reply.actions.length === 0)) throw new TypeError('Controller must return { actions, complete } with at most one action.');
                    var action = reply.actions[0] || null;
                    var result = await this.dispatchPlayerAction(request, action);
                    previous = [result];
                    this._requests.delete(request.requestId);
                    if (!result.ok) { if (reply.complete) throw new Error(result.error || 'Controller action failed.'); continue; }
                    if (reply.complete) return action;
                }
            } catch (error) {
                this.fail(error);
                throw error;
            }
        };
    }
    var api = { init: init, install: install, copy: copy, policyPlayer: policyPlayer, bindPolicy: bindPolicy, AIController: AIController, BrowserController: BrowserController };
    global.PlayerControllers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
