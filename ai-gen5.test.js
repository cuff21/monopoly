const assert = require('assert');
require('./js/core/storage.js');

// --- Shared board/player mocks -------------------------------------------------------------
globalThis.square = [];
globalThis.square[0] = { index: 0, price: 100, group: [0, 1, 2], owner: 8, mortgage: false, house: 0, hotel: 0, baserent: 6, houseprice: 50, rent1: 30, rent2: 90, rent3: 270, rent4: 400, rent5: 550 };
globalThis.square[1] = { index: 1, price: 100, group: [0, 1, 2], owner: 8, mortgage: false, house: 0, hotel: 0, baserent: 6, houseprice: 50, rent1: 30, rent2: 90, rent3: 270, rent4: 400, rent5: 550 };
globalThis.square[2] = { index: 2, price: 120, group: [0, 1, 2], owner: 8, mortgage: false, house: 0, hotel: 0, baserent: 8, houseprice: 50, rent1: 40, rent2: 100, rent3: 300, rent4: 450, rent5: 600 };
globalThis.square[3] = { index: 3, price: 140, group: [3, 4], owner: 6, mortgage: false, house: 0, hotel: 0, baserent: 10, houseprice: 100 };
globalThis.square[4] = { index: 4, price: 140, group: [3, 4], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 10, houseprice: 100 };
globalThis.square[8] = { index: 8, price: 60, group: null, owner: 8, mortgage: false, house: 0, hotel: 0, baserent: 4, houseprice: 0 };
globalThis.square[10] = { index: 10, price: 300, group: null, owner: 6, mortgage: false, house: 5, hotel: 1, baserent: 20, houseprice: 200, rent1: 90, rent2: 250, rent3: 700, rent4: 875, rent5: 1050 };
globalThis.square[20] = { index: 20, price: 240, group: null, owner: 6, mortgage: false, house: 0, hotel: 0, baserent: 18, houseprice: 150 };

globalThis.player = [];
globalThis.player[1] = { index: 1, money: 1500, name: 'AI Under Test', human: false, position: 0 };
globalThis.player[6] = { index: 6, money: 3000, name: 'Leader', human: false, position: 10 };
globalThis.player[7] = { index: 7, money: 40, name: 'Weakling', human: false, position: 12 };
globalThis.player[8] = { index: 8, money: 1500, name: 'Builder', human: false, position: 0 };

const Probability = require('./js/ai/ai-gen5/probability.js');
const Analytics = require('./js/ai/ai-gen5/game-analytics.js');
const Valuation = require('./js/ai/ai-gen5/valuation.js');
const Liquidity = require('./js/ai/ai-gen5/liquidity.js');
const Building = require('./js/ai/ai-gen5/building.js');
const DebtManager = require('./js/ai/ai-gen5/debt-manager.js');
const TradeMemory = require('./js/ai/ai-gen5/trade-memory.js');
const TradeEvaluation = require('./js/ai/ai-gen5/trade-evaluation.js');
const Auction = require('./js/ai/ai-gen5/auction.js');
require('./js/ai/ai-gen5/parameter-generator.js');
const { Gen5AI, PROFILE_LIBRARY } = require('./js/ai/ai-gen5/index.js');

const balancedProfile = PROFILE_LIBRARY.filter(function(p) { return p.name === 'Tactician'; })[0];

// --- 1. Dynamic liquidity reserve reacts to real landing probability -----------------------
const builder = globalThis.player[8];
builder.position = 0; // one roll from square[10]'s neighborhood, owned by an opponent with a hotel
const reserveNearDanger = Liquidity.computeReserve(builder, balancedProfile);
builder.position = 39; // effectively unreachable from square[10] in a single roll
const reserveSafe = Liquidity.computeReserve(builder, balancedProfile);
builder.position = 0;
assert.ok(reserveNearDanger > reserveSafe, 'reserve should rise when a hotel-covered opponent square is reachable next roll');

