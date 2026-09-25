// Gen5 AI: orchestrates the probability/analytics/valuation/liquidity/building/debt/trade/auction modules
// behind the same 7-hook contract the game engine expects (buyProperty, beforeTurn, onLand, acceptTrade,
// postBail, payDebt, bid).
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    var PROFILE_LIBRARY = [
        { name: 'Vulture', riskTolerance: 0.75, liquidityFloor: 0.10, endgameBias: 1.3, auctionBias: 1.15, tradeBias: 0.9, houseBias: 1.1, leaderPenaltyWeight: 1.9, monopolyBlockWeight: 1.2, weakOpponentLeniency: 0.3 },
        { name: 'Sentinel', riskTolerance: 0.35, liquidityFloor: 0.20, endgameBias: 0.9, auctionBias: 0.8, tradeBias: 1.1, houseBias: 0.8, leaderPenaltyWeight: 1.4, monopolyBlockWeight: 1.3, weakOpponentLeniency: 0.7 },
        { name: 'Tactician', riskTolerance: 0.55, liquidityFloor: 0.14, endgameBias: 1.05, auctionBias: 1.0, tradeBias: 1.0, houseBias: 1.0, leaderPenaltyWeight: 1.7, monopolyBlockWeight: 1.5, weakOpponentLeniency: 0.5 },
        { name: 'Gambler', riskTolerance: 0.9, liquidityFloor: 0.07, endgameBias: 1.4, auctionBias: 1.3, tradeBias: 1.15, houseBias: 1.35, leaderPenaltyWeight: 1.2, monopolyBlockWeight: 0.9, weakOpponentLeniency: 0.4 }
    ];

    function pickProfile(profileInput) {
        if (profileInput && profileInput.name) {
            var match = PROFILE_LIBRARY.filter(function(item) {
                return item.name.toLowerCase() === profileInput.name.toLowerCase();
            })[0];
            if (match) {
                return Object.assign({}, match, profileInput);
            }
            return Object.assign({}, PROFILE_LIBRARY[0], profileInput);
        }
        return Object.assign({}, PROFILE_LIBRARY[Math.floor(Math.random() * PROFILE_LIBRARY.length)]);
    }

    function Gen5AI(p, profileInput, paramsInput) {
        this.aiType = 'gen5';
        this.profile = pickProfile(profileInput);
        this.params = paramsInput || (AIGen5.ParameterGenerator ? AIGen5.ParameterGenerator.generate() : {});
        this.tradeMemory = AIGen5.TradeMemory.create();
        this.turnNumber = 0;

        if (!this.constructor.count) {
            this.constructor.count = 0;
        }
        this.constructor.count++;

        p.name = "Gen5 AI Player " + this.constructor.count;
        this.personality = this.profile.name;

        var self = this;

        this.buyProperty = function(index) {
            var s = globalThis.square[index];
            if (!s || s.price === 0 || s.owner !== 0) {
                return false;
            }

            var reserve = AIGen5.Liquidity.computeReserve(p, self.profile);
            if (p.money < s.price + reserve) {
                return false;
            }

            var score = AIGen5.Valuation.evaluateProperty(index, p.index, p.money, self.profile, 0);
            var threshold = self.profile.name === 'Sentinel' ? 68 : self.profile.name === 'Gambler' ? 50 : 58;
            return score >= threshold;
        };

        this.beforeTurn = function() {
            self.turnNumber++;
            AIGen5.Building.plan(p, self.profile, self.params);
            AIGen5.DebtManager.planUnmortgage(p, self.profile, self.params);
            return AIGen5.TradeEvaluation.proposeOpportunity(p, self.profile, self.tradeMemory, self.params, self.turnNumber);
        };

        this.onLand = function() {
            return AIGen5.TradeEvaluation.proposeOpportunity(p, self.profile, self.tradeMemory, self.params, self.turnNumber);
        };

        this.acceptTrade = function(tradeObj) {
            return AIGen5.TradeEvaluation.acceptTrade(tradeObj, p, self.profile, self.tradeMemory, self.turnNumber);
        };

        this.postBail = function() {
            var hasFreeCard = p.communityChestJailCard || p.chanceJailCard;
            var reserve = AIGen5.Liquidity.computeReserve(p, self.profile);
            var reserveAfterFine = p.money - 50 >= reserve * 0.75;

            if (p.jailroll === 2) {
                return true;
            }
            if (hasFreeCard) {
                return true;
            }
            if (!reserveAfterFine) {
                return false;
            }
            return p.jailroll >= 1 && self.profile.riskTolerance > 0.7;
        };

        this.payDebt = function() {
            AIGen5.DebtManager.resolveDebt(p);
        };

        this.bid = function(property, currentBid) {
            return AIGen5.Auction.bid(p, self.profile, self.params, property, currentBid);
        };
    }

    function isDefensiveProfile(profile) {
        if (!profile) {
            return false;
        }
        if (profile.isDefensive) {
            return true;
        }
        if (profile.name && profile.name.toLowerCase() === 'sentinel') {
            return true;
        }
        var risk = profile.riskTolerance !== undefined ? profile.riskTolerance : 0.5;
        var floor = profile.liquidityFloor !== undefined ? profile.liquidityFloor : 0.12;
        var block = profile.monopolyBlockWeight !== undefined ? profile.monopolyBlockWeight : 1.0;
        return risk <= 0.45 || (floor >= 0.18 && block >= 1.25);
    }

    AIGen5.isDefensiveProfile = isDefensiveProfile;

    Gen5AI.getRandomProfile = function() {
        return Object.assign({}, PROFILE_LIBRARY[Math.floor(Math.random() * PROFILE_LIBRARY.length)]);
    };

    Gen5AI.isDefensiveProfile = isDefensiveProfile;
    Gen5AI.PROFILE_LIBRARY = PROFILE_LIBRARY;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Gen5AI: Gen5AI, PROFILE_LIBRARY: PROFILE_LIBRARY, isDefensiveProfile: isDefensiveProfile };
    }

    global.Gen5AI = Gen5AI;
})(typeof window !== 'undefined' ? window : globalThis);
