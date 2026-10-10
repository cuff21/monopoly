// Gen5 AI: trade acceptance/counter logic and proactive group-completion trade proposals.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    // Scores an incoming trade offer using a blended utility function:
    // Trade utility = immediate gain + future board gain + tempo effect + reputation effect - monopoly danger - cash stress - social friction
    function evaluate(tradeObj, p, profile, tradeMemory, turnNumber) {
        var state = AIGen5.getGameState(p);
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var money = tradeObj.getMoney();
        var initiator = view.getPlayer(tradeObj.getInitiator());
        var property = Object.create(null);
        var ownership = Object.create(null);
        var incomingValue = 0;
        var outgoingValue = 0;

        for (var i of squareIds) {
            property[i] = AIGen5.tradeProperty(tradeObj, i) || 0;
            if (property[i] > 0) {
                ownership[i] = p.playerId;
            } else if (property[i] < 0) {
                ownership[i] = initiator.playerId;
            }
        }

        for (var j of squareIds) {
            if (property[j] > 0) {
                incomingValue += AIGen5.Valuation.assetValue(j, p.playerId, ownership, p);
            }
            if (property[j] < 0) {
                outgoingValue += AIGen5.Valuation.assetValue(j, p.playerId, null, p);
            }
        }

        var tradeValue = money + incomingValue - outgoingValue;
        tradeValue += 15 * tradeObj.getHeldCards().reduce(function(total, card) { return total + card.direction; }, 0);

        var monopolyEnablementRisk = 0;
        var blockingValue = 0;
        var groupsTouched = Object.create(null);
        var boardMonopolies = AIGen5.Analytics && typeof AIGen5.Analytics.countBoardMonopolies === 'function' ? AIGen5.Analytics.countBoardMonopolies(true, state) : 0;
        for (var k of squareIds) {
            var s = view.getSquare(k);
            if (!s.groupId || property[k] === 0) {
                continue;
            }
            groupsTouched[s.groupId] = true;
        }

        for (var groupKey in groupsTouched) {
            var groupSquareIds = view.getGroupSquareIds(groupKey);
            var sampleSquare = view.getSquare(groupSquareIds[0]);
            var isColorGroup = sampleSquare && sampleSquare.rules.houseCost > 0 && groupSquareIds.length >= 2;

            var initiatorOwnsAll = groupSquareIds.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === initiator.playerId : view.getSquareState(idx).ownerId === initiator.playerId;
            });
            var initiatorAlreadyOwnedAll = groupSquareIds.every(function(idx) {
                return view.getSquareState(idx).ownerId === initiator.playerId;
            });
            var initiatorCompletes = initiatorOwnsAll && !initiatorAlreadyOwnedAll;

            var aiOwnsAll = groupSquareIds.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === p.playerId : view.getSquareState(idx).ownerId === p.playerId;
            });
            var aiAlreadyOwnedAll = groupSquareIds.every(function(idx) {
                return view.getSquareState(idx).ownerId === p.playerId;
            });
            var aiCompletes = aiOwnsAll && !aiAlreadyOwnedAll;

            if (initiatorCompletes) {
                var rank = AIGen5.Analytics ? AIGen5.Analytics.strengthRank(initiator) : 'Contender';
                var rankMultiplier = rank === 'Leader' ? (profile.leaderPenaltyWeight || 1.8) : (rank === 'Weak' || rank === 'NearBankrupt') ? (profile.weakOpponentLeniency || 0.4) : 1.0;
                var soleMonopolyMultiplier = boardMonopolies === 0 ? 2.5 : (boardMonopolies === 1 ? 1.6 : 1.1);

                if (isColorGroup) {
                    var initiatorPostTradeCash = (initiator.money || 0) - money;
                    var immediateHouses = AIGen5.Analytics && typeof AIGen5.Analytics.projectedImmediateHouses === 'function' ? AIGen5.Analytics.projectedImmediateHouses(initiator, groupSquareIds[0], initiatorPostTradeCash) : 0;
                    var houseLevel = Math.min(5, Math.floor(immediateHouses / groupSquareIds.length));

                    var avgGroupRent = 0;
                    for (var g = 0; g < groupSquareIds.length; g++) {
                        var gsq = view.getSquare(groupSquareIds[g]);
                        if (houseLevel > 0) {
                            avgGroupRent += (gsq.rules.rentTiers[(houseLevel) - 1] || (gsq.rules.baseRent * 5));
                        } else {
                            avgGroupRent += (gsq.rules.baseRent * 2);
                        }
                    }
                    avgGroupRent = avgGroupRent / groupSquareIds.length;

                    var aiLandingProb = 0;
                    if (AIGen5.Probability && p.squareId !== undefined) {
                        for (var g2 = 0; g2 < groupSquareIds.length; g2++) {
                            aiLandingProb += AIGen5.Probability.landingProbability(p.squareId, groupSquareIds[g2], 6, p);
                        }
                    }

                    var traffic = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupSquareIds[0], initiator.playerId, 4, state) : 0.5;
                    var immediateCapitalThreat = immediateHouses * sampleSquare.rules.houseCost * 0.8;
                    var immediateRentThreat = (aiLandingProb * avgGroupRent * 3.0) + (avgGroupRent * (0.5 + traffic) * 1.5);
                    var groupBaseRisk = immediateCapitalThreat + immediateRentThreat + 80;

                    // Future-turn buildability impact: if opponent will reach 3 houses within 2-4 turns, accelerate threat
                    if (AIGen5.Analytics && typeof AIGen5.Analytics.projectedFutureBuildability === 'function') {
                        var futureBuild = AIGen5.Analytics.projectedFutureBuildability(initiator, groupSquareIds[0], initiatorPostTradeCash, 3);
                        if (futureBuild && futureBuild.reachesThreeHouses) {
                            groupBaseRisk *= 1.35;
                        }
                    }

                    monopolyEnablementRisk += groupBaseRisk * rankMultiplier * soleMonopolyMultiplier * (profile.monopolyBlockWeight || 1);
                } else {
                    var nonColorRent = sampleSquare.kind === 'railroad' ? sampleSquare.rules.rentTiers[Math.min(groupSquareIds.length, sampleSquare.rules.rentTiers.length) - 1] : (sampleSquare.rules.rentTiers[0] * 10);
                    monopolyEnablementRisk += nonColorRent * rankMultiplier * (profile.monopolyBlockWeight || 1);
                }
            }

            if (aiCompletes) {
                if (isColorGroup) {
                    var aiPostTradeCash = (p.money || 0) + money;
                    var aiImmediateHouses = AIGen5.Analytics && typeof AIGen5.Analytics.projectedImmediateHouses === 'function' ? AIGen5.Analytics.projectedImmediateHouses(p, groupSquareIds[0], aiPostTradeCash) : 0;
                    var aiHouseLevel = Math.min(5, Math.floor(aiImmediateHouses / groupSquareIds.length));

                    var aiAvgRent = 0;
                    for (var ag = 0; ag < groupSquareIds.length; ag++) {
                        var asq = view.getSquare(groupSquareIds[ag]);
                        if (aiHouseLevel > 0) {
                            aiAvgRent += (asq.rules.rentTiers[(aiHouseLevel) - 1] || (asq.rules.baseRent * 5));
                        } else {
                            aiAvgRent += (asq.rules.baseRent * 2);
                        }
                    }
                    aiAvgRent = aiAvgRent / groupSquareIds.length;

                    var aiTraffic = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupSquareIds[0], p.playerId, 4, state) : 0.5;
                    blockingValue += ((aiAvgRent * (0.6 + aiTraffic) * 1.5) + (aiImmediateHouses * sampleSquare.rules.houseCost * 0.5) + 60) * (profile.monopolyBlockWeight || 1);
                } else {
                    blockingValue += 80 * (profile.monopolyBlockWeight || 1);
                }
            }
        }

        // Strategic lane blocking (railroads, utilities, and color sets)
        if (AIGen5.Valuation && typeof AIGen5.Valuation.strategicBlockingValue === 'function') {
            for (var bi of squareIds) {
                if (property[bi] < 0) { // AI gives away bi to initiator
                    monopolyEnablementRisk += AIGen5.Valuation.strategicBlockingValue(bi, p.playerId, initiator.playerId, p) * 0.5;
                } else if (property[bi] > 0) { // AI receives bi
                    blockingValue += AIGen5.Valuation.strategicBlockingValue(bi, p.playerId, initiator.playerId, p) * 0.5;
                }
            }
        }

        // Tempo gain / loss
        var tempoGain = 0;
        if (AIGen5.Valuation && typeof AIGen5.Valuation.tempoScore === 'function') {
            var postTempo = AIGen5.Valuation.tempoScore(p, ownership);
            var preTempo = AIGen5.Valuation.tempoScore(p);
            tempoGain = (postTempo - preTempo) * 0.6;
        }

        // Cash stress calculation
        var postCash = (p.money || 0) + money;
        var myReserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120;
        var cashStress = 0;
        if (postCash < myReserve) {
            cashStress = (myReserve - postCash) * 1.25;
        }

        // Reputation / social friction
        var frictionPenalty = 0;
        if (tradeMemory && typeof tradeMemory.getFrictionPenalty === 'function') {
            frictionPenalty = tradeMemory.getFrictionPenalty(initiator.playerId);
        }

        var netValue = tradeValue - monopolyEnablementRisk + blockingValue + tempoGain - cashStress - frictionPenalty;
        return {
            tradeValue: tradeValue,
            monopolyEnablementRisk: monopolyEnablementRisk,
            blockingValue: blockingValue,
            tempoGain: tempoGain,
            cashStress: cashStress,
            frictionPenalty: frictionPenalty,
            netValue: netValue
        };
    }

    function acceptTrade(tradeObj, p, profile, tradeMemory, turnNumber) {
        var state = AIGen5.getGameState(p);
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var initiator = view.getPlayer(tradeObj.getInitiator());
        var recipient = view.getPlayer(tradeObj.getRecipient());
        var evaluation = evaluate(tradeObj, p, profile, tradeMemory, turnNumber);

        var norm = AIGen5.TradeMemory.normalizeIncoming(tradeObj);
        var signature = AIGen5.TradeMemory.createSignature(norm.property, norm.money);
        var snapshot = AIGen5.TradeMemory.snapshotOf(initiator, turnNumber);

        var deadlock = AIGen5.Analytics && typeof AIGen5.Analytics.getDeadlockState === 'function' ? AIGen5.Analytics.getDeadlockState(p, initiator, turnNumber) : { mode: 'Normal', factor: 0 };
        var stagnation = deadlock.factor;
        var threshold = 85 * (profile.tradeBias || 1);

        // Deadlock threshold adjustments:
        if (deadlock.mode === 'SymmetricalDeadlock') {
            threshold *= (1 - stagnation * 0.35); // Lower greed and widen acceptance when game is deadlocked
        } else if (deadlock.mode === 'AsymmetricLead') {
            threshold += 20; // Protecting lead: drive a harder bargain
        } else if (deadlock.mode === 'AsymmetricTrailing') {
            threshold *= 0.85; // Trailing behind: increase trade willingness to shake up board
        } else {
            threshold *= (1 - stagnation * 0.3);
        }

        // Opponent tendency profiling:
        var oppTendency = tradeMemory && typeof tradeMemory.getOpponentTendency === 'function' ? tradeMemory.getOpponentTendency(initiator.playerId, initiator) : 'Balanced';
        if (oppTendency === 'Desperate') {
            threshold += 20; // Desperate opponents overpay for survival
        }

        var initiatorCompletesColorMonopoly = false;
        var aiCompletesColorMonopoly = false;

        var seenGroups = Object.create(null);
        for (var i of squareIds) {
            var propVal = AIGen5.tradeProperty(tradeObj, i) || 0;
            var s = view.getSquare(i);
            var sGroupIds = AIGen5.groupIds(view, s);
            if (!s || sGroupIds.length < 2 || propVal === 0) {
                continue;
            }
            var gKey = sGroupIds.join(',');
            if (seenGroups[gKey]) {
                continue;
            }
            seenGroups[gKey] = true;

            var isColorGroup = s.rules.houseCost > 0;
            var groupSquareIds = sGroupIds;

            var initAll = groupSquareIds.every(function(idx) {
                var pVal = AIGen5.tradeProperty(tradeObj, idx) || 0;
                return pVal < 0 || (view.getSquareState(idx).ownerId === initiator.playerId && pVal === 0);
            });
            var initPrior = groupSquareIds.every(function(idx) {
                return view.getSquareState(idx).ownerId === initiator.playerId;
            });
            if (isColorGroup && initAll && !initPrior) {
                initiatorCompletesColorMonopoly = true;
            }

            var aiAll = groupSquareIds.every(function(idx) {
                var pVal = AIGen5.tradeProperty(tradeObj, idx) || 0;
                return pVal > 0 || (view.getSquareState(idx).ownerId === p.playerId && pVal === 0);
            });
            var aiPrior = groupSquareIds.every(function(idx) {
                return view.getSquareState(idx).ownerId === p.playerId;
            });
            if (isColorGroup && aiAll && !aiPrior) {
                aiCompletesColorMonopoly = true;
            }
        }

        var isDefensive = AIGen5.isDefensiveProfile ? AIGen5.isDefensiveProfile(profile) : ((profile.riskTolerance || 0.5) <= 0.45);

        // Defensive personalities never give away an unreciprocated color monopoly.
        if (isDefensive && initiatorCompletesColorMonopoly && !aiCompletesColorMonopoly) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": defensive veto against unreciprocated color monopoly.");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
            return false;
        }

        // Mutual monopoly swap evaluation
        if (initiatorCompletesColorMonopoly && aiCompletesColorMonopoly) {
            var swapAcceptable = evaluation.netValue >= threshold;

            // In Asymmetric Deadlock where this AI leads, refuse mutual monopoly swaps that bail out the opponent
            if (deadlock.mode === 'AsymmetricLead') {
                var initCash = initiator.money || 0;
                if (initCash >= (p.money || 0) * 0.8) {
                    swapAcceptable = false;
                    console.log("[Gen5AI " + p.name + "] Refused mutual monopoly swap in Asymmetric Lead deadlock: opponent would gain comparable buildability.");
                }
            } else if (!swapAcceptable && (deadlock.mode === 'SymmetricalDeadlock' || stagnation > 0.6)) {
                // When stagnation is high (> 0.6) or in symmetrical deadlock, allow modest rent variance if bot has comparable cash
                var myCash = p.money || 0;
                var theirCash = initiator.money || 0;
                if (myCash >= theirCash * 0.75 && evaluation.netValue >= threshold - 65) {
                    swapAcceptable = true;
                    console.log("[Gen5AI " + p.name + "] Stagnation deadlock breaker activated: accepting mutual monopoly swap despite slight rent variance.");
                }
            }

            if (!swapAcceptable) {
                console.log("[Gen5AI " + p.name + "] Declined mutual monopoly swap with " + initiator.name + ": insufficient strategic advantage.");
                tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
                return false;
            }
        }

        // Check for bad faith retreat: opponent gave an offer worse than their previous offer in the active session
        if (tradeMemory.isBadFaithRegression && tradeMemory.isBadFaithRegression(initiator.playerId, evaluation.netValue, turnNumber)) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": bad faith regression detected (offer worsened from " + tradeMemory.getSession(initiator.playerId).lastNetValue + " to " + evaluation.netValue + ").");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
            return false;
        }

        var session = tradeMemory.startOrUpdateSession ? tradeMemory.startOrUpdateSession(initiator.playerId, evaluation.netValue, turnNumber) : { round: 1, squeezed: false };

        // Situation 2: Opponent gives an offer at or above the minimum acceptable level
        if (evaluation.netValue >= threshold) {
            var oppReserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(initiator, profile) : 120;
            var initiatorSurplusCash = Math.max(0, (initiator.money || 0) - (tradeObj.getMoney() || 0) - (oppReserve * 0.5));

            // Squeeze counter: only squeeze if opponent has meaningful surplus above reserve, and is not defensive or revengeful
            var allowSqueeze = !session.squeezed && initiatorSurplusCash >= 50 && oppTendency !== 'Defensive' && oppTendency !== 'Revengeful' && typeof Trade !== 'undefined';
            if (allowSqueeze) {
                session.squeezed = true;
                if (tradeMemory && typeof tradeMemory.recordSqueeze === 'function') {
                    tradeMemory.recordSqueeze(initiator.playerId);
                }
                var squeezeBonus = Math.min(Math.floor(initiatorSurplusCash * 0.35), 35);
                if (squeezeBonus >= 15) {
                    var squeezeMoney = (tradeObj.getMoney() || 0) + squeezeBonus;
                    var squeezeProperty = Object.create(null);
                    for (var spIdx of squareIds) {
                        squeezeProperty[spIdx] = AIGen5.tradeProperty(tradeObj, spIdx) || 0;
                    }
                    console.log("[Gen5AI " + p.name + "] Offer is acceptable, attempting one final squeeze counter (+$" + squeezeBonus + ") with " + initiator.name + ".");
                    tradeMemory.recordOutcome(initiator.playerId, signature, 'countered', snapshot, -squeezeMoney);
                    return AIGen5.counterTrade(tradeObj, squeezeMoney, squeezeProperty);
                }
            }

            // Acceptance:
            console.log("[Gen5AI " + p.name + "] Accepted trade offer from " + initiator.name + " (netValue: " + evaluation.netValue + " >= threshold: " + threshold + ").");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'accepted', snapshot);
            return true;
        }

        // Assess opponent solvency: do they have the means (cash + unbuilt, unmortgaged properties) to make an acceptable deal?
        var initiatorReserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(initiator, profile) : 120;
        var initiatorAvailableCash = Math.max(0, (initiator.money || 0) - initiatorReserve);
        var opponentTradeablePropertyVal = 0;
        var eligibleProperties = [];

        for (var ei of squareIds) {
            var esq = view.getSquare(ei);
            var esqGroupIds = AIGen5.groupIds(view, esq);
            if (esq && view.getSquareState(esq.id).ownerId === initiator.playerId && !view.getSquareState(esq.id).mortgage && (!view.getSquareState(esq.id).house || view.getSquareState(esq.id).house === 0) && (!view.getSquareState(esq.id).hotel || view.getSquareState(esq.id).hotel === 0)) {
                // Ensure no houses in this color group
                var groupSafe = true;
                if (esqGroupIds) {
                    for (var gi = 0; gi < esqGroupIds.length; gi++) {
                        var gTile = view.getSquare(esqGroupIds[gi]);
                        if (gTile && (view.getSquareState(gTile.id).house > 0 || view.getSquareState(gTile.id).hotel > 0)) {
                            groupSafe = false;
                            break;
                        }
                    }
                }
                if (groupSafe) {
                    var pAssetVal = AIGen5.Valuation ? AIGen5.Valuation.assetValue(ei, p.playerId, null, p) : (esq.rules.purchasePrice || 0);
                    opponentTradeablePropertyVal += pAssetVal;
                    eligibleProperties.push({ squareId: ei, value: pAssetVal, price: esq.rules.purchasePrice || 0, group: esqGroupIds });
                }
            }
        }

        var totalOpponentAssets = initiatorAvailableCash + opponentTradeablePropertyVal;
        var deficit = threshold - evaluation.netValue;

        // If opponent lacks the means to reach an acceptable trade even with all their assets, decline
        if (totalOpponentAssets < deficit * 0.7 || typeof Trade === 'undefined') {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": opponent lacks means to reach an acceptable offer (deficit: " + deficit + ", available assets: " + totalOpponentAssets + ").");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
            return false;
        }

        // Concession ladder:
        // Round 1: +$75 overshoot
        // Round 2: +$45
        // Round 3+: +$20
        var round = session.round || 1;
        var overshootAmount = round === 1 ? 75 : (round === 2 ? 45 : 20);

        // Adjust overshoot based on opponent personality and deadlock mode:
        if (oppTendency === 'Desperate') {
            overshootAmount += 20; // Squeeze desperate opponents harder
        } else if (oppTendency === 'Patient' && round >= 2) {
            overshootAmount = Math.max(10, overshootAmount - 10);
        }

        if (deadlock.mode === 'SymmetricalDeadlock' || stagnation > 0.4) {
            overshootAmount = Math.max(10, Math.floor(overshootAmount * 0.55)); // Lower greed to unlock game
        } else if (deadlock.mode === 'AsymmetricLead') {
            overshootAmount += 25; // Leader drives a hard bargain
        }

        var targetValueGap = deficit + overshootAmount;

        var counterProperty = Object.create(null);
        for (var cp of squareIds) {
            counterProperty[cp] = AIGen5.tradeProperty(tradeObj, cp) || 0;
        }

        var currentCounterCash = tradeObj.getMoney() || 0;
        var valueAddedByProperties = 0;

        // Sort eligible properties: prioritize those completing AI's color group, then utilities/railroads, then highest value
        eligibleProperties.sort(function(a, b) {
            var aScore = AIGen5.Valuation ? AIGen5.Valuation.groupScore(a.squareId, p.playerId, null, p) : 0;
            var bScore = AIGen5.Valuation ? AIGen5.Valuation.groupScore(b.squareId, p.playerId, null, p) : 0;
            if (aScore !== bScore) {
                return bScore - aScore;
            }
            return b.value - a.value;
        });

        // If cash alone cannot cover the target gap or if an eligible property completes an AI group, request property
        for (var ep = 0; ep < eligibleProperties.length; ep++) {
            if (currentCounterCash + (targetValueGap - valueAddedByProperties) > initiatorAvailableCash) {
                var candidate = eligibleProperties[ep];
                if (counterProperty[candidate.squareId] === 0) {
                    counterProperty[candidate.squareId] = 1;
                    valueAddedByProperties += candidate.value;
                    if (valueAddedByProperties >= targetValueGap) {
                        break;
                    }
                }
            }
        }

        var remainingValueNeeded = targetValueGap - valueAddedByProperties;
        var counterMoney = currentCounterCash + Math.ceil(remainingValueNeeded);

        // Bound counter cash by initiator's actual cash
        if (counterMoney > initiator.money) {
            counterMoney = initiator.money;
        }
        if (counterMoney < currentCounterCash && remainingValueNeeded > 0) {
            counterMoney = currentCounterCash;
        }

        // Special handling if initiator completes color monopoly: drain building funds
        if (initiatorCompletesColorMonopoly) {
            var drainBuildingFunds = Math.max(0, (initiator.money || 0) - initiatorReserve);
            counterMoney = Math.max(counterMoney, drainBuildingFunds);
            if (counterMoney > initiator.money) {
                console.log("[Gen5AI " + p.name + "] Declined monopoly trade with " + initiator.name + ": initiator cannot afford resource-draining price.");
                tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
                return false;
            }
        }

        // A property can overshoot the target value and make the recipient pay
        // cash back. Negative trade money must fit this bot's available cash.
        counterMoney = Math.max(counterMoney, -Math.max(0, Math.floor(p.money)));

        // If the resulting counter is worse or identical to the incoming offer
        if (counterMoney <= (tradeObj.getMoney() || 0) && valueAddedByProperties <= 0) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": unable to construct an advantageous counter.");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
            return false;
        }

        if (tradeMemory.isWorseCounter(initiator.playerId, signature, -counterMoney)) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": counter would be worse than previous counter in memory.");
            tradeMemory.recordOutcome(initiator.playerId, signature, 'rejected', snapshot);
            return false;
        }

        console.log("[Gen5AI " + p.name + "] Proposing overshoot counteroffer to " + initiator.name + " (round: " + round + ", overshoot: +$" + overshootAmount + ", counterCash: $" + counterMoney + ").");
        tradeMemory.recordOutcome(initiator.playerId, signature, 'countered', snapshot, -counterMoney);
        return AIGen5.counterTrade(tradeObj, counterMoney, counterProperty);
    }

    // Looks for a one-for-one property swap that would complete one of the AI's own groups.
    function findOpportunity(p, profile, turnNumber) {
        var state = AIGen5.getGameState(p);
        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var best = null;
        var availableCash = Math.max(0, p.money - (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120));
        var deadlock = AIGen5.Analytics && typeof AIGen5.Analytics.getDeadlockState === 'function' ? AIGen5.Analytics.getDeadlockState(p, null, turnNumber) : { mode: 'Normal', factor: 0 };
        var stagnation = deadlock.factor;

        for (var targetSquareId of squareIds) {
            var targetSquare = view.getSquare(targetSquareId);
            var targetSquareGroupIds = AIGen5.groupIds(view, targetSquare);
            if (!targetSquare || targetSquareGroupIds.length < 2) {
                continue;
            }

            var ownedInTarget = 0;
            var missingSquareId = null;
            var missingOwner = null;
            var blocked = false;
            for (var m = 0; m < targetSquareGroupIds.length; m++) {
                var memberSquareId = targetSquareGroupIds[m];
                var member = view.getSquare(memberSquareId);
                if (!member) {
                    blocked = true;
                    break;
                }
                if (view.getSquareState(member.id).house > 0 || view.getSquareState(member.id).hotel > 0) {
                    blocked = true;
                }
                if (view.getSquareState(member.id).ownerId === p.playerId) {
                    ownedInTarget++;
                } else {
                    missingSquareId = memberSquareId;
                    missingOwner = view.getSquareState(member.id).ownerId;
                }
            }
            if (blocked || ownedInTarget !== targetSquareGroupIds.length - 1 || missingOwner === null || missingOwner === p.playerId) {
                continue;
            }

            for (var offeredSquareId of squareIds) {
                var offerSquare = view.getSquare(offeredSquareId);
                var offerSquareGroupIds = AIGen5.groupIds(view, offerSquare);
                if (!offerSquare || view.getSquareState(offerSquare.id).ownerId !== p.playerId || offeredSquareId === missingSquareId || view.getSquareState(offerSquare.id).mortgage) {
                    continue;
                }
                if (view.getSquareState(offerSquare.id).house > 0 || view.getSquareState(offerSquare.id).hotel > 0 || targetSquareGroupIds.indexOf(offeredSquareId) !== -1) {
                    continue;
                }
                if (AIGen5.Valuation.groupScore(offeredSquareId, p.playerId, null, p) >= 80) {
                    continue;
                }

                // Check if offering offeredSquareId would complete missingOwner's color group
                if (offerSquare.rules.houseCost > 0 && offerSquareGroupIds.length >= 2) {
                    var opponentOwnedInOfferGroup = 0;
                    for (var og = 0; og < offerSquareGroupIds.length; og++) {
                        var ogIdx = offerSquareGroupIds[og];
                        if (ogIdx === offeredSquareId) {
                            continue;
                        }
                        if (view.getSquareState(ogIdx).ownerId === missingOwner) {
                            opponentOwnedInOfferGroup++;
                        }
                    }
                    var opponentCompletesMonopoly = (opponentOwnedInOfferGroup === offerSquareGroupIds.length - 1);
                    if (opponentCompletesMonopoly) {
                        var isDefensiveProfile = AIGen5.isDefensiveProfile ? AIGen5.isDefensiveProfile(profile) : ((profile.riskTolerance || 0.5) <= 0.45);
                        var opponentRent3 = offerSquare.rules.rentTiers[2] || (offerSquare.rules.baseRent * 10);
                        var myRent3 = targetSquare.rules.rentTiers[2] || (targetSquare.rules.baseRent * 10);
                        var opponentPlayer = AIGen5.Analytics ? AIGen5.Analytics.getPlayerById(missingOwner, state) : view.getPlayer(missingOwner);
                        var opponentCanBuildFaster = opponentPlayer && (opponentPlayer.money || 0) > (p.money || 0);

                        // If AI has Asymmetric Lead in a deadlock, refuse to propose mutual monopoly swaps
                        if (deadlock.mode === 'AsymmetricLead') {
                            continue;
                        }

                        // Under high stagnation (> 0.6) or symmetrical deadlock, allow mutual monopoly swaps with modest rent variance
                        var allowStagnantSwap = false;
                        if ((deadlock.mode === 'SymmetricalDeadlock' || stagnation > 0.6) && opponentPlayer && (p.money || 0) >= (opponentPlayer.money || 0) * 0.75 && myRent3 >= opponentRent3 * 0.75) {
                            allowStagnantSwap = true;
                        }

                        if (!allowStagnantSwap) {
                            if (isDefensiveProfile || opponentRent3 > myRent3 || (opponentCanBuildFaster && opponentRent3 >= myRent3 * 0.8)) {
                                continue;
                            }
                        }
                    }
                }

                var hypotheticalOwnership = Object.create(null);
                hypotheticalOwnership[missingSquareId] = p.playerId;
                hypotheticalOwnership[offeredSquareId] = missingOwner;
                var receivedValue = AIGen5.Valuation.assetValue(missingSquareId, p.playerId, hypotheticalOwnership, p);
                var offeredValue = AIGen5.Valuation.assetValue(offeredSquareId, p.playerId, null, p);
                var opponentTargetValue = AIGen5.Valuation.assetValue(missingSquareId, missingOwner, null, p);
                var opponentOfferValue = AIGen5.Valuation.assetValue(offeredSquareId, missingOwner, hypotheticalOwnership, p);
                var cashOffer = Math.max(0, Math.ceil(opponentTargetValue - opponentOfferValue + 85));
                var netGain = receivedValue - offeredValue - cashOffer;

                if (cashOffer <= availableCash && netGain > 20 && (!best || netGain > best.netGain)) {
                    best = { missingSquareId: missingSquareId, offeredSquareId: offeredSquareId, owner: missingOwner, cash: cashOffer, netGain: netGain };
                }
            }
        }

        return best;
    }

    function* proposeOpportunity(p, profile, tradeMemory, params, turnNumber) {
        var game = p && p.game;
        var state = AIGen5.getGameState(p);
        if (typeof Trade === 'undefined' || !game) {
            return false;
        }

        var opportunity = findOpportunity(p, profile, turnNumber);
        if (!opportunity) {
            return false;
        }

        var view = AIGen5.getDecisionView(p);
        var squareIds = view.getSquareIds();
        var property = Object.create(null);
        for (var i of squareIds) {
            property[i] = 0;
        }
        property[opportunity.missingSquareId] = -1;
        property[opportunity.offeredSquareId] = 1;

        var signature = AIGen5.TradeMemory.createSignature(property, opportunity.cash);
        var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerById(opportunity.owner, state) : view.getPlayer(opportunity.owner);
        var snapshot = AIGen5.TradeMemory.snapshotOf(opponent, turnNumber);

        if (!tradeMemory.shouldReoffer(opportunity.owner, signature, snapshot, params)) {
            return false;
        }

        var proposedTrade = new Trade(p.playerId, opponent.playerId, opportunity.cash, [opportunity.offeredSquareId], [opportunity.missingSquareId], []);
        yield [{ type: 'proposeTrade', offer: proposedTrade }];
        tradeMemory.recordOutcome(opportunity.owner, signature, 'proposed', snapshot);
        return false;
    }

    AIGen5.TradeEvaluation = {
        evaluate: evaluate,
        acceptTrade: acceptTrade,
        findOpportunity: findOpportunity,
        proposeOpportunity: proposeOpportunity
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AIGen5.TradeEvaluation;
    }
})(typeof window !== 'undefined' ? window : globalThis);
