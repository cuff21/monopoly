// Gen5 AI: per-instance trade negotiation ledger, preventing repeat/worse offers to the same opponent.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    // Both `property` and `money` must use the convention: positive = this AI gives it away, negative = this AI receives it.
    function createSignature(property, money) {
        var offered = [];
        var requested = [];
        for (var i = 0; i < 40; i++) {
            var v = property[i] || 0;
            if (v > 0) {
                offered.push(i);
            } else if (v < 0) {
                requested.push(i);
            }
        }
        var moneyBucket = Math.round((money || 0) / 25) * 25;
        return offered.join(',') + '|' + requested.join(',') + '|' + moneyBucket;
    }

    // Converts an incoming Trade object (this AI is the recipient) into the "this AI gives away" convention.
    function normalizeIncoming(tradeObj) {
        var property = [];
        for (var i = 0; i < 40; i++) {
            property[i] = -(tradeObj.getProperty(i) || 0);
        }
        return { property: property, money: -(tradeObj.getMoney() || 0) };
    }

    function snapshotOf(opponent, turnNumber) {
        var netWorth = AIGen5.Analytics ? AIGen5.Analytics.netWorth(opponent) : (opponent && opponent.money) || 0;
        return { netWorth: netWorth, turn: turnNumber || 0 };
    }