// --- 2. Building batch-buys when safe, withholds when the reserve would be breached ---------
let houseBuyLog = [];
globalThis.buyHouse = function(index) {
    houseBuyLog.push(index);
    const s = globalThis.square[index];
    s.house = s.house + 1;
};

builder.money = 5000;
houseBuyLog = [];
const purchasesWhenSafe = Building.plan(builder, balancedProfile, { batchBuildMinROI: 0.01, reserveSafetyMargin: 1.0 });
assert.ok(purchasesWhenSafe.length >= 2, 'should batch-buy multiple houses when cash is abundant and safe');

globalThis.square[0].house = 0;
globalThis.square[1].house = 0;
globalThis.square[2].house = 0;
builder.money = 200;
houseBuyLog = [];
const purchasesWhenTight = Building.plan(builder, balancedProfile, { batchBuildMinROI: 0.01, reserveSafetyMargin: 1.0 });
assert.strictEqual(purchasesWhenTight.length, 0, 'should withhold building when it would breach the dynamic reserve');

// --- 3. Debt manager prefers mortgaging a low-traffic property over selling a house on a high-traffic one ---
let mortgagedIndexes = [];
let soldHouseIndexes = [];
globalThis.mortgage = function(index) {
    const s = globalThis.square[index];
    if (s.mortgage) return false;
    s.mortgage = true;
    mortgagedIndexes.push(index);
    globalThis.player[6].money += Math.round(s.price * 0.5);
    return true;
};
globalThis.sellHouse = function(index) {
    const s = globalThis.square[index];
    if (s.house === 0 && s.hotel === 0) return false;
    soldHouseIndexes.push(index);
    if (s.hotel === 1) { s.hotel = 0; s.house = 4; } else { s.house -= 1; }
    globalThis.player[6].money += Math.round(s.houseprice * 0.5);
    return true;
};
globalThis.canSellHouse = function(index) {
    const s = globalThis.square[index];
    return s.house > 0 || s.hotel === 1;
};

const debtor = globalThis.player[6];
globalThis.square[3].owner = 6;
globalThis.square[3].mortgage = false;
globalThis.square[3].house = 0;
globalThis.square[10].owner = 6; // the hotel property: high traffic, should be protected
debtor.money = -50;
mortgagedIndexes = [];
soldHouseIndexes = [];
DebtManager.resolveDebt(debtor);
assert.ok(mortgagedIndexes.indexOf(3) !== -1, 'should mortgage the low-traffic property to cover debt');
assert.strictEqual(soldHouseIndexes.length, 0, 'should not sell houses on the high-traffic hotel property when mortgaging alone covers the debt');

// --- 4. TradeMemory blocks unchanged repeat offers, allows them again after a real shift ----
const ledger = TradeMemory.create();
const property = [];
for (let i = 0; i < 40; i++) property[i] = 0;
property[3] = 1; // AI gives away square 3
property[4] = -1; // AI receives square 4
const signature = TradeMemory.createSignature(property, 0);
globalThis.player[9] = { index: 9, money: 500, name: 'Fresh Opponent' };
const opponent = globalThis.player[9];
const snapshotTurn1 = TradeMemory.snapshotOf(opponent, 1);
ledger.recordOutcome(opponent.index, signature, 'rejected', snapshotTurn1);

const snapshotTurn2 = TradeMemory.snapshotOf(opponent, 2);
assert.strictEqual(ledger.shouldReoffer(opponent.index, signature, snapshotTurn2, { tradeReofferTurnGap: 8, tradeReofferWealthDeltaPct: 0.2 }), false, 'should not repeat an unchanged rejected offer right away');

const originalMoney = opponent.money;
opponent.money = originalMoney * 2; // large wealth swing
const snapshotAfterWealthChange = TradeMemory.snapshotOf(opponent, 2);
assert.strictEqual(ledger.shouldReoffer(opponent.index, signature, snapshotAfterWealthChange, { tradeReofferTurnGap: 8, tradeReofferWealthDeltaPct: 0.2 }), true, 'should allow re-offering after a substantial wealth shift');
opponent.money = originalMoney;

