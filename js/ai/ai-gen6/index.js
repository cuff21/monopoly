if (typeof module !== 'undefined' && module.exports) require('../../application/player-controllers');
/**
 * Gen6 NEAT AI Player for Monopoly
 * Implements the standard Monopoly AI interface contract using recurrent neural networks
 * trained via NeuroEvolution of Augmenting Topologies (NEAT).
 *
 * Compatible with b2developer/MonopolyNEAT population weights.
 */
(function(global) {
    'use strict';

    var NetworkAdapter = (typeof module !== 'undefined' && module.exports) 
        ? require('./neat/network-adapter') 
        : global.NetworkAdapter;
    var PhenotypeModule = (typeof module !== 'undefined' && module.exports) 
        ? require('./neat/phenotype') 
        : global.NEATPhenotype;
    var GenotypeModule = (typeof module !== 'undefined' && module.exports) 
        ? require('./neat/genotype') 
        : global.NEATGenotype;

    var Phenotype = PhenotypeModule.Phenotype;
    var Genotype = GenotypeModule.Genotype;

    function Gen6AI(player, brain) {
        this.player = player.game ? PlayerControllers.policyPlayer(player) : player;
        if (player.game) PlayerControllers.bindPolicy(this, this.player);
        this.alertList = "";
        this.aiType = "gen6";

        if (brain instanceof Phenotype) {
            this.phenotype = brain;
            this.genotype = null;
        } else if (brain instanceof Genotype) {
            this.genotype = brain;
            this.phenotype = new Phenotype(brain);
        } else if (typeof brain === 'string') {
            this.genotype = Genotype.fromString(brain);
            this.phenotype = new Phenotype(this.genotype);
        } else if (brain && brain.phenotype) {
            this.phenotype = brain.phenotype;
            this.genotype = brain.genotype || null;
        } else {
            this.genotype = Genotype.createInitial(NetworkAdapter.INPUT_COUNT, NetworkAdapter.OUTPUT_COUNT);
            this.phenotype = new Phenotype(this.genotype);
        }

        Gen6AI.count = (Gen6AI.count || 0) + 1;
    }

    Gen6AI.count = 0;
    Gen6AI.MAX_PLAYERS = 8;
    Gen6AI.supportsPlayerCount = function(count) {
        return Number.isInteger(count) && count >= 2 && count <= Gen6AI.MAX_PLAYERS;
    };

    /**
     * Helper to encode current game state and evaluate network decisions.
     */
    Gen6AI.prototype.getDecision = function(selectedPropertyIndex, contextMoney, contextProperties) {
        var state = this.player && this.player.game && this.player.game.state;
        if (typeof selectedPropertyIndex === 'string' && state && state.board) selectedPropertyIndex = global.getSquareIds(state.board).indexOf(selectedPropertyIndex);
        var players = [];
        var inputCount = this.phenotype.inputCount;
        var playerSlots = inputCount === 126 ? 4 : 8;
        var pcountVal = state ? state.pcount : playerSlots;
        var pArray = state && Array.isArray(state.player) ? state.player : [];

        for (var i = 1; i <= Math.min(playerSlots, pcountVal); i++) {
            if (pArray[i]) {
                players.push(pArray[i]);
            }
        }
        while (players.length < playerSlots) {
            players.push({ money: 1500, position: 0, jail: false, heldCards: [] });
        }

        var turnIdx = (this.player && this.player.index ? (this.player.index - 1) : 0);
        var inputs = NetworkAdapter.encodeInputs({
            players: players,
            currentTurn: turnIdx,
            squares: state ? state.square : [],
            selectedPropertyIndex: selectedPropertyIndex,
            contextMoney: contextMoney,
            contextProperties: contextProperties
    		}, this.phenotype.inputCount);
        var outputs = this.phenotype.evaluate(inputs);
        return NetworkAdapter.decodeOutputs(outputs);
    };

    /**
     * Called when landing on an unowned property.
     * @param {number} index - Property index (0..39)
     * @returns {boolean}
     */
    Gen6AI.prototype.buyProperty = function(index) {
        var state = this.player && this.player.game && this.player.game.state;
        if (typeof index === 'string' && state && state.board) index = global.getSquareIds(state.board).indexOf(index);
        var s = state ? state.square[index] : null;
        if (!s) {
            return false;
        }
        var decisions = this.getDecision(index, s.price);
        return Boolean(decisions.buyProperty);
    };

    /**
     * Called at the start of a turn while in jail.
     * @returns {boolean}
     */
    Gen6AI.prototype.postBail = function() {
        var decisions = this.getDecision(10);
        if (decisions.jailAction === 'card') {
            if (this.player.heldCards && this.player.heldCards.length) {
                return true;
            }
        }
        if (decisions.jailAction === 'pay') {
            if (this.player.money >= 50) {
                return true;
            }
        }
        return false;
    };

    /**
     * Called at the start of turn before dice roll.
     * Handles unmortgaging and building houses.
     * @returns {boolean} true if trade proposed
     */
    Gen6AI.prototype.beforeTurn = function*() {
        var game = this.player && this.player.game;
        var state = game && game.state;
        if (!state) return false;

        // Apply the policy's mortgage decisions to properties without improvements.
        for (var i = 0; i < 40; i++) {
            var sq = state.square[i];
            if (!sq || sq.owner !== this.player.index) continue;
            var squareId = sq.id === undefined ? i : sq.id;

            var d = this.getDecision(i, this.player.money);
            if (sq.mortgage) {
                var unmortgagePrice = Math.round(sq.price * 0.55);
                if (d.unmortgage && this.player.money >= unmortgagePrice) {
                    yield [{ type: 'unmortgage', squareId: squareId }];
                }
            } else if (d.mortgage && !sq.house && !sq.hotel) {
                yield [{ type: 'mortgage', squareId: squareId }];
            }
        }

        // 2. Build houses on completed color groups
        var supply = game.getHouseHotelSupply();
        if (supply.housesAvailable > 0 || supply.hotelsAvailable > 0) {
            for (var i = 0; i < 40; i++) {
                var sq = state.square[i];
                var squareId = sq && sq.id !== undefined ? sq.id : i;
                if (sq && sq.owner === this.player.index && sq.group && sq.houseprice > 0 && !sq.mortgage) {
                    var ownsAll = sq.group.every(function(idx) {
                        return state.square[idx] && state.square[idx].owner === sq.owner && !state.square[idx].mortgage;
                    });
                    if (ownsAll && sq.house < 5 && this.player.money >= sq.houseprice) {
                        var d = this.getDecision(i);
                        if (d.buildHouseCount > 0) {
                            yield [{ type: 'buyHouse', squareId: squareId }];
                        }
                    }
                }
            }
        }

        return false;
    };

    /**
     * Called when landing on property.
     * @returns {boolean} true if trade proposed
     */
    Gen6AI.prototype.onLand = function*() {
        var game = this.player && this.player.game;
        var state = game && game.state;
        if (!state || typeof Trade !== 'function') return false;

        var groups = [];
        var seenGroups = {};
        for (var i = 0; i < state.square.length; i++) {
            var square = state.square[i];
            if (!square || !square.group || square.houseprice <= 0) continue;
            var key = square.group.slice().sort(function(a, b) { return a - b; }).join(',');
            if (!seenGroups[key]) {
                seenGroups[key] = true;
                groups.push(square.group);
            }
        }

        function isTradableGroup(group) {
            return group.every(function(index) {
                var property = state.square[index];
                return property && !property.mortgage && !property.house && !property.hotel;
            });
        }

        for (var groupIndex = 0; groupIndex < groups.length; groupIndex++) {
            var requestedGroup = groups[groupIndex];
            if (!isTradableGroup(requestedGroup)) continue;
            var requestedIndex = -1;
            var opponentIndex = -1;
            var ownsRequestedRemainder = requestedGroup.every(function(index) {
                var owner = state.square[index].owner;
                if (owner === this.player.index) return true;
                if (requestedIndex !== -1 || owner <= 0) return false;
                requestedIndex = index;
                opponentIndex = owner;
                return true;
            }, this);
            if (!ownsRequestedRemainder || requestedIndex === -1) continue;

            for (var offeredGroupIndex = 0; offeredGroupIndex < groups.length; offeredGroupIndex++) {
                if (groupIndex === offeredGroupIndex) continue;
                var offeredGroup = groups[offeredGroupIndex];
                if (!isTradableGroup(offeredGroup)) continue;
                var offeredIndex = -1;
                var opponentOwnsRemainder = offeredGroup.every(function(index) {
                    var owner = state.square[index].owner;
                    if (owner === opponentIndex) return true;
                    if (offeredIndex !== -1 || owner !== this.player.index) return false;
                    offeredIndex = index;
                    return true;
                }, this);
                if (!opponentOwnsRemainder || offeredIndex === -1) continue;

                var propertyTransfer = [];
                propertyTransfer[requestedIndex] = -1;
                propertyTransfer[offeredIndex] = 1;
                if (!this.getDecision(this.player.position, 0, propertyTransfer).proposeTrade) return false;
                var squareIds = [];
                if (state.board) {
                    var squareId = state.board.startSquareId;
                    for (var squareOrdinal = 0; squareOrdinal < Object.keys(state.board.squaresById).length; squareOrdinal++) {
                        squareIds.push(squareId);
                        squareId = state.board.squaresById[squareId].nextId;
                    }
                } else {
                    squareIds = state.square.map(function(square, index) { return square.id || String(index); });
                }
                var offeredSquareIds = [], requestedSquareIds = [];
                propertyTransfer.forEach(function(direction, index) {
                    if (direction === 1) offeredSquareIds.push(squareIds[index]);
                    else if (direction === -1) requestedSquareIds.push(squareIds[index]);
                });
                yield [{ type: 'proposeTrade', offer: new Trade(this.player.playerId || this.player, state.player[opponentIndex].playerId || state.player[opponentIndex], 0, offeredSquareIds, requestedSquareIds, []) }];
                return true;
            }
        }
        return false;
    };

    /**
     * Called when player money is negative before bankruptcy check.
     */
    Gen6AI.prototype.payDebt = function*() {
        var game = this.player && this.player.game;
        var state = game && game.state;
        if (!state) return;

        // 1. Sell houses if necessary
        for (var i = 0; i < state.square.length; i++) {
            if (this.player.money >= 0) break;
            var sq = state.square[i];
            if (sq && sq.owner === this.player.index && (sq.house > 0 || sq.hotel > 0)) {
                var squareId = sq.id === undefined ? i : sq.id;
                var decision = this.getDecision(i, this.player.money);
                var sellCount = decision.sellHouseCount;
                while (sellCount > 0 && game.canSellHouse(squareId) && this.player.money < 0) {
                    if (!(yield [{ type: 'sellHouse', squareId: squareId }])) break;
                    sellCount--;
                }
            }
        }

        // 2. Mortgage properties if still in debt
        for (var i = 0; i < state.square.length; i++) {
            if (this.player.money >= 0) break;
            var sq = state.square[i];
            if (sq && sq.owner === this.player.index && !sq.mortgage && sq.house === 0 && sq.hotel === 0) {
                yield [{ type: 'mortgage', squareId: sq.id === undefined ? i : sq.id }];
            }
        }
    };

    /**
     * Called during auction rounds when it is AI's turn to bid.
     * @param {string|number} property - Stable square ID or network ordinal
     * @param {number} currentBid - Current highest bid
     * @returns {number} -1 (exit), 0 (pass), or positive bid amount
     */
    Gen6AI.prototype.inherit = function(squareIds) {
        var player = this.player, view = player.game.decisionView;
        var floor = Math.max(100, player.money * 0.25);
        var id = squareIds.find(function(id) {
            return view.getSquareState(id).mortgage && player.money - Math.round(view.getSquare(id).rules.purchasePrice * 0.5) >= floor;
        });
        return id ? [{ type: 'inheritUnmortgage', squareId: id }] : [];
    };

    Gen6AI.prototype.bid = function(property, currentBid) {
        var state = this.player.game && this.player.game.state;
        if (!Number.isFinite(this.player.money) || !Number.isInteger(currentBid) || currentBid < 0 || currentBid >= Math.floor(this.player.money)) return -1;
        if (state && state.board) {
            var ids = global.getSquareIds(state.board);
            var id = typeof property === 'string' ? property : ids[property];
            if (!state.board.squaresById[id] || state.squareStateById[id].ownerId !== null || state.board.squaresById[id].rules.purchasePrice <= 0) return -1;
            property = ids.indexOf(id);
        }
        if (!Number.isInteger(property) || property < 0 || property >= 40) return -1;
        var decisions = this.getDecision(property, currentBid);
        if (!Number.isFinite(decisions.bidValue)) return -1;
        var maxBid = Math.min(Math.floor(this.player.money), Math.floor(decisions.bidValue));
        return maxBid > currentBid ? maxBid : 0;
    };

    /**
     * Called when receiving a trade offer.
     * @param {Trade} tradeObj
     * @returns {boolean|Trade}
     */
    Gen6AI.prototype.acceptTrade = function(tradeObj) {
        var contextMoney = (tradeObj && typeof tradeObj.getMoney === 'function') ? tradeObj.getMoney() : 0;
        var contextProperties = [];
        if (tradeObj && typeof tradeObj.getProperty === 'function') {
            for (var i = 0; i < 40; i++) contextProperties[i] = tradeObj.getProperty(i) || 0;
        }
        var decisions = this.getDecision(undefined, contextMoney, contextProperties);
        return Boolean(decisions.acceptTrade);
    };

    var Gen6Module = {
        Gen6AI: Gen6AI
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Gen6Module;
    }
    global.Gen6AI = Gen6AI;
    global.Gen6Module = Gen6Module;
    if (global.AISetupRegistry) global.AISetupRegistry.register({
        id: "6",
        label: "Gen6 NEAT AI",
        defaultPriority: 6,
        maxBoardSquareCount: 40,
        createPlayer: function(player) {
            var trainer = global.Gen6Trainer;
            var trainedBrain = trainer ? trainer.getStoredChampion() : null;
            return new global.Gen6AI(player, trainedBrain);
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