function TradeMemory() {
        this.records = {};
        this.negotiationSessions = {};
        this.reputations = {};
    }

    TradeMemory.prototype.getReputation = function(opponentIndex) {
        if (!this.reputations[opponentIndex]) {
            this.reputations[opponentIndex] = {
                proposalsReceived: 0,
                proposalsMade: 0,
                acceptedTrades: 0,
                rejectedTrades: 0,
                badFaithRegressions: 0,
                squeezesAttempted: 0,
                concessionsMade: 0,
                lastInteractionTurn: 0,
                hostility: 0,  // 0 to 100
                goodwill: 0    // 0 to 100
            };
        }
        return this.reputations[opponentIndex];
    };

    TradeMemory.prototype.recordBadFaith = function(opponentIndex) {
        var rep = this.getReputation(opponentIndex);
        rep.badFaithRegressions++;
        rep.hostility = Math.min(100, rep.hostility + 35);
        rep.goodwill = Math.max(0, rep.goodwill - 25);
    };

    TradeMemory.prototype.recordSqueeze = function(opponentIndex) {
        var rep = this.getReputation(opponentIndex);
        rep.squeezesAttempted++;
        rep.hostility = Math.min(100, rep.hostility + 15);
    };

    TradeMemory.prototype.recordOutcome = function(opponentIndex, signature, status, snapshot, counterValue) {
        if (!this.records[opponentIndex]) {
            this.records[opponentIndex] = {};
        }
        this.records[opponentIndex][signature] = {
            status: status,
            snapshot: snapshot,
            counterValue: counterValue
        };

        var rep = this.getReputation(opponentIndex);
        if (snapshot && snapshot.turn) {
            rep.lastInteractionTurn = snapshot.turn;
        }

        if (status === 'accepted') {
            rep.acceptedTrades++;
            rep.goodwill = Math.min(100, rep.goodwill + 20);
            rep.hostility = Math.max(0, rep.hostility - 15);
            this.clearSession(opponentIndex);
        } else if (status === 'rejected') {
            rep.rejectedTrades++;
            if (!this.negotiationSessions[opponentIndex]) {
                this.clearSession(opponentIndex);
            }
        } else if (status === 'countered') {
            rep.concessionsMade++;
        } else if (status === 'proposed') {
            rep.proposalsMade++;
        }
    };

    TradeMemory.prototype.startOrUpdateSession = function(opponentIndex, netValue, turnNumber) {
        var rep = this.getReputation(opponentIndex);
        rep.proposalsReceived++;
        if (turnNumber) {
            rep.lastInteractionTurn = turnNumber;
        }

        var session = this.negotiationSessions[opponentIndex];
        if (!session || (turnNumber !== undefined && session.lastTurn !== undefined && turnNumber - session.lastTurn > 1)) {
            session = {
                round: 1,
                lastNetValue: netValue,
                initialNetValue: netValue,
                squeezed: false,
                lastTurn: turnNumber || 0
            };
        } else {
            session.round++;
            session.lastNetValue = netValue;
            session.lastTurn = turnNumber || session.lastTurn || 0;
        }
        this.negotiationSessions[opponentIndex] = session;
        return session;
    };

    TradeMemory.prototype.getSession = function(opponentIndex) {
        return this.negotiationSessions[opponentIndex] || null;
    };

    TradeMemory.prototype.isBadFaithRegression = function(opponentIndex, currentNetValue, turnNumber) {
        var session = this.negotiationSessions[opponentIndex];
        if (!session) {
            return false;
        }
        if (turnNumber !== undefined && session.lastTurn !== undefined && turnNumber - session.lastTurn > 1) {
            return false;
        }
        // If the opponent previously made an offer in this session and this new offer offers less net value
        var regressed = session.round >= 1 && currentNetValue < session.lastNetValue - 4;
        if (regressed) {
            this.recordBadFaith(opponentIndex);
        }
        return regressed;
    };

    // Classifies opponent trading personality based on game-long interaction history and financial status.
    TradeMemory.prototype.getOpponentTendency = function(opponentIndex, opponentPlayer) {
        var rep = this.getReputation(opponentIndex);

        // 1. Revengeful / Grudge: repeated bad faith offers or high hostility
        if (rep.badFaithRegressions >= 2 || rep.hostility >= 50) {
            return 'Revengeful';
        }

        // 2. Desperate: near bankruptcy, low cash or solvency stress
        if (opponentPlayer) {
            var cash = opponentPlayer.money || 0;
            var rank = AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponentPlayer) : 'Contender';
            var solvency = AIGen5.Liquidity && typeof AIGen5.Liquidity.solvencyScore === 'function' ? AIGen5.Liquidity.solvencyScore(opponentPlayer) : 1.0;
            if (rank === 'NearBankrupt' || cash < 80 || solvency < 0.6) {
                return 'Desperate';
            }
        }

        // 3. Defensive: high rejection rate or explicitly defensive profile
        if (opponentPlayer && opponentPlayer.AI && opponentPlayer.AI.profile) {
            var oppProf = opponentPlayer.AI.profile;
            if (AIGen5.isDefensiveProfile && AIGen5.isDefensiveProfile(oppProf)) {
                return 'Defensive';
            }
        }
        if (rep.proposalsMade === 0 && rep.rejectedTrades >= 3 && rep.acceptedTrades === 0) {
            return 'Defensive';
        }

        // 4. Aggressive: aggressive builder, leader rank, or frequent monopolistic overtures
        if (opponentPlayer) {
            var oppRank = AIGen5.Analytics ? AIGen5.Analytics.strengthRank(opponentPlayer) : 'Contender';
            if (oppRank === 'Leader' && (opponentPlayer.money || 0) > 1000) {
                return 'Aggressive';
            }
        }

        // 5. Patient: high goodwill, balanced trades, healthy reserve
        if (rep.goodwill > 30 && rep.hostility < 20) {
            return 'Patient';
        }

        return 'Balanced';
    };

    // Returns net friction penalty (positive raises threshold / demands more; negative discounts threshold)
    TradeMemory.prototype.getFrictionPenalty = function(opponentIndex) {
        var rep = this.getReputation(opponentIndex);
        var hostilityPenalty = (rep.hostility / 100) * 35; // Up to +35 threshold penalty for toxic opponents
        var goodwillBonus = (rep.goodwill / 100) * 20;     // Up to -20 discount for trusted partners
        return hostilityPenalty - goodwillBonus;
    };

    TradeMemory.prototype.clearSession = function(opponentIndex) {
        delete this.negotiationSessions[opponentIndex];
    };

    // False unless the opponent's relevant wealth has shifted enough, or enough turns have passed,
    // since the last time this exact offer was rejected or countered.
    TradeMemory.prototype.shouldReoffer = function(opponentIndex, signature, currentSnapshot, params) {
        params = params || {};
        var wealthDeltaPct = params.tradeReofferWealthDeltaPct || 0.2;
        var turnGap = params.tradeReofferTurnGap || 8;

        var opponentRecords = this.records[opponentIndex];
        if (!opponentRecords || !opponentRecords[signature]) {
            return true;
        }

        var record = opponentRecords[signature];
        if (record.status === 'accepted') {
            return true;
        }

        var prior = record.snapshot || { netWorth: 0, turn: 0 };
        var wealthChange = prior.netWorth > 0 ? Math.abs(currentSnapshot.netWorth - prior.netWorth) / prior.netWorth : 1;
        var turnsElapsed = (currentSnapshot.turn || 0) - (prior.turn || 0);

        return wealthChange >= wealthDeltaPct || turnsElapsed >= turnGap;
    };

    // A counter is "worse" if it asks the opponent for more (in AI-gives-away terms, a lower/more negative
    // net money value) than a counter already exchanged for this same signature.
    TradeMemory.prototype.isWorseCounter = function(opponentIndex, signature, newCounterMoney) {
        var opponentRecords = this.records[opponentIndex];
        if (!opponentRecords || !opponentRecords[signature] || opponentRecords[signature].counterValue === undefined) {
            return false;
        }
        return newCounterMoney < opponentRecords[signature].counterValue;
    };

    AIGen5.TradeMemory = {
        create: function() { return new TradeMemory(); },
        createSignature: createSignature,
        normalizeIncoming: normalizeIncoming,
        snapshotOf: snapshotOf
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.TradeMemory;
    }
})(typeof window !== 'undefined' ? window : globalThis);