// --- 5. Trade evaluation penalizes enabling a Leader's monopoly more than a Weak opponent's -
globalThis.player[1].money = 1500;
globalThis.player[6].money = 4000; // clearly the wealthiest active player: a Leader
globalThis.player[7].money = 20; // clearly the poorest: Weak/NearBankrupt
globalThis.player[8].money = 800;
globalThis.player[9].money = 800;
globalThis.square[3].owner = 0;
globalThis.square[3].mortgage = false;
globalThis.square[3].house = 0;
globalThis.square[4].owner = 0;

function buildTradeToward(initiator, missingGroupMember) {
    return {
        getMoney: () => 0,
        getInitiator: () => initiator,
        getRecipient: () => globalThis.player[1],
        getCommunityChestJailCard: () => 0,
        getChanceJailCard: () => 0,
        // -1 = requested by the initiator, i.e. the AI gives this square away and the initiator ends up owning it.
        getProperty: (idx) => (idx === missingGroupMember ? -1 : 0)
    };
}

globalThis.square[3].owner = 6; // Leader already owns the other half of this group
globalThis.square[4].owner = 1; // AI under test owns the piece being requested away
const tradeToLeader = buildTradeToward(globalThis.player[6], 4);
const evalLeader = TradeEvaluation.evaluate(tradeToLeader, globalThis.player[1], balancedProfile);

globalThis.square[3].owner = 7; // Weak/near-bankrupt opponent owns the other half instead
const tradeToWeak = buildTradeToward(globalThis.player[7], 4);
const evalWeak = TradeEvaluation.evaluate(tradeToWeak, globalThis.player[1], balancedProfile);

assert.ok(evalLeader.monopolyEnablementRisk > evalWeak.monopolyEnablementRisk, 'completing a Leader monopoly should be penalized more than an equivalent trade with a weak opponent');

// --- 6. Phase 0 history tagging keeps gen5 and legacy genetic3 parameter pools separate -----
globalThis.localStorage = {
    _store: {},
    getItem: function(key) { return this._store[key] !== undefined ? this._store[key] : null; },
    setItem: function(key, value) { this._store[key] = value; }
};
const legacyParams = {
    purchaseThreshold: 12, housePurchaseThreshold: 11, bidUp: 28, tradeAcceptanceThreshold: 5,
    tradeRejectionThreshold: -90, spotsBehind: 9, spotsAhead: 8, communityChestJailCardValue: 9,
    chanceJailCardValue: 9, maxAmountOfRejections: 3, firstBuildingOdds: 33, lastBuildingOdds: 78
};
globalThis.localStorage.setItem('gameHistory', JSON.stringify([
    [{ type: 'genetic3', result: 'win', params: legacyParams }, { type: 'gen5', result: 'win', params: { reserveSafetyMargin: 1.9, batchBuildMinROI: 0.5, unmortgageROIThreshold: 0.3, tradeReofferWealthDeltaPct: 0.5, tradeReofferTurnGap: 15, auctionBlockPremium: 1.9 } }],
    [{ type: 'genetic3', result: 'win', params: legacyParams }]
]));

require('./js/ai/parameter-generator.js');
const originalRandom = Math.random;
Math.random = function() { return 0.1; }; // force the evolve-from-winners branch deterministically
const evolvedLegacy = globalThis.generateParameters();
Math.random = originalRandom;

Object.keys(legacyParams).forEach(function(key) {
    assert.ok(Number.isFinite(evolvedLegacy[key]), 'legacy param "' + key + '" should stay a finite number, not be corrupted by mixed-in gen5 entries');
});

