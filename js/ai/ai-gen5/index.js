if (typeof module !== 'undefined' && module.exports) require('../../application/player-controllers');
// Gen5 AI: orchestrates the probability/analytics/valuation/liquidity/building/debt/trade/auction modules
// behind read-only policy helpers and resumable action planners driven by player controllers.
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
        if (!p || !p.game || !p.game.decisionView) throw new TypeError('Gen5 AI requires a structured Game decision view.');
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

        p = PlayerControllers.policyPlayer(p);
        PlayerControllers.bindPolicy(this, p);
        var self = this;

        this.buyProperty = function(squareId) {
            var state = AIGen5.getGameState(p);
            var view = AIGen5.getDecisionView(p);
            var s = view.getSquare(squareId);
            if (!s || s.rules.purchasePrice === 0 || view.getSquareState(s.id).ownerId !== null) {
                return false;
            }

            var reserve = AIGen5.Liquidity.computeReserve(p, self.profile);
            if (p.money < s.rules.purchasePrice + reserve) {
                return false;
            }

            var score = AIGen5.Valuation.evaluateProperty(squareId, p.playerId, p.money, self.profile, 0, state);
            var threshold = self.profile.name === 'Sentinel' ? 68 : self.profile.name === 'Gambler' ? 50 : 58;
            return score >= threshold;
        };

        this.beforeTurn = function*() {
            self.turnNumber++;
            yield* AIGen5.Building.plan(p, self.profile, self.params);
            yield* AIGen5.DebtManager.planUnmortgage(p, self.profile, self.params);
            return yield* AIGen5.TradeEvaluation.proposeOpportunity(p, self.profile, self.tradeMemory, self.params, self.turnNumber);
        };

        this.onLand = function*() {
            return yield* AIGen5.TradeEvaluation.proposeOpportunity(p, self.profile, self.tradeMemory, self.params, self.turnNumber);
        };

        this.acceptTrade = function(tradeObj) {
            return AIGen5.TradeEvaluation.acceptTrade(tradeObj, p, self.profile, self.tradeMemory, self.turnNumber);
        };

        this.postBail = function() {
            var hasFreeCard = p.heldCards && p.heldCards.length > 0;
            var reserve = AIGen5.Liquidity.computeReserve(p, self.profile);
            var reserveAfterFine = p.money - p.game.decisionView.board.rules.bailAmount >= reserve * 0.75;

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

        this.payDebt = function*() {
            yield* AIGen5.DebtManager.resolveDebt(p);
        };

        this.inherit = function(squareIds) {
            if (this.profile.name === 'Defensive') return [];
            var floor = Math.max(100, p.money * 0.25);
            var view = p.game.decisionView;
            var id = squareIds.find(function(id) {
                return view.getSquareState(id).mortgage && p.money - Math.round(view.getSquare(id).rules.purchasePrice * 0.5) >= floor;
            });
            return id ? [{ type: 'inheritUnmortgage', squareId: id }] : [];
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
    if (global.AISetupRegistry) global.AISetupRegistry.register({
        id: "5",
        label: "Gen5 AI",
        profiles: function() {
            return global.Gen5AI.PROFILE_LIBRARY.map(function(profile) { return profile.name; });
        },
        createPlayer: function(player, selection) {
            var profile = selection.profile === "Random"
                ? global.Gen5AI.getRandomProfile()
                : { name: selection.profile };
            return new global.Gen5AI(player, profile);
        }
    });
})(typeof window !== 'undefined' ? window : globalThis);
