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
    }

    TradeMemory.prototype.recordOutcome = function(opponentIndex, signature, status, snapshot, counterValue) {
        if (!this.records[opponentIndex]) {
            this.records[opponentIndex] = {};
        }
        this.records[opponentIndex][signature] = {
            status: status,
            snapshot: snapshot,
            counterValue: counterValue
        };
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