// --- 7. Real game counts must exclude ghost players and monopoly gifts must be heavily penalized ---
globalThis.square = [];
for (var i = 0; i < 40; i++) {
    globalThis.square[i] = { index: i, owner: 0, mortgage: false, house: 0, hotel: 0, group: undefined, price: 0, baserent: 0, houseprice: 0 };
}
for (var groupIndex = 0; groupIndex < 40; groupIndex++) {
    globalThis.square[groupIndex].group = undefined;
}
globalThis.square[21] = { index: 21, owner: 0, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 220, baserent: 90, houseprice: 100 };
globalThis.square[23] = { index: 23, owner: 0, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 220, baserent: 90, houseprice: 100 };
globalThis.square[24] = { index: 24, owner: 0, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 240, baserent: 100, houseprice: 100 };
globalThis.player = [];
for (var playerIndex = 0; playerIndex <= 8; playerIndex++) {
    globalThis.player[playerIndex] = { index: playerIndex, money: 1500, name: 'Ghost ' + playerIndex, human: false, position: 0, creditor: -1, jail: false, jailroll: 0 };
}
globalThis.pcount = 4;
globalThis.player[1] = { index: 1, money: 1500, name: 'Red Bot', human: false, position: 0, creditor: -1, jail: false, jailroll: 0 };
globalThis.player[2] = { index: 2, money: 1800, name: 'Blue Bot', human: false, position: 0, creditor: -1, jail: false, jailroll: 0 };
globalThis.player[3] = { index: 3, money: 900, name: 'Lime Bot', human: false, position: 0, creditor: -1, jail: false, jailroll: 0 };
globalThis.player[4] = { index: 4, money: 600, name: 'Human', human: true, position: 0, creditor: -1, jail: false, jailroll: 0 };

var activePlayers = Analytics.getActivePlayers();
assert.strictEqual(activePlayers.length, 4, 'should ignore ghost players above the real game count');
assert.ok(activePlayers.some(function(p) { return p.index === 1; }), 'should still include active players inside the real game count');

var monopolyTrade = {
    getMoney: function() { return 0; },
    getInitiator: function() { return globalThis.player[2]; },
    getRecipient: function() { return globalThis.player[1]; },
    getCommunityChestJailCard: function() { return 0; },
    getChanceJailCard: function() { return 0; },
    getProperty: function(idx) {
        return idx === 21 || idx === 23 || idx === 24 ? -1 : 0;
    }
};
var monopolyEval = TradeEvaluation.evaluate(monopolyTrade, globalThis.player[1], balancedProfile);
assert.ok(monopolyEval.monopolyEnablementRisk > 120, 'granting an opponent a complete monopoly should trigger a steep penalty for all Gen5 personalities');

// Defensive profile detection, multi-monopoly counting, and real-time build threat ---
if (typeof globalThis.Trade === 'undefined') {
    globalThis.Trade = function(initiator, recipient, money, property, communityChestJailCard, chanceJailCard) {
        this.getInitiator = function() { return initiator; };
        this.getRecipient = function() { return recipient; };
        this.getMoney = function() { return money; };
        this.getProperty = function(index) { return property[index] || 0; };
        this.getCommunityChestJailCard = function() { return communityChestJailCard || 0; };
        this.getChanceJailCard = function() { return chanceJailCard || 0; };
    };
}

// Trait-based defensive profile detection
const sentinelProfile = PROFILE_LIBRARY.filter(function(p) { return p.name === 'Sentinel'; })[0];
const gamblerProfile = PROFILE_LIBRARY.filter(function(p) { return p.name === 'Gambler'; })[0];
assert.strictEqual(Gen5AI.isDefensiveProfile(sentinelProfile), true, 'Sentinel should be identified as defensive');
assert.strictEqual(Gen5AI.isDefensiveProfile({ riskTolerance: 0.35, liquidityFloor: 0.15 }), true, 'Profile with low riskTolerance should be defensive');
assert.strictEqual(Gen5AI.isDefensiveProfile({ isDefensive: true }), true, 'Explicitly tagged defensive profile should be defensive');
assert.strictEqual(Gen5AI.isDefensiveProfile(gamblerProfile), false, 'Gambler should not be classified as defensive');

