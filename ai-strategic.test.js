const assert = require('assert');

if (!globalThis.square) {
  globalThis.square = [
    { index: 0, name: 'Alpha', price: 180, groupNumber: 3, group: [0, 1, 2], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 10, houseprice: 50 },
    { index: 1, name: 'Beta', price: 200, groupNumber: 3, group: [0, 1, 2], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 12, houseprice: 50 },
    { index: 2, name: 'Gamma', price: 220, groupNumber: 3, group: [0, 1, 2], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 15, houseprice: 50 },
    { index: 3, name: 'Cheap', price: 60, groupNumber: 3, group: [3, 4, 5], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 4, houseprice: 50 },
    { index: 4, name: 'Cheap 2', price: 60, groupNumber: 3, group: [3, 4, 5], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 4, houseprice: 50 },
    { index: 5, name: 'Cheap 3', price: 60, groupNumber: 3, group: [3, 4, 5], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 4, houseprice: 50 },
    { index: 10, name: 'Low Value', price: 420, groupNumber: 3, group: [10, 11, 12], owner: 0, mortgage: false, house: 0, hotel: 0, baserent: 20, houseprice: 50 }
  ];
}

const { StrategicAI, PROFILE_LIBRARY } = require('./js/ai/ai-strategic.js');

const player = { index: 1, money: 2000, name: 'Tester', human: false };
const ai = new StrategicAI(player);

assert.strictEqual(typeof ai.buyProperty, 'function');
assert.strictEqual(ai.profile.name.length > 0, true, 'profile should be assigned');
assert.strictEqual(ai.buyProperty(0), true, 'should buy strong early property when liquidity is healthy');
assert.strictEqual(ai.buyProperty(3), true, 'should buy cheap property that completes a color set');
assert.strictEqual(ai.buyProperty(10), false, 'should skip overpriced or low-value property when cash is tight');

square[0].owner = 2;
square[1].owner = 2;
square[2].owner = 0;
const blocker = new StrategicAI({ index: 6, money: 2000, name: 'Blocker', human: false }, { name: 'Balanced' });
assert.strictEqual(blocker.buyProperty(2), true, 'should prioritize blocking an opponent near a monopoly');
square[0].owner = 0;
square[1].owner = 0;

const trade = {
  getMoney: () => 0,
  getInitiator: () => ({ money: 500, index: 2, name: 'Opponent' }),
  getRecipient: () => player,
  getCommunityChestJailCard: () => 0,
  getChanceJailCard: () => 0,
  getProperty: (idx) => (idx === 0 ? 1 : idx === 3 ? 0 : 0)
};

assert.strictEqual(ai.acceptTrade(trade) !== false, true, 'trade evaluator should offer a sensible decision');
ai.recordTrade({ index: 2 }, 'accepted', 150);
assert.strictEqual(ai.tradeMemory[2].accepted >= 1, true, 'trade memory should track outcomes');

const aggressive = new StrategicAI({ index: 4, money: 3000, name: 'Aggro', human: false }, { name: 'Aggressive' });
assert.strictEqual(aggressive.profile.name, 'Aggressive', 'personality assignment should work');
assert.strictEqual(typeof aggressive.planPortfolio, 'function', 'portfolio planner should exist');
assert.strictEqual(typeof aggressive.bid, 'function', 'auction logic should exist');
const strategicBidder = new StrategicAI({ index: 5, money: 1000, name: 'Bidder', human: false }, { name: 'Balanced' });
square[0].owner = 5;
assert.ok(strategicBidder.bid(1, 0) > 0, 'should open an auction for a property completing a group');
assert.strictEqual(strategicBidder.bid(3, 0), 0, 'should pass on a weak property instead of bidding automatically');
assert.strictEqual(strategicBidder.bid(3, 100), -1, 'should exit when a low-value property is overpriced');
assert.strictEqual(strategicBidder.bid(1, 900), -1, 'should exit when the current bid exceeds its valuation');
strategicBidder.bidderCashBeforeTest = strategicBidder.bid(1, 0);
assert.ok(strategicBidder.bidderCashBeforeTest <= 880, 'should preserve its liquidity reserve when bidding');

let proposedSetTrade;
globalThis.Trade = function(initiator, recipient, money, property) {
  this.getInitiator = () => initiator;
  this.getRecipient = () => recipient;
  this.getMoney = () => money;
  this.getProperty = (index) => property[index] || 0;
  this.getCommunityChestJailCard = () => 0;
  this.getChanceJailCard = () => 0;
};
globalThis.player = [];
globalThis.player[2] = { index: 2, money: 1000, name: 'Opponent' };
globalThis.game = { trade: (tradeOffer) => { proposedSetTrade = tradeOffer; } };
square[1].owner = 2;
square[2].owner = 5;
square[3].owner = 5;
const setTrader = new StrategicAI({ index: 5, money: 1000, name: 'Set Builder', human: false }, { name: 'Balanced' });
assert.strictEqual(setTrader.onLand(), true, 'should proactively offer a trade for a missing group property');
assert.strictEqual(proposedSetTrade.getProperty(1), -1, 'should request the missing group property');
assert.strictEqual(proposedSetTrade.getProperty(3), 1, 'should offer a property the opponent can value');
assert.ok(proposedSetTrade.getMoney() >= 0, 'should include a fair cash adjustment when needed');
const recipientAI = new StrategicAI(globalThis.player[2], { name: 'Balanced' });
assert.notStrictEqual(recipientAI.acceptTrade(proposedSetTrade), false, 'generated set-completion offer should be negotiable for the recipient');
const jailed = new StrategicAI({ index: 7, money: 100, name: 'Jailed', human: false, jail: true, jailroll: 2 }, { name: 'Defensive' });
assert.strictEqual(jailed.postBail(), true, 'should leave jail on the forced third turn');
let selectedHouseIndex = -1;
globalThis.buyHouse = (index) => { selectedHouseIndex = index; };
square[0].owner = 8;
square[1].owner = 8;
square[2].owner = 8;
square[0].house = 1;
square[1].house = 0;
square[2].house = 1;
const evenBuilder = new StrategicAI({ index: 8, money: 2000, name: 'Even Builder', human: false }, { name: 'Balanced' });
evenBuilder.beforeTurn();
assert.strictEqual(selectedHouseIndex, 1, 'should build on the lowest-house property first');
square[0].owner = 0;
square[1].owner = 0;
square[2].owner = 0;
assert.ok(PROFILE_LIBRARY.length >= 4, 'there should be multiple personality profiles');
assert.strictEqual(typeof StrategicAI.getRandomProfile, 'function', 'random profile selector should exist');
const randomProfile = StrategicAI.getRandomProfile();
assert.ok(PROFILE_LIBRARY.some(function(item) { return item.name === randomProfile.name; }), 'random profile should be drawn from the profile library');

console.log('strategic AI tests passed');
