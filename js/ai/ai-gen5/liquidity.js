// Gen5 AI: stress-tested liquidity engine and dynamic cash reserve.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    var AVERAGE_CARD_PAYMENT_BUFFER = 25;

    function getTaxHazard(squareId, subject) {
        var s = AIGen5.getDecisionView(subject).getSquare(squareId);
        return s.kind === 'tax' ? s.rules.taxAmount : 0;
    }

    function computeBuildingObligationReserve(p) {
        if (!p) {
            return 0;
        }
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var seenGroups = Object.create(null);
        var houseBuffer = 0;
        for (var i of squareIds) {
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (!s || sGroupIds.length < 2 || !s.rules.houseCost || s.rules.houseCost <= 0) {
                continue;
            }
            var key = sGroupIds.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            var ownsAll = sGroupIds.every(function(idx) {
                return view.getSquareState(idx).ownerId === p.playerId;
            });
            if (ownsAll) {
                var unbuiltInGroup = sGroupIds.some(function(idx) {
                    return (view.getSquareState(idx).house || 0) < 3 && (!view.getSquareState(idx).hotel);
                });
                if (unbuiltInGroup) {
                    houseBuffer = Math.max(houseBuffer, s.rules.houseCost * 1.5);
                }
            }
        }
        return houseBuffer;
    }

    // Reserve is not cached: it reflects the current board state, landing probability,
    // jail state, tax hazards, and upcoming building obligations every time it's asked for.
    function computeReserve(p, profile) {
        if (!p) {
            return 120;
        }

        var base = Math.max(120, (p.money || 0) * (profile && profile.liquidityFloor || 0.12));
        var ownExposure = 0;
        var taxExposure = 0;
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();

        // Jail status mitigation: while in jail, player is shielded from landing on dangerous properties.
        var inJail = !!p.jail;
        var jailRoll = p.jailroll || 0;
        var jailMitigationFactor = inJail ? (jailRoll >= 2 ? 0.8 : 0.35) : 1.0;
        var jailBailReserve = inJail ? view.board.rules.bailAmount : 0;

        if (view && p.squareId !== undefined) {
            var rolls = AIGen5.Probability ? AIGen5.Probability.turnsToRolls(1) : 1;
            for (var i of squareIds) {
                var s = view.getSquare(i);
                if (!s) {
                    continue;
                }

                var landProbability = AIGen5.Probability ? AIGen5.Probability.landingProbability(p.squareId, i, rolls, p) : 0;
                if (landProbability <= 0) {
                    continue;
                }

                // Tax hazards (e.g. Income Tax $200, Luxury Tax $100)
                var taxAmount = getTaxHazard(i, p);
                if (taxAmount > 0) {
                    taxExposure += landProbability * taxAmount;
                    continue;
                }

                // Opponent rental exposure
                if (view.getSquareState(s.id).ownerId !== null && view.getSquareState(s.id).ownerId !== p.playerId && !view.getSquareState(s.id).mortgage) {
                    var rent = AIGen5.Valuation ? AIGen5.Valuation.expectedRent(i, view.getSquareState(s.id).ownerId, null, p) : (s.rules.baseRent || 0);
                    if (Number.isFinite(rent)) {
                        ownExposure += landProbability * rent;
                    }
                }
            }
        }

        // Doubles grant an extra roll, compounding rent and tax exposure again with double probability.
        var doubleProb = AIGen5.Probability ? AIGen5.Probability.jailEscapeProbability() : (1 / 6);
        var doublesBuffer = (ownExposure + taxExposure) * doubleProb;

        // Building obligations: maintain liquidity cushion if developing a color monopoly
        var buildingObligation = computeBuildingObligationReserve(p);

        var netExposure = (ownExposure * jailMitigationFactor) + taxExposure + doublesBuffer;
        return base + netExposure + jailBailReserve + buildingObligation + AVERAGE_CARD_PAYMENT_BUFFER;
    }

    // Emergency liquidity: measures how much unencumbered equity a player can raise immediately
    // by mortgaging unimproved properties and liquidating houses at 50% resale value.
    function emergencyLiquidity(p) {
        if (!p) {
            return { cash: (p && p.money) || 0, propertyEquity: 0, total: (p && p.money) || 0 };
        }
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var propertyEquity = 0;
        var cash = p.money || 0;

        for (var i of squareIds) {
            var s = view.getSquare(i);
            if (!s || view.getSquareState(s.id).ownerId !== p.playerId) {
                continue;
            }
            var houses = view.getSquareState(s.id).hotel ? 5 : (view.getSquareState(s.id).house || 0);
            if (houses > 0 && s.rules.houseCost > 0) {
                propertyEquity += houses * (s.rules.houseCost * 0.5);
            }
            if (!view.getSquareState(s.id).mortgage && s.rules.purchasePrice > 0) {
                propertyEquity += s.rules.mortgageValue;
            }
        }

        return {
            cash: cash,
            propertyEquity: propertyEquity,
            total: cash + propertyEquity
        };
    }

    // Surplus cash strictly above the player's true reserve requirements.
    function surplusCash(p, profile) {
        if (!p) {
            return 0;
        }
        var reserve = computeReserve(p, profile);
        return Math.max(0, (p.money || 0) - reserve);
    }

    // Solvency score: ratio of cash plus emergency liquidation equity to expected reserve.
    // Score < 1.0 indicates a player is at severe bankruptcy risk upon an adverse roll.
    function solvencyScore(p, profile) {
        if (!p) {
            return 1.0;
        }
        var reserve = computeReserve(p, profile);
        var liq = emergencyLiquidity(p);
        var effectiveCapital = Math.max(0, p.money || 0) + liq.propertyEquity * 0.5;
        if (reserve <= 0) {
            return 2.0;
        }
        return effectiveCapital / reserve;
    }

    AIGen5.Liquidity = {
        computeReserve: computeReserve,
        computeTrueReserve: computeReserve,
        emergencyLiquidity: emergencyLiquidity,
        surplusCash: surplusCash,
        solvencyScore: solvencyScore
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Liquidity;
    }
})(typeof window !== 'undefined' ? window : globalThis);