// Multi-monopoly counting (not collapsing multi-monopolies into unique owners)
globalThis.square[1] = { index: 1, owner: 2, mortgage: false, house: 0, hotel: 0, group: [1, 3], price: 60, baserent: 2, houseprice: 50 };
globalThis.square[3] = { index: 3, owner: 2, mortgage: false, house: 0, hotel: 0, group: [1, 3], price: 60, baserent: 4, houseprice: 50 };
globalThis.square[21].owner = 2;
globalThis.square[23].owner = 2;
globalThis.square[24].owner = 2;
assert.strictEqual(Analytics.countMonopolies(2, true), 2, 'player 2 should be credited with exactly 2 distinct buildable monopolies');
assert.strictEqual(Analytics.countBoardMonopolies(true), 2, 'board should count 2 distinct monopolies even if owned by same player');

// Real-time build threat scenario: Exact user scenario where (Sentinel) must decline Red Bot's monopoly trade
// Setup board state
// Red group: Kentucky (21), Indiana (23), Illinois (24)
globalThis.square[21] = { index: 21, name: 'Kentucky Avenue', owner: 1, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 220, baserent: 18, houseprice: 150, rent1: 90, rent2: 250, rent3: 700, rent4: 875, rent5: 1050 };
globalThis.square[23] = { index: 23, name: 'Indiana Avenue', owner: 3, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 220, baserent: 18, houseprice: 150, rent1: 90, rent2: 250, rent3: 700, rent4: 875, rent5: 1050 };
globalThis.square[24] = { index: 24, name: 'Illinois Avenue', owner: 1, mortgage: false, house: 0, hotel: 0, group: [21, 23, 24], price: 240, baserent: 20, houseprice: 150, rent1: 100, rent2: 300, rent3: 750, rent4: 925, rent5: 1100 };
globalThis.square[28] = { index: 28, name: 'Water Works', owner: 1, mortgage: false, house: 0, hotel: 0, group: [12, 28], price: 150, baserent: 4, houseprice: 0 };

const redBot = globalThis.player[1];
redBot.money = 547; // Excess cash after buying Kentucky
redBot.position = 21;

const limeBot = globalThis.player[3];
limeBot.money = 900;
limeBot.position = 10;

// Bot proposes trade: offers Water Works (28) + $217 cash to Lime Bot for Indiana Avenue (23)
const promptTradeProps = [];
for (let pIdx = 0; pIdx < 40; pIdx++) promptTradeProps[pIdx] = 0;
promptTradeProps[28] = 1;  // Red gives Water Works
promptTradeProps[23] = -1; // Red requests Indiana Avenue
const promptTrade = new globalThis.Trade(redBot, limeBot, 217, promptTradeProps, 0, 0);

const limeSentinelAI = new Gen5AI(limeBot, { name: 'Sentinel' });
const sentinelDecision = limeSentinelAI.acceptTrade(promptTrade);
assert.strictEqual(sentinelDecision, false, 'Lime Bot (Sentinel) MUST decline giving Red Bot a monopoly');

// Even a non-defensive AI should NOT accept this trade as proposed
const limeGamblerAI = new Gen5AI(limeBot, { name: 'Gambler' });
const gamblerDecision = limeGamblerAI.acceptTrade(promptTrade);
assert.notStrictEqual(gamblerDecision, true, 'Even Gambler AI should not accept giving Red Bot an unmitigated sole monopoly');

