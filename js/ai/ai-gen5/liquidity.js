// Gen5 AI: stress-tested liquidity engine and dynamic cash reserve.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    var AVERAGE_CARD_PAYMENT_BUFFER = 25;

    function getTaxHazard(index) {
        var s = globalThis.square && globalThis.square[index];
        if (!s) {
            return 0;
        }
        // If the square is explicitly mocked as a buyable property with price and group, don't treat it as tax.
        if (s.price > 0 && s.group && s.group.length > 0) {
            return 0;
        }
        if (s.name && /tax/i.test(s.name)) {
            return /luxury/i.test(s.name) ? 100 : 200;
        }
        if ((index === 4 || index === 38) && (s.price === 0 || !s.group)) {
            return index === 4 ? 200 : 100;
        }
        return 0;
    }

    function computeBuildingObligationReserve(p) {
        if (!p || typeof globalThis.square === 'undefined') {
            return 0;
        }
        var square = globalThis.square;
        var seenGroups = {};
        var houseBuffer = 0;
        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (!s || !s.group || s.group.length < 2 || !s.houseprice || s.houseprice <= 0) {
                continue;
            }
            var key = s.group.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            var ownsAll = s.group.every(function(idx) {
                return square[idx] && square[idx].owner === p.index;
            });
            if (ownsAll) {
                var unbuiltInGroup = s.group.some(function(idx) {
                    return (square[idx].house || 0) < 3 && (!square[idx].hotel);
                });
                if (unbuiltInGroup) {
                    houseBuffer = Math.max(houseBuffer, s.houseprice * 1.5);
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
        var square = globalThis.square;

        // Jail status mitigation: while in jail, player is shielded from landing on dangerous properties.
        var inJail = !!p.jail;
        var jailRoll = p.jailroll || 0;
        var jailMitigationFactor = inJail ? (jailRoll >= 2 ? 0.8 : 0.35) : 1.0;
        var jailBailReserve = inJail ? 50 : 0;

        if (square && p.position !== undefined) {
            var rolls = AIGen5.Probability ? AIGen5.Probability.turnsToRolls(1) : 1;
            for (var i = 0; i < 40; i++) {
                var s = square[i];
                if (!s) {
                    continue;
                }

                var landProbability = AIGen5.Probability ? AIGen5.Probability.landingProbability(p.position, i, rolls) : 0;
                if (landProbability <= 0) {
                    continue;
                }

                // Tax hazards (e.g. Income Tax $200, Luxury Tax $100)
                var taxAmount = getTaxHazard(i);
                if (taxAmount > 0) {
                    taxExposure += landProbability * taxAmount;
                    continue;
                }

                // Opponent rental exposure
                if (s.owner !== 0 && s.owner !== p.index && !s.mortgage) {
                    var rent = AIGen5.Valuation ? AIGen5.Valuation.expectedRent(i, s.owner, null) : (s.baserent || 0);
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
        if (!p || typeof globalThis.square === 'undefined') {
            return { cash: (p && p.money) || 0, propertyEquity: 0, total: (p && p.money) || 0 };
        }
        var square = globalThis.square;
        var propertyEquity = 0;
        var cash = p.money || 0;

        for (var i = 0; i < 40; i++) {
            var s = square[i];
            if (!s || s.owner !== p.index) {
                continue;
            }
            var houses = s.hotel ? 5 : (s.house || 0);
            if (houses > 0 && s.houseprice > 0) {
                propertyEquity += houses * (s.houseprice * 0.5);
            }
            if (!s.mortgage && s.price > 0) {
                propertyEquity += s.price * 0.5;
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
