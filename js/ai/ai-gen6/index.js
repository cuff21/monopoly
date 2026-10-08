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
        this.player = player;
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
        var players = [];
        var inputCount = this.phenotype.inputCount;
        var playerSlots = inputCount === 126 ? 4 : 8;
        var pcountVal = (typeof pcount !== 'undefined' ? pcount : playerSlots);
        var pArray = (typeof player !== 'undefined' && Array.isArray(player)) ? player : [];

        for (var i = 1; i <= Math.min(playerSlots, pcountVal); i++) {
            if (pArray[i]) {
                players.push(pArray[i]);
            }
        }
        while (players.length < playerSlots) {
            players.push({ money: 1500, position: 0, jail: false, communityChestJailCard: false, chanceJailCard: false });
        }

        var turnIdx = (this.player && this.player.index ? (this.player.index - 1) : 0);
        var inputs = NetworkAdapter.encodeInputs({
            players: players,
            currentTurn: turnIdx,
            squares: (typeof square !== 'undefined' ? square : []),
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
        var s = (typeof square !== 'undefined') ? square[index] : null;
        if (!s || this.player.money < s.price) {
            return false;
        }
        var decisions = this.getDecision(index);
        return Boolean(decisions.buyProperty);
    };

    /**
     * Called at the start of a turn while in jail.
     * @returns {boolean}
     */
    Gen6AI.prototype.postBail = function() {
        var decisions = this.getDecision(10);
        if (decisions.jailAction === 'card') {
            if (this.player.communityChestJailCard || this.player.chanceJailCard) {
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
    Gen6AI.prototype.beforeTurn = function() {
        if (typeof square === 'undefined') return false;

        // Apply the policy's mortgage decisions to properties without improvements.
        for (var i = 0; i < 40; i++) {
            var sq = square[i];
            if (!sq || sq.owner !== this.player.index) continue;

            var d = this.getDecision(i, this.player.money);
            if (sq.mortgage) {
                var unmortgagePrice = Math.round(sq.price * 0.55);
                if (d.unmortgage && this.player.money >= unmortgagePrice && typeof unmortgage === 'function') {
                    unmortgage(i);
                }
            } else if (d.mortgage && !sq.house && !sq.hotel && typeof mortgage === 'function') {
                mortgage(i);
            }
        }

        // 2. Build houses on completed color groups
        var supply = (typeof getHouseHotelSupply === 'function') ? getHouseHotelSupply() : { housesAvailable: 32, hotelsAvailable: 12 };
        if (supply.housesAvailable > 0 || supply.hotelsAvailable > 0) {
            for (var i = 0; i < 40; i++) {
                var sq = square[i];
                if (sq && sq.owner === this.player.index && sq.group && sq.houseprice > 0 && !sq.mortgage) {
                    var ownsAll = sq.group.every(function(idx) {
                        return square[idx] && square[idx].owner === sq.owner && !square[idx].mortgage;
                    });
                    if (ownsAll && sq.house < 5 && this.player.money >= sq.houseprice) {
                        var d = this.getDecision(i);
                        if (d.buildHouseCount > 0 && typeof buyHouse === 'function') {
                            buyHouse(i);
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
    Gen6AI.prototype.onLand = function() {
        if (typeof square === 'undefined' || typeof Trade !== 'function' ||
            typeof game === 'undefined' || !game || typeof game.trade !== 'function') {
            return false;
        }

        var groups = [];
        var seenGroups = {};
        for (var i = 0; i < 40; i++) {
            var sq = square[i];
            if (!sq || !sq.group || sq.houseprice <= 0) continue;
            var key = sq.group.slice().sort(function(a, b) { return a - b; }).join(',');
            if (!seenGroups[key]) {
                seenGroups[key] = true;
                groups.push(sq.group);
            }
        }

        function isTradableGroup(group) {
            return group.every(function(index) {
                var property = square[index];
                return property && !property.mortgage && !property.house && !property.hotel;
            });
        }

        for (var a = 0; a < groups.length; a++) {
            var requestedGroup = groups[a];
            if (!isTradableGroup(requestedGroup)) continue;
            var requestedIndex = -1;
            var opponentIndex = -1;
            var ownsRequestedRemainder = requestedGroup.every(function(index) {
                if (square[index].owner === this.player.index) return true;
                if (requestedIndex !== -1 || square[index].owner <= 0 || square[index].owner === this.player.index) return false;
                requestedIndex = index;
                opponentIndex = square[index].owner;
                return true;
            }, this);
            if (!ownsRequestedRemainder || requestedIndex === -1) continue;

            for (var b = 0; b < groups.length; b++) {
                if (a === b) continue;
                var offeredGroup = groups[b];
                if (!isTradableGroup(offeredGroup)) continue;
                var offeredIndex = -1;
                var opponentOwnsRemainder = offeredGroup.every(function(index) {
                    if (square[index].owner === opponentIndex) return true;
                    if (offeredIndex !== -1 || square[index].owner !== this.player.index) return false;
                    offeredIndex = index;
                    return true;
                }, this);
                if (!opponentOwnsRemainder || offeredIndex === -1) continue;

                var propertyTransfer = [];
                propertyTransfer[requestedIndex] = -1;
                propertyTransfer[offeredIndex] = 1;
                var decisions = this.getDecision(this.player.position, 0, propertyTransfer);
                if (!decisions.proposeTrade) return false;

                game.trade(new Trade(this.player, player[opponentIndex], 0, propertyTransfer, 0, 0));
                return true;
            }
        }

        return false;
    };

    /**
     * Called when player money is negative before bankruptcy check.
     */
    Gen6AI.prototype.payDebt = function() {
        if (typeof square === 'undefined') return;

        // 1. Sell houses if necessary
        for (var i = 0; i < 40; i++) {
            if (this.player.money >= 0) break;
            var sq = square[i];
            if (sq && sq.owner === this.player.index && (sq.house > 0 || sq.hotel > 0)) {
                var decision = this.getDecision(i, this.player.money);
                var sellCount = decision.sellHouseCount;
                while (sellCount > 0 && typeof canSellHouse === 'function' && canSellHouse(i) && this.player.money < 0) {
                    if (typeof sellHouse === 'function' && !sellHouse(i)) break;
                    sellCount--;
                }
            }
        }

        // 2. Mortgage properties if still in debt
        for (var i = 0; i < 40; i++) {
            if (this.player.money >= 0) break;
            var sq = square[i];
            if (sq && sq.owner === this.player.index && !sq.mortgage && sq.house === 0 && sq.hotel === 0) {
                if (typeof mortgage === 'function') {
                    mortgage(i);
                }
            }
        }
    };

    /**
     * Called during auction rounds when it is AI's turn to bid.
     * @param {number} property - Property index
     * @param {number} currentBid - Current highest bid
     * @returns {number} -1 (exit), 0 (pass), or positive bid amount
     */
    Gen6AI.prototype.bid = function(property, currentBid) {
        if (currentBid >= this.player.money) {
            return -1;
        }
        var decisions = this.getDecision(property, currentBid);
        var intendedBid = decisions.bidValue;
        if (intendedBid <= currentBid) {
            return 0;
        }
        var maxBid = Math.min(this.player.money, intendedBid);
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
        createPlayer: function(player) {
            var trainer = global.Gen6Trainer;
            var trainedBrain = trainer ? trainer.getStoredChampion() : null;
            return new global.Gen6AI(player, trainedBrain);
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