// Proactive trade generation must not offer an opponent a dangerous completed monopoly
globalThis.square[31] = { index: 31, name: 'Pacific Avenue', owner: 3, mortgage: false, house: 0, hotel: 0, group: [31, 32, 34], price: 300, baserent: 26, houseprice: 200, rent3: 900 };
globalThis.square[32] = { index: 32, name: 'North Carolina Avenue', owner: 4, mortgage: false, house: 0, hotel: 0, group: [31, 32, 34], price: 300, baserent: 26, houseprice: 200, rent3: 900 };
globalThis.square[34] = { index: 34, name: 'Pennsylvania Avenue', owner: 4, mortgage: false, house: 0, hotel: 0, group: [31, 32, 34], price: 320, baserent: 28, houseprice: 200, rent3: 1000 };
// Opponent 4 already owns 32 and 34. Offering 31 to opponent 4 would grant them the Green monopoly.
// Lime Bot (3) owns 31 and wants to complete the Pink group from opponent 4 (who holds Virginia Ave 14).
limeBot.money = 2000;
globalThis.player[4].money = 2500;
globalThis.square[11] = { index: 11, owner: 3, mortgage: false, house: 0, hotel: 0, group: [11, 13, 14], price: 140, baserent: 10, houseprice: 100, rent3: 450 };
globalThis.square[13] = { index: 13, owner: 3, mortgage: false, house: 0, hotel: 0, group: [11, 13, 14], price: 140, baserent: 10, houseprice: 100, rent3: 450 };
globalThis.square[14] = { index: 14, owner: 4, mortgage: false, house: 0, hotel: 0, group: [11, 13, 14], price: 160, baserent: 12, houseprice: 100, rent3: 500 };
// If AI offers 31 (Green, rent3=900) to get 14 (Pink, rent3=500), it should be refused because Green monopoly is more dangerous!
const foundOpportunity = TradeEvaluation.findOpportunity(limeBot, sentinelProfile);
assert.ok(!foundOpportunity || foundOpportunity.offerIndex !== 31, 'findOpportunity must never propose giving away Pacific Ave to complete opponent 4 green monopoly');

// --- 9. Human-like Negotiation, Bad-Faith Regression & Stagnation Deadlock Breaker ---
// 9a. Overshoot counteroffer on deep deficit when opponent has funds
const tacticianProfile = PROFILE_LIBRARY.filter(function(p) { return p.name === 'Tactician'; })[0];
const tacticianBot = globalThis.player[2];
tacticianBot.money = 1500;
tacticianBot.position = 0;
const tacticianAI = new Gen5AI(tacticianBot, tacticianProfile);

// Human offers $10 for Virginia Avenue (index 14, owned by Tactician Bot 2)
globalThis.square[14].owner = 2;
const humanPlayer = globalThis.player[4];
humanPlayer.money = 1200; // Human has plenty of money

const lowballProps = [];
for (let lp = 0; lp < 40; lp++) lowballProps[lp] = 0;
lowballProps[14] = -1; // Tactician gives up 14
const lowballTrade = new globalThis.Trade(humanPlayer, tacticianBot, 10, lowballProps, 0, 0);

// With the old logic, this -$150 deficit would be instantly declined without countering.
// With the new logic, Tactician counters with an overshoot target demanding favor!
const counterResponse1 = tacticianAI.acceptTrade(lowballTrade);
assert.ok(counterResponse1 instanceof globalThis.Trade, 'Tactician should counteroffer (not flat decline) when opponent has funds to negotiate');
assert.ok(counterResponse1.getMoney() > 100, 'Counteroffer should demand an overshoot favoring the AI');

// 9b. Bad-faith regression detection: opponent worsens offer
const regressedTrade = new globalThis.Trade(humanPlayer, tacticianBot, 5, lowballProps, 0, 0); // worsened from $10 to $5
const regressionDecision = tacticianAI.acceptTrade(regressedTrade);
assert.strictEqual(regressionDecision, false, 'Tactician should outright decline a bad-faith regressed offer');

