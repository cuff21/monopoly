// Gen5 AI: trade acceptance/counter logic and proactive group-completion trade proposals.
(function(global) {
    var AIGen5 = global.AIGen5 = global.AIGen5 || {};

    // Scores an incoming trade offer using a blended utility function:
    // Trade utility = immediate gain + future board gain + tempo effect + reputation effect - monopoly danger - cash stress - social friction
    function evaluate(tradeObj, p, profile, tradeMemory, turnNumber) {
        var money = tradeObj.getMoney();
        var initiator = tradeObj.getInitiator();
        var property = [];
        var ownership = {};
        var incomingValue = 0;
        var outgoingValue = 0;

        for (var i = 0; i < 40; i++) {
            property[i] = tradeObj.getProperty(i) || 0;
            if (property[i] > 0) {
                ownership[i] = p.index;
            } else if (property[i] < 0) {
                ownership[i] = initiator.index;
            }
        }

        for (var j = 0; j < 40; j++) {
            if (property[j] > 0) {
                incomingValue += AIGen5.Valuation.assetValue(j, p.index, ownership);
            }
            if (property[j] < 0) {
                outgoingValue += AIGen5.Valuation.assetValue(j, p.index);
            }
        }

        var tradeValue = money + incomingValue - outgoingValue;
        tradeValue += 15 * tradeObj.getCommunityChestJailCard();
        tradeValue += 15 * tradeObj.getChanceJailCard();

        var monopolyEnablementRisk = 0;
        var blockingValue = 0;
        var groupsTouched = {};
        var boardMonopolies = AIGen5.Analytics && typeof AIGen5.Analytics.countBoardMonopolies === 'function' ? AIGen5.Analytics.countBoardMonopolies(true) : 0;
        for (var k = 0; k < 40; k++) {
            var s = globalThis.square[k];
            if (!s || !s.group || property[k] === 0) {
                continue;
            }
            groupsTouched[s.group.join(',')] = true;
        }

        for (var groupKey in groupsTouched) {
            var groupIndices = groupKey.split(',').map(Number);
            var sampleSquare = globalThis.square[groupIndices[0]];
            var isColorGroup = sampleSquare && sampleSquare.houseprice > 0 && groupIndices.length >= 2;

            var initiatorOwnsAll = groupIndices.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === initiator.index : globalThis.square[idx].owner === initiator.index;
            });
            var initiatorAlreadyOwnedAll = groupIndices.every(function(idx) {
                return globalThis.square[idx].owner === initiator.index;
            });
            var initiatorCompletes = initiatorOwnsAll && !initiatorAlreadyOwnedAll;

            var aiOwnsAll = groupIndices.every(function(idx) {
                return ownership[idx] !== undefined ? ownership[idx] === p.index : globalThis.square[idx].owner === p.index;
            });
            var aiAlreadyOwnedAll = groupIndices.every(function(idx) {
                return globalThis.square[idx].owner === p.index;
            });
            var aiCompletes = aiOwnsAll && !aiAlreadyOwnedAll;

            if (initiatorCompletes) {
                var rank = AIGen5.Analytics ? AIGen5.Analytics.strengthRank(initiator) : 'Contender';
                var rankMultiplier = rank === 'Leader' ? (profile.leaderPenaltyWeight || 1.8) : (rank === 'Weak' || rank === 'NearBankrupt') ? (profile.weakOpponentLeniency || 0.4) : 1.0;
                var soleMonopolyMultiplier = boardMonopolies === 0 ? 2.5 : (boardMonopolies === 1 ? 1.6 : 1.1);

                if (isColorGroup) {
                    var initiatorPostTradeCash = (initiator.money || 0) - money;
                    var immediateHouses = AIGen5.Analytics && typeof AIGen5.Analytics.projectedImmediateHouses === 'function' ? AIGen5.Analytics.projectedImmediateHouses(initiator, groupIndices[0], initiatorPostTradeCash) : 0;
                    var houseLevel = Math.min(5, Math.floor(immediateHouses / groupIndices.length));

                    var avgGroupRent = 0;
                    for (var g = 0; g < groupIndices.length; g++) {
                        var gsq = globalThis.square[groupIndices[g]];
                        if (houseLevel > 0) {
                            avgGroupRent += (gsq['rent' + houseLevel] || (gsq.baserent * 5));
                        } else {
                            avgGroupRent += (gsq.baserent * 2);
                        }
                    }
                    avgGroupRent = avgGroupRent / groupIndices.length;

                    var aiLandingProb = 0;
                    if (AIGen5.Probability && p.position !== undefined) {
                        for (var g2 = 0; g2 < groupIndices.length; g2++) {
                            aiLandingProb += AIGen5.Probability.landingProbability(p.position, groupIndices[g2], 6);
                        }
                    }

                    var traffic = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupIndices[0], initiator.index, 4) : 0.5;
                    var immediateCapitalThreat = immediateHouses * sampleSquare.houseprice * 0.8;
                    var immediateRentThreat = (aiLandingProb * avgGroupRent * 3.0) + (avgGroupRent * (0.5 + traffic) * 1.5);
                    var groupBaseRisk = immediateCapitalThreat + immediateRentThreat + 80;

                    // Future-turn buildability impact: if opponent will reach 3 houses within 2-4 turns, accelerate threat
                    if (AIGen5.Analytics && typeof AIGen5.Analytics.projectedFutureBuildability === 'function') {
                        var futureBuild = AIGen5.Analytics.projectedFutureBuildability(initiator, groupIndices[0], initiatorPostTradeCash, 3);
                        if (futureBuild && futureBuild.reachesThreeHouses) {
                            groupBaseRisk *= 1.35;
                        }
                    }

                    monopolyEnablementRisk += groupBaseRisk * rankMultiplier * soleMonopolyMultiplier * (profile.monopolyBlockWeight || 1);
                } else {
                    var nonColorRent = sampleSquare.group.length === 4 ? 200 : (sampleSquare.baserent * 10);
                    monopolyEnablementRisk += nonColorRent * rankMultiplier * (profile.monopolyBlockWeight || 1);
                }
            }

            if (aiCompletes) {
                if (isColorGroup) {
                    var aiPostTradeCash = (p.money || 0) + money;
                    var aiImmediateHouses = AIGen5.Analytics && typeof AIGen5.Analytics.projectedImmediateHouses === 'function' ? AIGen5.Analytics.projectedImmediateHouses(p, groupIndices[0], aiPostTradeCash) : 0;
                    var aiHouseLevel = Math.min(5, Math.floor(aiImmediateHouses / groupIndices.length));

                    var aiAvgRent = 0;
                    for (var ag = 0; ag < groupIndices.length; ag++) {
                        var asq = globalThis.square[groupIndices[ag]];
                        if (aiHouseLevel > 0) {
                            aiAvgRent += (asq['rent' + aiHouseLevel] || (asq.baserent * 5));
                        } else {
                            aiAvgRent += (asq.baserent * 2);
                        }
                    }
                    aiAvgRent = aiAvgRent / groupIndices.length;

                    var aiTraffic = AIGen5.Probability ? AIGen5.Probability.aggregateBoardThreat(groupIndices[0], p.index, 4) : 0.5;
                    blockingValue += ((aiAvgRent * (0.6 + aiTraffic) * 1.5) + (aiImmediateHouses * sampleSquare.houseprice * 0.5) + 60) * (profile.monopolyBlockWeight || 1);
                } else {
                    blockingValue += 80 * (profile.monopolyBlockWeight || 1);
                }
            }
        }

        // Strategic lane blocking (railroads, utilities, and color sets)
        if (AIGen5.Valuation && typeof AIGen5.Valuation.strategicBlockingValue === 'function') {
            for (var bi = 0; bi < 40; bi++) {
                if (property[bi] < 0) { // AI gives away bi to initiator
                    monopolyEnablementRisk += AIGen5.Valuation.strategicBlockingValue(bi, p.index, initiator.index) * 0.5;
                } else if (property[bi] > 0) { // AI receives bi
                    blockingValue += AIGen5.Valuation.strategicBlockingValue(bi, p.index, initiator.index) * 0.5;
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
            frictionPenalty = tradeMemory.getFrictionPenalty(initiator.index);
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
        var initiator = tradeObj.getInitiator();
        var recipient = tradeObj.getRecipient();
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
        var oppTendency = tradeMemory && typeof tradeMemory.getOpponentTendency === 'function' ? tradeMemory.getOpponentTendency(initiator.index, initiator) : 'Balanced';
        if (oppTendency === 'Desperate') {
            threshold += 20; // Desperate opponents overpay for survival
        }

        var initiatorCompletesColorMonopoly = false;
        var aiCompletesColorMonopoly = false;

        var seenGroups = {};
        for (var i = 0; i < 40; i++) {
            var propVal = tradeObj.getProperty(i) || 0;
            var s = globalThis.square[i];
            if (!s || !s.group || s.group.length < 2 || propVal === 0) {
                continue;
            }
            var gKey = s.group.join(',');
            if (seenGroups[gKey]) {
                continue;
            }
            seenGroups[gKey] = true;

            var isColorGroup = s.houseprice > 0;
            var groupIndices = s.group;

            var initAll = groupIndices.every(function(idx) {
                var pVal = tradeObj.getProperty(idx) || 0;
                return pVal < 0 || (globalThis.square[idx].owner === initiator.index && pVal === 0);
            });
            var initPrior = groupIndices.every(function(idx) {
                return globalThis.square[idx].owner === initiator.index;
            });
            if (isColorGroup && initAll && !initPrior) {
                initiatorCompletesColorMonopoly = true;
            }

            var aiAll = groupIndices.every(function(idx) {
                var pVal = tradeObj.getProperty(idx) || 0;
                return pVal > 0 || (globalThis.square[idx].owner === p.index && pVal === 0);
            });
            var aiPrior = groupIndices.every(function(idx) {
                return globalThis.square[idx].owner === p.index;
            });
            if (isColorGroup && aiAll && !aiPrior) {
                aiCompletesColorMonopoly = true;
            }
        }

        var isDefensive = AIGen5.isDefensiveProfile ? AIGen5.isDefensiveProfile(profile) : ((profile.riskTolerance || 0.5) <= 0.45);

        // Defensive personalities never give away an unreciprocated color monopoly.
        if (isDefensive && initiatorCompletesColorMonopoly && !aiCompletesColorMonopoly) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": defensive veto against unreciprocated color monopoly.");
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
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
                tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
                return false;
            }
        }

        // Check for bad faith retreat: opponent gave an offer worse than their previous offer in the active session
        if (tradeMemory.isBadFaithRegression && tradeMemory.isBadFaithRegression(initiator.index, evaluation.netValue, turnNumber)) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": bad faith regression detected (offer worsened from " + tradeMemory.getSession(initiator.index).lastNetValue + " to " + evaluation.netValue + ").");
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        var session = tradeMemory.startOrUpdateSession ? tradeMemory.startOrUpdateSession(initiator.index, evaluation.netValue, turnNumber) : { round: 1, squeezed: false };

        // Situation 2: Opponent gives an offer at or above the minimum acceptable level
        if (evaluation.netValue >= threshold) {
            var oppReserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(initiator, profile) : 120;
            var initiatorSurplusCash = Math.max(0, (initiator.money || 0) - (tradeObj.getMoney() || 0) - (oppReserve * 0.5));

            // Squeeze counter: only squeeze if opponent has meaningful surplus above reserve, and is not defensive or revengeful
            var allowSqueeze = !session.squeezed && initiatorSurplusCash >= 50 && oppTendency !== 'Defensive' && oppTendency !== 'Revengeful' && typeof Trade !== 'undefined';
            if (allowSqueeze) {
                session.squeezed = true;
                if (tradeMemory && typeof tradeMemory.recordSqueeze === 'function') {
                    tradeMemory.recordSqueeze(initiator.index);
                }
                var squeezeBonus = Math.min(Math.floor(initiatorSurplusCash * 0.35), 35);
                if (squeezeBonus >= 15) {
                    var squeezeMoney = (tradeObj.getMoney() || 0) + squeezeBonus;
                    var squeezeProperty = [];
                    for (var spIdx = 0; spIdx < 40; spIdx++) {
                        squeezeProperty[spIdx] = tradeObj.getProperty(spIdx) || 0;
                    }
                    console.log("[Gen5AI " + p.name + "] Offer is acceptable, attempting one final squeeze counter (+$" + squeezeBonus + ") with " + initiator.name + ".");
                    tradeMemory.recordOutcome(initiator.index, signature, 'countered', snapshot, -squeezeMoney);
                    return new Trade(initiator, recipient, squeezeMoney, squeezeProperty, tradeObj.getCommunityChestJailCard(), tradeObj.getChanceJailCard());
                }
            }

            // Acceptance:
            console.log("[Gen5AI " + p.name + "] Accepted trade offer from " + initiator.name + " (netValue: " + evaluation.netValue + " >= threshold: " + threshold + ").");
            tradeMemory.recordOutcome(initiator.index, signature, 'accepted', snapshot);
            return true;
        }

        // Assess opponent solvency: do they have the means (cash + unbuilt, unmortgaged properties) to make an acceptable deal?
        var initiatorReserve = AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(initiator, profile) : 120;
        var initiatorAvailableCash = Math.max(0, (initiator.money || 0) - initiatorReserve);
        var opponentTradeablePropertyVal = 0;
        var eligibleProperties = [];

        for (var ei = 0; ei < 40; ei++) {
            var esq = globalThis.square[ei];
            if (esq && esq.owner === initiator.index && !esq.mortgage && (!esq.house || esq.house === 0) && (!esq.hotel || esq.hotel === 0)) {
                // Ensure no houses in this color group
                var groupSafe = true;
                if (esq.group) {
                    for (var gi = 0; gi < esq.group.length; gi++) {
                        var gTile = globalThis.square[esq.group[gi]];
                        if (gTile && (gTile.house > 0 || gTile.hotel > 0)) {
                            groupSafe = false;
                            break;
                        }
                    }
                }
                if (groupSafe) {
                    var pAssetVal = AIGen5.Valuation ? AIGen5.Valuation.assetValue(ei, p.index) : (esq.price || 0);
                    opponentTradeablePropertyVal += pAssetVal;
                    eligibleProperties.push({ index: ei, value: pAssetVal, price: esq.price || 0, group: esq.group });
                }
            }
        }

        var totalOpponentAssets = initiatorAvailableCash + opponentTradeablePropertyVal;
        var deficit = threshold - evaluation.netValue;

        // If opponent lacks the means to reach an acceptable trade even with all their assets, decline
        if (totalOpponentAssets < deficit * 0.7 || typeof Trade === 'undefined') {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": opponent lacks means to reach an acceptable offer (deficit: " + deficit + ", available assets: " + totalOpponentAssets + ").");
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
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

        var counterProperty = [];
        for (var cp = 0; cp < 40; cp++) {
            counterProperty[cp] = tradeObj.getProperty(cp) || 0;
        }

        var currentCounterCash = tradeObj.getMoney() || 0;
        var valueAddedByProperties = 0;

        // Sort eligible properties: prioritize those completing AI's color group, then utilities/railroads, then highest value
        eligibleProperties.sort(function(a, b) {
            var aScore = AIGen5.Valuation ? AIGen5.Valuation.groupScore(a.index, p.index) : 0;
            var bScore = AIGen5.Valuation ? AIGen5.Valuation.groupScore(b.index, p.index) : 0;
            if (aScore !== bScore) {
                return bScore - aScore;
            }
            return b.value - a.value;
        });

        // If cash alone cannot cover the target gap or if an eligible property completes an AI group, request property
        for (var ep = 0; ep < eligibleProperties.length; ep++) {
            if (currentCounterCash + (targetValueGap - valueAddedByProperties) > initiatorAvailableCash) {
                var candidate = eligibleProperties[ep];
                if (counterProperty[candidate.index] === 0) {
                    counterProperty[candidate.index] = 1;
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
                tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
                return false;
            }
        }

        // If the resulting counter is worse or identical to the incoming offer
        if (counterMoney <= (tradeObj.getMoney() || 0) && valueAddedByProperties <= 0) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": unable to construct an advantageous counter.");
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        if (tradeMemory.isWorseCounter(initiator.index, signature, -counterMoney)) {
            console.log("[Gen5AI " + p.name + "] Declined trade with " + initiator.name + ": counter would be worse than previous counter in memory.");
            tradeMemory.recordOutcome(initiator.index, signature, 'rejected', snapshot);
            return false;
        }

        console.log("[Gen5AI " + p.name + "] Proposing overshoot counteroffer to " + initiator.name + " (round: " + round + ", overshoot: +$" + overshootAmount + ", counterCash: $" + counterMoney + ").");
        tradeMemory.recordOutcome(initiator.index, signature, 'countered', snapshot, -counterMoney);
        return new Trade(initiator, recipient, counterMoney, counterProperty, tradeObj.getCommunityChestJailCard(), tradeObj.getChanceJailCard());
    }

    // Looks for a one-for-one property swap that would complete one of the AI's own groups.
    function findOpportunity(p, profile, turnNumber) {
        var square = globalThis.square;
        var best = null;
        var availableCash = Math.max(0, p.money - (AIGen5.Liquidity ? AIGen5.Liquidity.computeReserve(p, profile) : 120));
        var deadlock = AIGen5.Analytics && typeof AIGen5.Analytics.getDeadlockState === 'function' ? AIGen5.Analytics.getDeadlockState(p, null, turnNumber) : { mode: 'Normal', factor: 0 };
        var stagnation = deadlock.factor;

        for (var targetIndex = 0; targetIndex < 40; targetIndex++) {
            var targetSquare = square[targetIndex];
            if (!targetSquare || !targetSquare.group || targetSquare.group.length < 2) {
                continue;
            }

            var ownedInTarget = 0;
            var missingIndex = -1;
            var missingOwner = 0;
            var blocked = false;
            for (var m = 0; m < targetSquare.group.length; m++) {
                var memberIndex = targetSquare.group[m];
                var member = square[memberIndex];
                if (!member) {
                    blocked = true;
                    break;
                }
                if (member.house > 0 || member.hotel > 0) {
                    blocked = true;
                }
                if (member.owner === p.index) {
                    ownedInTarget++;
                } else {
                    missingIndex = memberIndex;
                    missingOwner = member.owner;
                }
            }
            if (blocked || ownedInTarget !== targetSquare.group.length - 1 || missingOwner === 0 || missingOwner === p.index) {
                continue;
            }

            for (var offerIndex = 0; offerIndex < 40; offerIndex++) {
                var offerSquare = square[offerIndex];
                if (!offerSquare || offerSquare.owner !== p.index || offerIndex === missingIndex || offerSquare.mortgage) {
                    continue;
                }
                if (offerSquare.house > 0 || offerSquare.hotel > 0 || targetSquare.group.indexOf(offerIndex) !== -1) {
                    continue;
                }
                if (AIGen5.Valuation.groupScore(offerIndex, p.index) >= 80) {
                    continue;
                }

                // Check if offering offerIndex would complete missingOwner's color group
                if (offerSquare.group && offerSquare.houseprice > 0 && offerSquare.group.length >= 2) {
                    var opponentOwnedInOfferGroup = 0;
                    for (var og = 0; og < offerSquare.group.length; og++) {
                        var ogIdx = offerSquare.group[og];
                        if (ogIdx === offerIndex) {
                            continue;
                        }
                        if (square[ogIdx] && square[ogIdx].owner === missingOwner) {
                            opponentOwnedInOfferGroup++;
                        }
                    }
                    var opponentCompletesMonopoly = (opponentOwnedInOfferGroup === offerSquare.group.length - 1);
                    if (opponentCompletesMonopoly) {
                        var isDefensiveProfile = AIGen5.isDefensiveProfile ? AIGen5.isDefensiveProfile(profile) : ((profile.riskTolerance || 0.5) <= 0.45);
                        var opponentRent3 = offerSquare.rent3 || (offerSquare.baserent * 10);
                        var myRent3 = targetSquare.rent3 || (targetSquare.baserent * 10);
                        var opponentPlayer = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(missingOwner) : (globalThis.player ? globalThis.player[missingOwner] : null);
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

                var hypotheticalOwnership = {};
                hypotheticalOwnership[missingIndex] = p.index;
                hypotheticalOwnership[offerIndex] = missingOwner;
                var receivedValue = AIGen5.Valuation.assetValue(missingIndex, p.index, hypotheticalOwnership);
                var offeredValue = AIGen5.Valuation.assetValue(offerIndex, p.index);
                var opponentTargetValue = AIGen5.Valuation.assetValue(missingIndex, missingOwner);
                var opponentOfferValue = AIGen5.Valuation.assetValue(offerIndex, missingOwner, hypotheticalOwnership);
                var cashOffer = Math.max(0, Math.ceil(opponentTargetValue - opponentOfferValue + 85));
                var netGain = receivedValue - offeredValue - cashOffer;

                if (cashOffer <= availableCash && netGain > 20 && (!best || netGain > best.netGain)) {
                    best = { missingIndex: missingIndex, offerIndex: offerIndex, owner: missingOwner, cash: cashOffer, netGain: netGain };
                }
            }
        }

        return best;
    }

    function proposeOpportunity(p, profile, tradeMemory, params, turnNumber) {
        if (typeof Trade === 'undefined' || typeof game === 'undefined' || !game || typeof game.trade !== 'function') {
            return false;
        }

        var opportunity = findOpportunity(p, profile, turnNumber);
        if (!opportunity) {
            return false;
        }

        var property = [];
        for (var i = 0; i < 40; i++) {
            property[i] = 0;
        }
        property[opportunity.missingIndex] = -1;
        property[opportunity.offerIndex] = 1;

        var signature = AIGen5.TradeMemory.createSignature(property, opportunity.cash);
        var opponent = AIGen5.Analytics ? AIGen5.Analytics.getPlayerByIndex(opportunity.owner) : (typeof globalThis.player !== 'undefined' ? globalThis.player[opportunity.owner] : null);
        var snapshot = AIGen5.TradeMemory.snapshotOf(opponent, turnNumber);

        if (!tradeMemory.shouldReoffer(opportunity.owner, signature, snapshot, params)) {
            return false;
        }

        var proposedTrade = new Trade(p, opponent, opportunity.cash, property, 0, 0);
        game.trade(proposedTrade);
        tradeMemory.recordOutcome(opportunity.owner, signature, 'proposed', snapshot);
        return true;
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
