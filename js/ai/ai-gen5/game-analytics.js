// Gen5 AI: opponent strength ranking and monopoly-risk analytics.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function isPlayerActive(p) {
        return !!p && (p.money >= 0 || p.creditor === null);
    }

    function getActivePlayers(subject) {
        var players = AIGen5.getPlayers(subject);
        var active = [];
        for (var i = 0; i < players.length; i++) {
            if (isPlayerActive(players[i])) {
                active.push(players[i]);
            }
        }
        return active;
    }

    function groupIsMonopoly(group, ownerId, subject) {
        var view = AIGen5.getDecisionView(subject);
        if (!group || !group.length) {
            return false;
        }
        for (var i = 0; i < group.length; i++) {
            if (!view.getSquare(group[i]) || view.getSquareState(group[i]).ownerId !== ownerId) {
                return false;
            }
        }
        return true;
    }

    function countMonopolies(ownerId, onlyBuildable, subject) {
        var view = AIGen5.getDecisionView(subject);
        var squareIds = view.getSquareIds();
        if (!squareIds.length || !ownerId) {
            return 0;
        }
        var seenGroups = Object.create(null);
        var total = 0;
        for (var i of squareIds) {
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (!s || sGroupIds.length === 0) {
                continue;
            }
            if (onlyBuildable && (!s.rules.houseCost || s.rules.houseCost <= 0)) {
                continue;
            }
            var key = sGroupIds.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            if (groupIsMonopoly(sGroupIds, ownerId, subject)) {
                total++;
            }
        }
        return total;
    }

    function countBoardMonopolies(onlyBuildable, subject) {
        var view = AIGen5.getDecisionView(subject);
        var squareIds = view.getSquareIds();
        if (!squareIds.length) {
            return 0;
        }
        var seenGroups = Object.create(null);
        var total = 0;
        for (var i of squareIds) {
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (!s || sGroupIds.length === 0 || view.getSquareState(s.id).ownerId === null) {
                continue;
            }
            if (onlyBuildable && (!s.rules.houseCost || s.rules.houseCost <= 0)) {
                continue;
            }
            var key = sGroupIds.join(',');
            if (seenGroups[key]) {
                continue;
            }
            seenGroups[key] = true;
            if (groupIsMonopoly(sGroupIds, view.getSquareState(s.id).ownerId, subject)) {
                total++;
            }
        }
        return total;
    }

    function projectedImmediateHouses(player, squareId, cashAfterTrade) {
        var view = AIGen5.getDecisionView(player);
        var squareIds = view.getSquareIds();
        if (!player || !squareIds.length) {
            return 0;
        }
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || !s.rules.houseCost || s.rules.houseCost <= 0) {
            return 0;
        }
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (player.money || 0);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(player, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var maxTotalHouses = sGroupIds.length * 5;
        var affordableTotalHouses = Math.floor(freeCash / s.rules.houseCost);
        var feasibleHouses = Math.min(maxTotalHouses, affordableTotalHouses);
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility(player) : 1;
        return Math.floor(feasibleHouses * buildFeasibility);
    }

    // Projects build capacity over the next 2-4 turns, modeling passing GO, net rental income,
    // and whether the player will cross the critical 3-house inflection threshold within that window.
    function projectedFutureBuildability(player, squareId, cashAfterTrade, turnsAhead) {
        var view = AIGen5.getDecisionView(player);
        var squareIds = view.getSquareIds();
        if (!player || !squareIds.length) {
            return { immediateHouses: 0, futureHouses: 0, reachesThreeHouses: false, futureRentThreat: 0 };
        }
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || !s.rules.houseCost || s.rules.houseCost <= 0) {
            return { immediateHouses: 0, futureHouses: 0, reachesThreeHouses: false, futureRentThreat: 0 };
        }
        turnsAhead = turnsAhead || 3;
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (player.money || 0);
        var reserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(player, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var housePrice = s.rules.houseCost;
        var maxTotalHouses = sGroupIds.length * 5;

        var immediateHouses = Math.min(maxTotalHouses, Math.floor(freeCash / housePrice));
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility(player) : 1;
        immediateHouses = Math.floor(immediateHouses * buildFeasibility);

        // Expected passing GO income (~$200 every 5 turns => ~$40/turn)
        var expectedGoIncome = (view.board.rules.startSalary / 5) * turnsAhead;
        var expectedRentIncome = 0;
        for (var i of squareIds) {
            var tile = view.getSquare(i);
            if (tile && view.getSquareState(tile.id).ownerId === player.playerId && !view.getSquareState(tile.id).mortgage) {
                var rentVal = AIGen5.Valuation && typeof AIGen5.Valuation.expectedRentValue === 'function' ? AIGen5.Valuation.expectedRentValue(i, player.playerId, null, turnsAhead, player) : (tile.rules.baseRent || 0);
                expectedRentIncome += rentVal * 0.4;
            }
        }

        var projectedFutureFreeCash = Math.max(0, freeCash + expectedGoIncome + expectedRentIncome - (immediateHouses * housePrice));
        var additionalFutureHouses = Math.min(maxTotalHouses - immediateHouses, Math.floor(projectedFutureFreeCash / housePrice));
        additionalFutureHouses = Math.floor(additionalFutureHouses * buildFeasibility);

        var totalFutureHouses = immediateHouses + additionalFutureHouses;
        var targetThreeHousesTotal = sGroupIds.length * 3;
        var reachesThreeHouses = totalFutureHouses >= targetThreeHousesTotal;

        var houseLevel = Math.min(5, Math.floor(totalFutureHouses / sGroupIds.length));
        var avgRent = 0;
        for (var g = 0; g < sGroupIds.length; g++) {
            var gsq = view.getSquare(sGroupIds[g]);
            if (houseLevel > 0) {
                avgRent += (gsq.rules.rentTiers[(houseLevel) - 1] || (gsq.rules.baseRent * 5));
            } else {
                avgRent += (gsq.rules.baseRent * 2);
            }
        }
        avgRent = avgRent / sGroupIds.length;

        return {
            immediateHouses: immediateHouses,
            futureHouses: totalFutureHouses,
            houseLevel: houseLevel,
            reachesThreeHouses: reachesThreeHouses,
            futureRentThreat: avgRent
        };
    }

    function getPlayerById(playerId, subject) {
        return AIGen5.getDecisionView(subject).getPlayer(playerId);
    }

    // Approximate liquidation value of cash + properties + houses, used only for relative ranking between players.
    function netWorth(p) {
        if (!p) {
            return 0;
        }
        var total = p.money || 0;
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        for (var i of squareIds) {
            var s = view.getSquare(i);
            if (!s || view.getSquareState(s.id).ownerId !== p.playerId) {
                continue;
            }
            total += (s.rules.purchasePrice || 0) * (view.getSquareState(s.id).mortgage ? 0.5 : 1) * 0.6;
            var houseCount = view.getSquareState(s.id).hotel ? 5 : (view.getSquareState(s.id).house || 0);
            total += houseCount * (s.rules.houseCost || 0) * 0.5;
        }
        return total;
    }

    // Classifies a player's relative position among active players: 'Leader', 'Contender', 'Weak', or 'NearBankrupt'.
    function strengthRank(p) {
        var players = getActivePlayers(p);
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

    // Estimates how dangerous it would be for `forPlayerId` to complete the color group containing `squareId`,
    // combining their ability to afford houses with how often opponents are likely to land on that group.
    function monopolyRisk(squareId, forPlayerId, cashAfterTrade, subject) {
        var view = AIGen5.getDecisionView(subject);
        var squareIds = view.getSquareIds();
        if (!squareIds.length) {
            return 0;
        }
        var s = view.getSquare(squareId);
        var sGroupIds = AIGen5.groupIds(view, s);
        if (!s || sGroupIds.length === 0) {
            return 0;
        }

        var forPlayer = getPlayerById(forPlayerId, subject);
        var houseBudget = (s.rules.houseCost || 100) * sGroupIds.length * 3;
        var buildFeasibility = AIGen5.Valuation ? AIGen5.Valuation.houseBuildFeasibility(subject) : 1;
        var cash = cashAfterTrade !== undefined ? cashAfterTrade : (forPlayer ? forPlayer.money || 0 : 0);
        var reserve = forPlayer && AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(forPlayer, { riskTolerance: 0.6 }) : 120;
        var freeCash = Math.max(0, cash - reserve);
        var affordability = houseBudget > 0 ? clamp(freeCash / houseBudget, 0, 2.5) * buildFeasibility : 0.5;

        var traffic = 0;
        if (AIGen5.Probability) {
            for (var i = 0; i < sGroupIds.length; i++) {
                traffic += AIGen5.Probability.aggregateBoardThreat(sGroupIds[i], forPlayerId, 4, subject);
            }
            traffic = traffic / sGroupIds.length;
        }

        var boardBuildableMonopolies = countBoardMonopolies(true, subject);
        var soleMonopolyBonus = boardBuildableMonopolies === 0 ? 2.5 : (boardBuildableMonopolies === 1 ? 1.6 : 1.1);

        var immediateHouses = s.rules.houseCost > 0 ? Math.min(sGroupIds.length * 5, Math.floor(freeCash / s.rules.houseCost)) : 0;
        var immediateHouseAvg = sGroupIds.length > 0 ? immediateHouses / sGroupIds.length : 0;
        var buildPressure = 1 + immediateHouseAvg * 0.5;

        // Future turn buildability modeling (2-4 turns):
        var futureBuild = projectedFutureBuildability(forPlayer, squareId, cash, 3);
        var futureMultiplier = futureBuild.reachesThreeHouses ? 1.75 : (futureBuild.futureHouses >= sGroupIds.length * 2 ? 1.3 : 1.0);

        return (0.4 + affordability * 0.8) * (0.5 + traffic) * soleMonopolyBonus * buildPressure * futureMultiplier;
    }

    // Calculates a stagnation factor between 0.0 (fresh game / normal progress) and 1.0 (deadlocked).
    // Stagnation rises when many turns have elapsed, nearly all buyable properties are owned,
    // and no player holds a buildable monopoly to advance the game.
    function getStagnationFactor(p, turnNumber) {
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        if (!squareIds.length) {
            return 0;
        }

        var buildableMonopolies = countBoardMonopolies(true, p);
        if (buildableMonopolies > 0) {
            return 0; // If any monopoly exists, houses can be built and progress continues.
        }

        var unownedCount = 0;
        for (var i of squareIds) {
            var s = view.getSquare(i);
            if (s && s.rules.purchasePrice > 0 && view.getSquareState(s.id).ownerId === null) {
                unownedCount++;
            }
        }

        // Only stagnates once most properties on the board have been claimed (<= 4 unowned properties remain)
        if (unownedCount > 4) {
            return 0;
        }

        var turns = turnNumber || (p && p.policyMetadata && p.policyMetadata.turnNumber) || 0;
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
        getPlayerById: getPlayerById
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.Analytics;
    }
})(typeof window !== 'undefined' ? window : globalThis);