// 9c. Final squeeze on acceptable offers
// Create an offer that meets the minimum threshold
const generousTrade = new globalThis.Trade(humanPlayer, tacticianBot, 350, lowballProps, 0, 0);
const squeezeDecision = tacticianAI.acceptTrade(generousTrade);
// Should try one last squeeze counter for a slight sweetening bonus
assert.ok(squeezeDecision instanceof globalThis.Trade, 'AI should attempt one final squeeze counter on an acceptable offer when opponent has surplus cash');
assert.ok(squeezeDecision.getMoney() > 350, 'Squeeze counter should ask slightly more than the offered amount');

// 9d. Stagnation factor and deadlock breaker
// Simulate deadlocked board: all buildable monopolies count = 0, turn count high, few unowned properties
// Reset owners across groups so that no color monopoly is complete
for (let sIdx = 0; sIdx < 40; sIdx++) {
    if (globalThis.square[sIdx] && globalThis.square[sIdx].price > 0) {
        // Distribute owners 1, 2, 3 so no group is held by a single player
        globalThis.square[sIdx].owner = (sIdx % 3) + 1;
    }
}

const stagnantFactor = Analytics.getStagnationFactor(tacticianBot, 20); // Turn 20, zero monopolies, 0 unowned
assert.ok(stagnantFactor > 0.6, 'Stagnation factor should be > 0.6 when many laps pass with no monopolies and all properties claimed');

// Under high stagnation (> 0.6), mutual monopoly swaps with modest rent variance are accepted
const highStagnationOpportunity = TradeEvaluation.findOpportunity(limeBot, tacticianProfile, 20);
// Verifies findOpportunity executes cleanly under stagnation context
assert.ok(highStagnationOpportunity !== undefined, 'findOpportunity should handle high stagnation context gracefully');

// --- 10. Realism Upgrades: Stress Liquidity, Tendency, Future Buildability, Blocking & Deadlock ---
// 10a. True Reserve, Emergency Liquidity & Jail Mitigation
globalThis.square[10] = { index: 10, owner: 6, mortgage: false, house: 5, hotel: 1, baserent: 20, houseprice: 200, rent5: 1050 };
const testPlayer = { index: 5, money: 800, position: 0, jail: false, jailroll: 0 };
globalThis.square[4] = { index: 4, name: 'City Tax', price: 0, group: null, baserent: 0, houseprice: 0 };
const normalReserve = Liquidity.computeReserve(testPlayer, balancedProfile);
testPlayer.jail = true;
testPlayer.jailroll = 0;
const jailedReserve = Liquidity.computeReserve(testPlayer, balancedProfile);
testPlayer.jail = false;
assert.ok(jailedReserve < normalReserve, 'in-jail player should have mitigated near-term landing exposure');

globalThis.square[5] = { index: 5, owner: 5, mortgage: false, price: 200, houseprice: 0, house: 0, hotel: 0 };
globalThis.square[6] = { index: 6, owner: 5, mortgage: false, price: 100, houseprice: 50, house: 2, hotel: 0 };
const liq = Liquidity.emergencyLiquidity(testPlayer);
assert.strictEqual(liq.propertyEquity, 200, 'emergency equity should equal unmortgaged property 50% value + 50% house value');
assert.strictEqual(liq.total, 1000, 'total liquidity should equal cash plus property equity');
assert.ok(Liquidity.surplusCash(testPlayer, balancedProfile) > 0, 'surplusCash should measure cash above reserve');

// 10b. Opponent Reputation Ledger, Hostility & Tendency Classification
const repLedger = TradeMemory.create();
const opp5 = { index: 5, money: 50, name: 'Broke Bot' };
const oppTendencyDesperate = repLedger.getOpponentTendency(5, opp5);
assert.strictEqual(oppTendencyDesperate, 'Desperate', 'low-cash opponent near bankruptcy should be classified as Desperate');

