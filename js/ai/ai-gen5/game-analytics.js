// Gen5 AI: opponent strength ranking and monopoly-risk analytics.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isPlayerActive(p) {
        return !!p && (p.money >= 0 || p.creditor === -1);
    }

    function getActivePlayers() {
        if (typeof globalThis.player === 'undefined') {
            return [];
        }
        var playerLimit = globalThis.pcount && globalThis.pcount > 0 ? Math.min(globalThis.player.length, globalThis.pcount + 1) : globalThis.player.length;
        var active = [];
        for (var i = 1; i < playerLimit; i++) {
            if (isPlayerActive(globalThis.player[i])) {
                active.push(globalThis.player[i]);
            }
        }
        return active;
    }

    function groupIsMonopoly(group, ownerIndex) {
        if (!group || !group.length) {
            return false;
        }
        for (var i = 0; i < group.length; i++) {
            if (!globalThis.square[group[i]] || globalThis.square[group[i]].owner !== ownerIndex) {
                return false;
            }
        }
        return true;
    }

    function countMonopolies(ownerIndex, onlyBuildable) {
        if (typeof globalThis.square === 'undefined' || (ownerIndex !== 0 && !ownerIndex)) {
            return 0;
        }
        var seenGroups = {};
        var total = 0;
        for (var i = 0; i < 40; i++) {
            var s = globalThis.square[i];
            if (!s || !s.group || s.group.length === 0) {
                continue;
            }
            if (onlyBuildable && (!s.houseprice || s.houseprice <= 0)) {
                continue;
            }
            var key = s.group.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            if (groupIsMonopoly(s.group, ownerIndex)) {
                total++;
            }
        }
        return total;
    }

    function countBoardMonopolies(onlyBuildable) {
        if (typeof globalThis.square === 'undefined') {
            return 0;
        }
        var seenGroups = {};
        var total = 0;
        for (var i = 0; i < 40; i++) {
            var s = globalThis.square[i];
            if (!s || !s.group || s.group.length === 0 || s.owner === 0) {
                continue;
            }
            if (onlyBuildable && (!s.houseprice || s.houseprice <= 0)) {
                continue;
            }
            var key = s.group.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            if (groupIsMonopoly(s.group, s.owner)) {
                total++;
            }
        }
        return total;
    }

    function projectedImmediateHouses(player, squareIndex, cashAfterTrade) {
        if (!player || typeof globalThis.square === 'undefined') {
            return 0;
        }
        var s = globalThis.square[squareIndex];
        if (!s || !s.group || !s.houseprice || s.houseprice <= 0) {
            return 0;
        }
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (player.money || 0);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(player, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var maxTotalHouses = s.group.length * 5;
        var affordableTotalHouses = Math.floor(freeCash / s.houseprice);
        var feasibleHouses = Math.min(maxTotalHouses, affordableTotalHouses);
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility() : 1;
        return Math.floor(feasibleHouses * buildFeasibility);
    }

    // Projects build capacity over the next 2-4 turns, modeling passing GO, net rental income,
    // and whether the player will cross the critical 3-house inflection threshold within that window.
    function projectedFutureBuildability(player, squareIndex, cashAfterTrade, turnsAhead) {
        if (!player || typeof globalThis.square === 'undefined') {
            return { immediateHouses: 0, futureHouses: 0, reachesThreeHouses: false, futureRentThreat: 0 };
        }
        var s = globalThis.square[squareIndex];
        if (!s || !s.group || !s.houseprice || s.houseprice <= 0) {
            return { immediateHouses: 0, futureHouses: 0, reachesThreeHouses: false, futureRentThreat: 0 };
        }
        turnsAhead = turnsAhead || 3;
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (player.money || 0);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(player, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var housePrice = s.houseprice;
        var maxTotalHouses = s.group.length * 5;

        var immediateHouses = Math.min(maxTotalHouses, Math.floor(freeCash / housePrice));
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility() : 1;
        immediateHouses = Math.floor(immediateHouses * buildFeasibility);

        // Expected passing GO income (~$200 every 5 turns => ~$40/turn)
        var expectedGoIncome = 40 * turnsAhead;
        var expectedRentIncome = 0;
        for (var i = 0; i < 40; i++) {
            var tile = globalThis.square[i];
            if (tile && tile.owner === player.index && !tile.mortgage) {
                var rentVal = AIGen5.Valuation && typeof AIGen5.Valuation.expectedRentValue === 'function' ? AIGen5.Valuation.expectedRentValue(i, player.index, null, turnsAhead) : (tile.baserent || 0);
                expectedRentIncome += rentVal * 0.4;
            }
        }

        var projectedFutureFreeCash = Math.max(0, freeCash + expectedGoIncome + expectedRentIncome - (immediateHouses * housePrice));
        var additionalFutureHouses = Math.min(maxTotalHouses - immediateHouses, Math.floor(projectedFutureFreeCash / housePrice));
        additionalFutureHouses = Math.floor(additionalFutureHouses * buildFeasibility);

        var totalFutureHouses = immediateHouses + additionalFutureHouses;
        var targetThreeHousesTotal = s.group.length * 3;
        var reachesThreeHouses = totalFutureHouses >= targetThreeHousesTotal;

        var houseLevel = Math.min(5, Math.floor(totalFutureHouses / s.group.length));
        var avgRent = 0;
        for (var g = 0; g < s.group.length; g++) {
            var gsq = globalThis.square[s.group[g]];
            if (houseLevel > 0) {
                avgRent += (gsq['rent' + houseLevel] || (gsq.baserent * 5));
            } else {
                avgRent += (gsq.baserent * 2);
            }
        }
        avgRent = avgRent / s.group.length;

        return {
            immediateHouses: immediateHouses,
            futureHouses: totalFutureHouses,
            houseLevel: houseLevel,
            reachesThreeHouses: reachesThreeHouses,
            futureRentThreat: avgRent
        };
    }

    function getPlayerByIndex(index) {
        if (typeof globalThis.player === 'undefined') {
            return null;
        }
        return globalThis.player[index] || null;
    }

    // Approximate liquidation value of cash + properties + houses, used only for relative ranking between players.
    function netWorth(p) {
        if (!p) {
            return 0;
        }
        var total = p.money || 0;
        if (typeof globalThis.square === 'undefined') {
            return total;
        }
        for (var i = 0; i < 40; i++) {
            var s = globalThis.square[i];
            if (!s || s.owner !== p.index) {
                continue;
            }
            total += (s.price || 0) * (s.mortgage ? 0.5 : 1) * 0.6;
            var houseCount = s.hotel ? 5 : (s.house || 0);
            total += houseCount * (s.houseprice || 0) * 0.5;
        }
        return total;
    }

    // Classifies a player's relative position among active players: 'Leader', 'Contender', 'Weak', or 'NearBankrupt'.
    function strengthRank(p) {
        var players = getActivePlayers();
        if (!p || players.length === 0) {
            return 'Contender';
        }

        var worths = players.map(netWorth);
        var target = netWorth(p);
        var max = Math.max.apply(null, worths);
        var sum = worths.reduce(function(a, b) { return a + b; }, 0);
        var avg = sum / worths.length;

        if ((p.money || 0) < 100 && target <= avg * 0.4) {
            return 'NearBankrupt';
        }
        if (max > 0 && target >= max * 0.85) {
            return 'Leader';
        }
        if (target <= avg * 0.5) {
            return 'Weak';
        }
        return 'Contender';
    }

    // Estimates how dangerous it would be for `forPlayerIndex` to complete the color group containing `squareIndex`,
    // combining their ability to afford houses with how often opponents are likely to land on that group.
    function monopolyRisk(squareIndex, forPlayerIndex, cashAfterTrade) {
        if (typeof globalThis.square === 'undefined') {
            return 0;
        }
        var s = globalThis.square[squareIndex];
        if (!s || !s.group || s.group.length === 0) {
            return 0;
        }

        var forPlayer = getPlayerByIndex(forPlayerIndex);
        var houseBudget = (s.houseprice || 100) * s.group.length * 3;
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility() : 1;
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (forPlayer ? forPlayer.money || 0 : 0);
        var reserve = forPlayer && AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(forPlayer, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var affordability = houseBudget > 0 ? clamp(freeCash / houseBudget, 0, 2.5) * buildFeasibility : 0.5;

        var traffic = 0;
        if (AIGen5.Probability) {
            for (var i = 0; i < s.group.length; i++) {
                traffic += AIGen5.Probability.aggregateBoardThreat(s.group[i], forPlayerIndex, 4);
            }
            traffic = traffic / s.group.length;
        }

        var boardBuildableMonopolies = countBoardMonopolies(true);
        var soleMonopolyBonus = boardBuildableMonopolies === 0 ? 2.5 : (boardBuildableMonopolies === 1 ? 1.6 : 1.1);

        var immediateHouses = s.houseprice > 0 ? Math.min(s.group.length * 5, Math.floor(freeCash / s.houseprice)) : 0;
        var immediateHouseAvg = s.group.length > 0 ? immediateHouses / s.group.length : 0;
        var buildPressure = 1 + immediateHouseAvg * 0.5;

        // Future turn buildability modeling (2-4 turns):
        var futureBuild = projectedFutureBuildability(forPlayer, squareIndex, cash, 3);
        var futureMultiplier = futureBuild.reachesThreeHouses ? 1.75 : (futureBuild.futureHouses >= s.group.length * 2 ? 1.3 : 1.0);

        return (0.4 + affordability * 0.8) * (0.5 + traffic) * soleMonopolyBonus * buildPressure * futureMultiplier;
    }

    // Calculates a stagnation factor between 0.0 (fresh game / normal progress) and 1.0 (deadlocked).
    // Stagnation rises when many turns have elapsed, nearly all buyable properties are owned,
    // and no player holds a buildable monopoly to advance the game.
    function getStagnationFactor(p, turnNumber) {
        if (typeof globalThis.square === 'undefined') {
            return 0;
        }

        var buildableMonopolies = countBoardMonopolies(true);
        if (buildableMonopolies > 0) {
            return 0; // If any monopoly exists, houses can be built and progress continues.
        }

        var unownedCount = 0;
        for (var i = 0; i < 40; i++) {
            var s = globalThis.square[i];
            if (s && s.price > 0 && s.owner === 0) {
                unownedCount++;
            }
        }

        // Only stagnates once most properties on the board have been claimed (<= 4 unowned properties remain)
        if (unownedCount > 4) {
            return 0;
        }

        var turns = turnNumber || (p && p.AI && p.AI.turnNumber) || 0;
        var turnComponent = clamp((turns - 8) / 16, 0, 1.0); // Starts at turn 8, reaches full effect at turn 24
        var propertyDistributionComponent = clamp((4 - unownedCount) / 4, 0.2, 1.0);

        return clamp(turnComponent * propertyDistributionComponent, 0, 1.0);
    }

    // Formal deadlock state classifier:
    // Distinguishes between Asymmetric Deadlock (one player holds a decisive lead)
    // and Symmetrical Deadlock (both players are trapped with comparable standing).
    function getDeadlockState(p, opponent, turnNumber) {
        var factor = getStagnationFactor(p, turnNumber);
        if (factor < 0.4) {
            return {
                mode: 'Normal',
                factor: factor,
                isDeadlocked: false,
                isLeader: false,
                isTrailing: false,
                allowCreativeSwaps: false
            };
        }

        var myWorth = netWorth(p);
        var oppWorth = opponent ? netWorth(opponent) : myWorth;
        var sumWorth = Math.max(1, myWorth + oppWorth);
        var diffRatio = (myWorth - oppWorth) / sumWorth;

        // If AI holds > 15% net worth advantage over opponent, AI is leading in the deadlock
        if (diffRatio > 0.15) {
            return {
                mode: 'AsymmetricLead',
                factor: factor,
                isDeadlocked: true,
                isLeader: true,
                isTrailing: false,
                allowCreativeSwaps: false
            };
        }

        // If AI has > 15% net worth deficit, AI is trailing
        if (diffRatio < -0.15) {
            return {
                mode: 'AsymmetricTrailing',
                factor: factor,
                isDeadlocked: true,
                isLeader: false,
                isTrailing: true,
                allowCreativeSwaps: true
            };
        }

        // Symmetrical deadlock: players are roughly equal in assets and trapped without monopolies
        return {
            mode: 'SymmetricalDeadlock',
            factor: factor,
            isDeadlocked: true,
            isLeader: false,
            isTrailing: false,
            allowCreativeSwaps: true
        };
    }

    AIGen5.Analytics = {
        netWorth: netWorth,
        strengthRank: strengthRank,
        monopolyRisk: monopolyRisk,
        countMonopolies: countMonopolies,
        countBoardMonopolies: countBoardMonopolies,
        projectedImmediateHouses: projectedImmediateHouses,
        projectedFutureBuildability: projectedFutureBuildability,
        getStagnationFactor: getStagnationFactor,
        getDeadlockState: getDeadlockState,
        getActivePlayers: getActivePlayers,
        getPlayerByIndex: getPlayerByIndex
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Analytics;
    }
})(typeof window !== 'undefined' ? window : globalThis);
