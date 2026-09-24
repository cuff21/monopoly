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

// --- Smoke test: Gen5AI wires up all 7 required hooks ---------------------------------------
const gen5Instance = new Gen5AI(globalThis.player[1], { name: 'Tactician' });
['buyProperty', 'beforeTurn', 'onLand', 'acceptTrade', 'postBail', 'payDebt', 'bid'].forEach(function(hook) {
    assert.strictEqual(typeof gen5Instance[hook], 'function', 'Gen5AI should expose ' + hook);
});
assert.strictEqual(gen5Instance.personality, 'Tactician', 'profile selection should be honored');

console.log('gen5 AI tests passed');