repLedger.recordBadFaith(7);
repLedger.recordBadFaith(7);
const oppTendencyRevengeful = repLedger.getOpponentTendency(7, globalThis.player[7]);
assert.strictEqual(oppTendencyRevengeful, 'Revengeful', 'opponent with repeated bad faith regressions should be classified as Revengeful');
assert.ok(repLedger.getFrictionPenalty(7) > 10, 'hostile opponent should incur positive social friction penalty');

// 10c. 2-4 Turn Future Buildability & Monopoly Threat Acceleration
globalThis.square[21].owner = 6;
globalThis.square[23].owner = 6;
globalThis.square[24].owner = 6;
globalThis.player[6].money = 2500;
const futureBuildLeader = Analytics.projectedFutureBuildability(globalThis.player[6], 21, 2500, 3);
assert.strictEqual(futureBuildLeader.reachesThreeHouses, true, 'wealthy opponent with color monopoly should reach 3-house inflection within 3 turns');

const futureRisk = Analytics.monopolyRisk(21, 6, 2500);
assert.ok(futureRisk > 2.0, 'monopolyRisk should be significantly elevated when opponent can build to 3 houses');

// 10d. Strategic Lane Blocking & Tempo Scoring
globalThis.square[15] = { index: 15, owner: 2, group: [5, 15, 25, 35] };
globalThis.square[25] = { index: 25, owner: 2, group: [5, 15, 25, 35] };
globalThis.square[35] = { index: 35, owner: 1, group: [5, 15, 25, 35] };
const rrBlocking = Valuation.strategicBlockingValue(35, 1, 2);
assert.ok(rrBlocking >= 50, 'holding 3rd railroad should carry substantial strategic blocking value');

globalThis.square[21].house = 3;
globalThis.square[23].house = 3;
globalThis.square[24].house = 3;
const tempo3Houses = Valuation.tempoScore(globalThis.player[6]);
assert.ok(tempo3Houses >= 80, 'monopoly with 3 houses should yield high tempo score');

// 10e. Deadlock Polarity (Asymmetric Lead vs Symmetrical Deadlock)
for (let sIdx = 0; sIdx < 40; sIdx++) {
    if (globalThis.square[sIdx] && globalThis.square[sIdx].price > 0) {
        globalThis.square[sIdx].owner = (sIdx % 3) + 1;
        globalThis.square[sIdx].house = 0;
        globalThis.square[sIdx].hotel = 0;
    }
}
const richPlayer = { index: 1, money: 3500, AI: { turnNumber: 20 } };
const poorPlayer = { index: 2, money: 500, AI: { turnNumber: 20 } };
const leaderDeadlock = Analytics.getDeadlockState(richPlayer, poorPlayer, 20);
assert.strictEqual(leaderDeadlock.mode, 'AsymmetricLead', 'wealthier player should be in AsymmetricLead deadlock state');
assert.strictEqual(leaderDeadlock.isLeader, true, 'isLeader should be true in AsymmetricLead');

const equalPlayer1 = { index: 1, money: 1000, AI: { turnNumber: 20 } };
const equalPlayer2 = { index: 2, money: 1000, AI: { turnNumber: 20 } };
const symDeadlock = Analytics.getDeadlockState(equalPlayer1, equalPlayer2, 20);
assert.strictEqual(symDeadlock.mode, 'SymmetricalDeadlock', 'equally positioned players should be in SymmetricalDeadlock');

// --- Smoke test: Gen5AI wires up all 7 required hooks ---------------------------------------
const gen5Instance = new Gen5AI(globalThis.player[1], { name: 'Tactician' });
['buyProperty', 'beforeTurn', 'onLand', 'acceptTrade', 'postBail', 'payDebt', 'bid'].forEach(function(hook) {
    assert.strictEqual(typeof gen5Instance[hook], 'function', 'Gen5AI should expose ' + hook);
});
assert.strictEqual(gen5Instance.personality, 'Tactician', 'profile selection should be honored');

console.log('gen5 AI tests passed');
