/**
 * Headless Monopoly Game Simulation Runner
 * Uses the official Monopoly game core with HeadlessUI to execute zero-DOM matches.
 *
 * Fully decoupled from UI; no duplicate game logic.
 */
(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('./ai-adapter-registry') : null);

    // Global headless fallbacks for environment safety
    if (typeof global.sleep === 'undefined') {
        global.sleep = function() { return Promise.resolve(); };
    }
    if (!Array.prototype.randomize) {
        Array.prototype.randomize = function(length) {
            length = length || this.length;
            for (var i = 0; i < length; i++) this[i] = i + 1;
            for (var i = length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = this[i]; this[i] = this[j]; this[j] = temp;
            }
        };
    }

    // Ensure core game modules are loaded in Node.js environment
    if (typeof module !== 'undefined' && module.exports) {
        if (typeof global.GameStorage === 'undefined') require('../core/storage');
        if (typeof global.Square === 'undefined') require('../core/board');
        if (typeof global.redefineGame === 'undefined') require('../core/state');
        if (typeof global.UIBridge === 'undefined') require('../core/ui-bridge');
        if (typeof global.getCurrentRent === 'undefined') require('../core/rent');
        if (typeof global.Monopoly === 'undefined' || !global.Monopoly.Editions) require('../editions/edition-registry');
        if (!global.Monopoly.Editions.getActive()) require('../editions/classic');
        if (!global.Monopoly.Editions.getNames().includes('NYC')) require('../editions/newyorkcity');
        if (typeof global.Game === 'undefined') require('../game/game-core');
        if (typeof global.buy === 'undefined') require('../game/property-actions');
        require('../game/auction');
        require('../game/trade');
        require('../game/bankruptcy');
        require('../game/turn-flow');
    }

    var HeadlessUI = (typeof UIBridge !== 'undefined') ? UIBridge.HeadlessUI : global.HeadlessUI;

    var COLORS = ["yellow", "blue", "red", "green", "purple", "orange", "aqua", "lime"];

    function SimBoard(contestants, maxTurns, options) {
        this.contestants = contestants || [];
        this.maxTurns = maxTurns || 120;
        this.options = options || {};
    }

    function calculateNetWorth(p) {
        if (!p || p.money < 0) return 0;
        var worth = p.money;
        var sqList = (typeof square !== 'undefined') ? square : [];
        for (var i = 0; i < 40; i++) {
            var sq = sqList[i];
            if (sq && sq.owner === p.index) {
                if (sq.mortgage) {
                    worth += Math.round(sq.price * 0.5);
                } else {
                    worth += sq.price;
                    worth += (sq.house || 0) * (sq.houseprice || 0);
                }
            }
        }
        return worth;
    }

    function createInactiveAI() {
        return {
            buyProperty: function() { return false; },
            beforeTurn: function() { return false; },
            onLand: function() { return false; },
            postBail: function() { return false; },
            payDebt: function() {},
            bid: function() { return -1; },
            acceptTrade: function() { return false; }
        };
    }

    var GAME_STATE_KEYS = [
        'game', 'player', 'square', 'communityChestCards', 'chanceCards', 'playersGame',
        'pcount', 'turn', 'doublecount', 'pendingAuction', 'auctionEnabled',
        'freeParkingTaxes', 'freeParkingPot', 'lastGamePlayerCount', 'lastKnownPosition',
        'lastKnownJail', 'playerOverlays', 'nextMoveDirection', 'boardCorners'
    ];
    var MUTABLE_ARRAY_KEYS = ['player', 'playersGame', 'lastKnownPosition', 'lastKnownJail', 'playerOverlays'];

    function snapshotGameGlobals(target) {
        var values = {};
        var arrays = {};
        for (var i = 0; i < GAME_STATE_KEYS.length; i++) {
            var key = GAME_STATE_KEYS[i];
            values[key] = {
                exists: Object.prototype.hasOwnProperty.call(target, key),
                value: target[key]
            };
        }
        for (var i = 0; i < MUTABLE_ARRAY_KEYS.length; i++) {
            var key = MUTABLE_ARRAY_KEYS[i];
            if (Array.isArray(target[key])) {
                arrays[key] = { reference: target[key], values: target[key].slice() };
            }
        }
        var editionRegistry = target.Monopoly && target.Monopoly.Editions;
        return {
            values: values,
            arrays: arrays,
            activeEdition: editionRegistry && typeof editionRegistry.getActiveName === 'function'
                ? editionRegistry.getActiveName()
                : null
        };
    }

    function restoreGameGlobals(target, snapshot) {
        Object.keys(snapshot.arrays).forEach(function(key) {
            var saved = snapshot.arrays[key];
            saved.reference.length = 0;
            Array.prototype.push.apply(saved.reference, saved.values);
        });
        Object.keys(snapshot.values).forEach(function(key) {
            var saved = snapshot.values[key];
            if (saved.exists) target[key] = saved.value;
            else delete target[key];
        });
        var editionRegistry = target.Monopoly && target.Monopoly.Editions;
        if (snapshot.activeEdition && editionRegistry && typeof editionRegistry.setActive === 'function') {
            editionRegistry.setActive(snapshot.activeEdition);
        }
    }

    /**
     * Executes the match in headless mode using the decoupled Monopoly engine.
     * @returns {Promise<Array<Object>>} Ranked match results: [ { playerIndex, netWorth, bankrupt, money }, ... ]
     */
    SimBoard.prototype.run = function() {
        var self = this;
        var stateContext = global.GameStateContext;
        var gameState = stateContext ? stateContext.createState() : {};
        var runMatch = function() { return new Promise(function(resolve, reject) {
            var stateSnapshot = snapshotGameGlobals(global);
            var stateRestored = false;
            function restoreState() {
                if (stateRestored) return;
                stateRestored = true;
                restoreGameGlobals(global, stateSnapshot);
            }

            try {
                // Initialize game with HeadlessUI
                var headlessUI = new HeadlessUI();
                global.game = new Game(headlessUI);
                var game = global.game;
                if (self.options.edition && !global.Monopoly.Editions.setActive(self.options.edition)) {
                    throw new Error('Unknown Monopoly edition: ' + self.options.edition);
                }
                redefineGame();

                var contestantCount = self.options.playerCount || self.contestants.length || 4;
                if (!Number.isInteger(contestantCount) || contestantCount < 2 || contestantCount > 8) {
                    throw new Error('Headless games require between 2 and 8 players.');
                }
                global.pcount = contestantCount;
                var pcount = contestantCount;
                global.turn = 0;
                global.doublecount = 0;
                global.pendingAuction = -1;
                global.auctionEnabled = true;
                global.freeParkingTaxes = true;
                global.freeParkingPot = 0;

                var playerList = [];
                var activeBankrupts = [];

                // Reset global player array for this match
                player.length = contestantCount + 1;
                global.player = player;

                // Player 0 is "the bank"
                player[0] = new Player("the bank", "");
                player[0].name = "the bank";
                player[0].index = 0;

                for (var i = 1; i <= contestantCount; i++) {
                    var p = new Player("Bot " + i, COLORS[(i - 1) % COLORS.length]);
                    p.index = i;
                    p.originalIndex = i - 1;
                    p.human = false;
                    var contestant = self.contestants[i - 1];
                    p.AI = contestant
                        ? SimulationAdapters.createPlayerAI(contestant, p)
                        : createInactiveAI();
                    player[i] = p;
                    playerList.push(p);
                }

                // Setup property groups
                var groupPropertyArray = [];
                for (var i = 0; i < 40; i++) {
                    var gNum = square[i].groupNumber;
                    if (gNum > 0) {
                        if (!groupPropertyArray[gNum]) {
                            groupPropertyArray[gNum] = [];
                        }
                        groupPropertyArray[gNum].push(i);
                    }
                    square[i].index = i;
                }
                for (var i = 0; i < 40; i++) {
                    var gNum = square[i].groupNumber;
                    if (gNum > 0) {
                        square[i].group = groupPropertyArray[gNum];
                    }
                }

                // Shuffle Chance and Community Chest decks
                communityChestCards.index = 0;
                chanceCards.index = 0;
                communityChestCards.deck = [];
                chanceCards.deck = [];
                for (var i = 0; i < 16; i++) {
                    chanceCards.deck[i] = i;
                    communityChestCards.deck[i] = i;
                }
                chanceCards.deck.sort(function() { return Math.random() - 0.5; });
                communityChestCards.deck.sort(function() { return Math.random() - 0.5; });

                game.maxTurns = self.maxTurns;
                game.turnCount = 0;
                game.isOver = false;

                // Hook bankruptcy elimination to track original indices
                headlessUI.onPlayerBankrupt = function(bankruptPlayer) {
                    if (bankruptPlayer && bankruptPlayer.originalIndex !== undefined) {
                        activeBankrupts.push({
                            originalIndex: bankruptPlayer.originalIndex,
                            name: bankruptPlayer.name
                        });
                    }
                };

                // Completion handler
                var completed = false;
                function finishGame() {
                    if (completed) return;
                    completed = true;
                    game.isOver = true;

                    var results = [];
                    var recordedOriginals = new Set();

                    // Surviving players
                    for (var i = 1; i <= pcount; i++) {
                        var p = player[i];
                        if (p && p.originalIndex !== undefined && p.originalIndex < contestantCount && !recordedOriginals.has(p.originalIndex)) {
                            recordedOriginals.add(p.originalIndex);
                            results.push({
                                playerIndex: p.originalIndex,
                                netWorth: calculateNetWorth(p),
                                bankrupt: false,
                                money: p.money
                            });
                        }
                    }

                    // Bankrupt players
                    for (var b = 0; b < activeBankrupts.length; b++) {
                        var orig = activeBankrupts[b].originalIndex;
                        if (orig !== undefined && orig < contestantCount && !recordedOriginals.has(orig)) {
                            recordedOriginals.add(orig);
                            results.push({
                                playerIndex: orig,
                                netWorth: 0,
                                bankrupt: true,
                                money: 0
                            });
                        }
                    }

                    // Pad any missing players
                    for (var i = 0; i < contestantCount; i++) {
                        if (!recordedOriginals.has(i)) {
                            results.push({
                                playerIndex: i,
                                netWorth: 0,
                                bankrupt: true,
                                money: 0
                            });
                        }
                    }

                    // Rank descending: survivors first by net worth, bankrupts last
                    results.sort(function(a, b) {
                        if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;
                        return b.netWorth - a.netWorth;
                    });
                    var turnsPlayed = Math.min(game.turnCount || 0, self.maxTurns);
                    results.forEach(function(result) {
                        result.turns = turnsPlayed;
                    });

                    global.setTimeout(function() {
                        restoreState();
                        resolve(results);
                    }, 0);
                }

                game.onGameCompleted = finishGame;

                // Start the game!
                play().catch(function(error) {
                    restoreState();
                    reject(error);
                });
            } catch (err) {
                restoreState();
                reject(err);
            }
        }); };
        return stateContext ? stateContext.run(gameState, runMatch) : runMatch();
    };

    var SimModule = {
        SimBoard: SimBoard,
        HeadlessGameRunner: SimBoard
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SimModule;
    }
    global.SimBoard = SimBoard;
    global.HeadlessGameRunner = SimBoard;
    global.SimModule = SimModule;
})(typeof window !== 'undefined' ? window : globalThis);
