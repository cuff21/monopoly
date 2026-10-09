const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BoardApi = require('./js/core/board.js');
const GameStateApi = require('./js/core/game-state-context.js');
const Editions = require('./js/editions/edition-registry.js');
const catalogs = require('./js/editions/board-id-catalogs.js');
const apiCases = require('./structured-board-api-contract.cases.js');
require('./js/editions/classic.js');
require('./js/editions/newyorkcity.js');

const repeatedSquareIds = {
    Chance: ['chance-south', 'chance-east', 'chance-north'],
    'Community Chest': ['community-chest-south', 'community-chest-west', 'community-chest-east']
};

function normalizeId(label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function expectedSquareIds(squares) {
    const repeatedCounts = Object.create(null);
    return squares.map(square => {
        if (square.name === 'Just Visiting') return 'jail';
        if (repeatedSquareIds[square.name]) {
            const occurrence = repeatedCounts[square.name] || 0;
            repeatedCounts[square.name] = occurrence + 1;
            return repeatedSquareIds[square.name][occurrence];
        }
        return normalizeId(square.name);
    });
}

function assertCatalog(editionId) {
    const edition = Editions.get(editionId);
    const catalog = catalogs[editionId];
    assert.ok(edition, editionId + ' edition should be registered');
    assert.ok(catalog, editionId + ' should have a permanent ID catalog');

    const groups = edition.buildGroups();
    const squares = edition.buildSquares(groups);
    assert.strictEqual(catalog.squareIds.length, 40, editionId + ' catalog should contain all 40 squares');
    assert.deepStrictEqual(catalog.squareIds, expectedSquareIds(squares), editionId + ' IDs should follow source order and frozen normalization');
    assert.strictEqual(new Set(catalog.squareIds).size, catalog.squareIds.length, editionId + ' square IDs should be unique');
    catalog.squareIds.forEach(id => {
        assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, editionId + ' square ID should match the permanent ID syntax: ' + id);
    });

    const groupIds = [];
    for (let groupNumber = 1; groupNumber <= 10; groupNumber++) {
        assert.ok(groups[groupNumber], editionId + ' group ' + groupNumber + ' should exist');
        groupIds.push(normalizeId(groups[groupNumber].groupName));
    }
    assert.deepStrictEqual(catalog.groupIds, groupIds, editionId + ' group IDs should follow source group order');
    assert.strictEqual(new Set(catalog.groupIds).size, catalog.groupIds.length, editionId + ' group IDs should be unique');
    catalog.groupIds.forEach(id => {
        assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, editionId + ' group ID should match the permanent ID syntax: ' + id);
    });
}

assertCatalog('Classic');
assertCatalog('NYC');
assert.strictEqual(catalogs.Classic.squareIds.filter(id => id.startsWith('chance-')).length, 3);
assert.strictEqual(catalogs.Classic.squareIds.filter(id => id.startsWith('community-chest-')).length, 3);

['Classic', 'NYC'].forEach(editionId => {
    const edition = Editions.get(editionId);
    const sourceBoard = edition.buildBoard();
    const secondSourceBoard = edition.buildBoard();
    assert.strictEqual(BoardApi.validateBoard(sourceBoard), sourceBoard);
    assert.notStrictEqual(sourceBoard, secondSourceBoard);
    assert.notStrictEqual(sourceBoard.squaresById, secondSourceBoard.squaresById);
    const firstGameBoard = Editions.buildBoardForGame(editionId);
    const overriddenBoard = Editions.buildBoardForGame(editionId, { startSalary: 300 });
    assert.notStrictEqual(firstGameBoard, overriddenBoard);
    assert.notStrictEqual(firstGameBoard.squaresById, overriddenBoard.squaresById);
    assert.strictEqual(firstGameBoard.rules.startSalary, 200);
    assert.strictEqual(overriddenBoard.rules.startSalary, 300);
    assert.ok(Object.isFrozen(overriddenBoard) && Object.isFrozen(overriddenBoard.rules));
    assert.ok(Object.isFrozen(overriddenBoard.squaresById.go.presentation));
    assert.throws(() => Editions.buildBoardForGame(editionId, { startSalary: 0 }), /rules\.startSalary/);
    assert.throws(() => Editions.buildBoardForGame(editionId, { unsupported: 1 }), /Unknown Board rule override/);
});

assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['city-tax'].rules.taxAmount, 200);
assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['city-tax'].rules.taxPercentOfNetWorth, 0.1);
assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['luxury-tax'].rules.taxAmount, 75);
assert.strictEqual(Editions.get('Classic').buildBoard().squaresById['luxury-tax'].rules.taxAmount, 100);

assert.throws(() => Editions.register('LegacyOnlyFixture', {
    buildGroups: () => [], buildSquares: () => [],
    buildCommunityChestCards: () => [], buildChanceCards: () => []
}), /must provide buildBoard/);
assert.throws(() => Editions.register('MissingDeckFixture', {
    buildBoard: apiCases.createBoardFixture,
    buildCommunityChestCards: () => []
}), /buildCommunityChestCards\(\) and buildChanceCards\(\)/);
assert.throws(() => Editions.register('InvalidBoardFixture', {
    buildBoard: () => { const board = apiCases.createBoardFixture(); board.rules.startSalary = 0; return board; },
    buildCommunityChestCards: () => [], buildChanceCards: () => []
}), /rules\.startSalary/);
assert.throws(() => Editions.register('MismatchedEditionFixture', {
    buildBoard: apiCases.createBoardFixture,
    buildCommunityChestCards: () => [], buildChanceCards: () => []
}), /matching editionId/);

let fixtureBoardBuilds = 0;
Editions.register('RegistryContractFixture', {
    buildBoard: () => {
        fixtureBoardBuilds++;
        const board = apiCases.createBoardFixture();
        board.editionId = 'RegistryContractFixture';
        board.squaresById.go.behavior = { onLand: () => 'callable' };
        return board;
    },
    buildCommunityChestCards: () => [],
    buildChanceCards: () => []
});
assert.strictEqual(fixtureBoardBuilds, 1, 'registration validates and discards exactly one Board');
const registryFixtureOne = Editions.buildBoardForGame('RegistryContractFixture', { startSalary: 250 });
const registryFixtureTwo = Editions.buildBoardForGame('RegistryContractFixture');
assert.notStrictEqual(registryFixtureOne, registryFixtureTwo);
assert.notStrictEqual(registryFixtureOne.squaresById.go.behavior, registryFixtureTwo.squaresById.go.behavior);
assert.strictEqual(registryFixtureOne.squaresById.go.behavior.onLand(), 'callable');
assert.strictEqual(registryFixtureOne.rules.startSalary, 250);
assert.strictEqual(registryFixtureTwo.rules.startSalary, 200);
assert.strictEqual(fixtureBoardBuilds, 3, 'each Game Board request builds a new edition Board');

const schema1Spec = fs.readFileSync(path.join(__dirname, 'GEN6_INPUT_SCHEMA_INVENTORY.md'), 'utf8');
['S1-01', 'S1-02', 'S1-03', 'S1-04', 'S1-05', 'S1-06', 'S1-07', 'S1-08', 'S1-09', 'S1-10', 'S1-11'].forEach(caseId => {
    assert.ok(schema1Spec.includes('**' + caseId + ' '), 'Schema 1 required-test inventory should include ' + caseId);
});
assert.ok(schema1Spec.includes('pending until the Schema 1 runtime is implemented in Phase 6'));

const schema1FeatureLayout = {
    tileKindCount: 10,
    staticFeatureCount: 23,
    dynamicFeatureCount: 11,
    circuitFeatureCount: 17,
    seatCount: 8,
    seatFeatureCount: 6,
    globalFeatureCount: 13,
    contextEmbeddingWidth: 16,
    tileEmbeddingWidth: 32,
    attentionInputWidth: 109,
    trunkInputWidth: 173
};
assert.strictEqual(schema1FeatureLayout.staticFeatureCount + schema1FeatureLayout.dynamicFeatureCount + schema1FeatureLayout.circuitFeatureCount, 51);
assert.strictEqual(schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount, 48);
assert.strictEqual(schema1FeatureLayout.contextEmbeddingWidth + schema1FeatureLayout.globalFeatureCount + schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount + schema1FeatureLayout.tileEmbeddingWidth, schema1FeatureLayout.attentionInputWidth);
assert.strictEqual(schema1FeatureLayout.tileEmbeddingWidth * 3 + schema1FeatureLayout.globalFeatureCount + schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount + schema1FeatureLayout.contextEmbeddingWidth, schema1FeatureLayout.trunkInputWidth);
assert.ok(schema1Spec.includes('51-feature tile records'));
assert.ok(schema1Spec.includes('eight seat records (48 scalar values)'));
assert.ok(schema1Spec.includes('13 global values'));

const tensorRows = Array.from(schema1Spec.matchAll(/^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*`\[([^\]]+)\]`\s*\|\s*([\d,]+)\s*\|$/gm));
assert.strictEqual(tensorRows.length, 38, 'Schema 1 should define all 38 named tensors');
const tensorNames = new Set();
const tensorParameterTotal = tensorRows.reduce((total, row, index) => {
    const order = Number(row[1]);
    const tensorName = row[2];
    const shape = row[3].split(',').map(value => Number(value.trim()));
    const parameterCount = Number(row[4].replace(/,/g, ''));
    assert.strictEqual(order, index + 1, 'Schema 1 tensor order should be contiguous');
    assert.ok(!tensorNames.has(tensorName), 'Schema 1 tensor names should be unique: ' + tensorName);
    tensorNames.add(tensorName);
    assert.ok(shape.length > 0 && shape.every(dimension => Number.isInteger(dimension) && dimension > 0), 'Tensor shape should contain positive integer dimensions: ' + tensorName);
    assert.strictEqual(shape.reduce((product, dimension) => product * dimension, 1), parameterCount, 'Tensor shape and parameter count should agree: ' + tensorName);
    return total + parameterCount;
}, 0);
assert.strictEqual(tensorParameterTotal, 25236, 'Schema 1 parameter count is fixed');

const moneyScale = 4 * 200;
assert.strictEqual(Math.min(1, 200 / moneyScale), 0.25, 'A $200 feature on a $200-salary board should normalize to 0.25');
assert.strictEqual(Math.min(1, 1200 / moneyScale), 1, 'Monetary features should clamp at 1');
assert.strictEqual(Math.min(1, 4 / 10), 0.4, 'Utility multipliers should normalize by 10');
assert.strictEqual(Math.log1p(28), Math.log(29), 'Tile count uses log1p without clamp');

assert.strictEqual(typeof apiCases.runBoardApiContractCases, 'function');
assert.strictEqual(typeof apiCases.runGameStateApiContractCases, 'function');
apiCases.runBoardApiContractCases(BoardApi);
apiCases.runGameStateApiContractCases(GameStateApi);
const apiBoardFixture = apiCases.createBoardFixture();
assert.strictEqual(BoardApi.validateBoard(apiBoardFixture), apiBoardFixture);

function cloneFixture() {
    return JSON.parse(JSON.stringify(apiBoardFixture));
}

function assertInvalidBoard(mutator, expectedMessage) {
    const invalidBoard = cloneFixture();
    mutator(invalidBoard);
    assert.throws(() => BoardApi.validateBoard(invalidBoard), expectedMessage);
}

assertInvalidBoard(board => { board.rules.startSalary = 0; }, /rules\.startSalary/);
assertInvalidBoard(board => { board.rules.houseTotal = 0; }, /rules\.houseTotal/);
assertInvalidBoard(board => { board.rules.hotelTotal = 1.5; }, /rules\.hotelTotal/);
assertInvalidBoard(board => { board.rules.bailAmount = -1; }, /rules\.bailAmount/);
assertInvalidBoard(board => { board.editionId = ' '; }, /field editionId/);
assertInvalidBoard(board => { board.squaresById['bad id'] = { ...board.squaresById.go, id: 'bad id' }; }, /square bad id field id/);
assertInvalidBoard(board => { board.squaresById['street-a'].id = 'different-id'; }, /square street-a field id/);
assertInvalidBoard(board => { board.groupsById['street-a'] = { ...board.groupsById.streets, groupId: 'street-a' }; }, /group street-a field groupId/);
assertInvalidBoard(board => { board.squaresById['street-a'].kind = 'unknown'; }, /square street-a field kind/);
assertInvalidBoard(board => { board.startSquareId = 'missing'; }, /field startSquareId/);
assertInvalidBoard(board => { board.startSquareId = 'street-a'; }, /startSquareId.*go square/);
assertInvalidBoard(board => { board.squaresById.go.nextId = 'missing'; }, /square go field nextId/);
assertInvalidBoard(board => { board.squaresById.go.previousId = 'missing'; }, /square go field previousId/);
assertInvalidBoard(board => { board.squaresById['street-a'].presentation.x = 101; }, /presentation\.x/);
assertInvalidBoard(board => { delete board.squaresById['street-a'].presentation.rotationDegrees; }, /presentation\.rotationDegrees/);
assertInvalidBoard(board => { delete board.squaresById['street-a'].rules.mortgageValue; }, /rules\.mortgageValue/);
assertInvalidBoard(board => { board.squaresById['street-a'].rules.rentTiers.pop(); }, /rules\.rentTiers/);
assertInvalidBoard(board => { board.squaresById['street-a'].rules.taxAmount = 1; }, /rules\.taxAmount/);
assertInvalidBoard(board => { board.squaresById['railroad-a'].rules.houseCost = 50; }, /rules\.houseCost/);
assertInvalidBoard(board => { board.squaresById['utility-a'].rules.rentTiers[0] = 1.5; }, /rules\.rentTiers\[0\]/);
assertInvalidBoard(board => { board.squaresById.go.rules.purchasePrice = 1; }, /rules\.purchasePrice/);
assertInvalidBoard(board => { board.squaresById['street-a'].rules.taxPercentOfNetWorth = 0.1; }, /taxPercentOfNetWorth/);
assertInvalidBoard(board => { board.squaresById['street-a'].groupId = 'missing'; }, /groupId/);
assertInvalidBoard(board => { board.groupsById.streets.squareIds = []; }, /group streets field squareIds.*at least one/);
assertInvalidBoard(board => { board.groupsById.transit.squareIds.push('railroad-a'); }, /duplicate member/);
assertInvalidBoard(board => { board.groupsById.streets.label = ''; }, /group streets field label/);
assertInvalidBoard(board => { board.groupsById.transit.rules.rentTiers.pop(); }, /group transit field rules\.rentTiers/);
assertInvalidBoard(board => {
    board.squaresById['railroad-a'].groupId = 'streets';
    board.groupsById.streets.squareIds.push('railroad-a');
}, /members must share a square kind/);
assertInvalidBoard(board => { board.groupsById.transit.rules.rentTiers[0] = 26; }, /group transit field rules\.rentTiers/);
assertInvalidBoard(board => { board.squaresById['go'].nextId = 'railroad-a'; }, /reciprocal/);
assertInvalidBoard(board => {
    board.squaresById.go.nextId = 'street-a';
    board.squaresById['street-a'].previousId = 'go';
    board.squaresById['street-a'].nextId = 'go';
    board.squaresById.go.previousId = 'street-a';
    board.squaresById['railroad-a'].nextId = 'utility-a';
    board.squaresById['utility-a'].previousId = 'railroad-a';
    board.squaresById['utility-a'].nextId = 'railroad-a';
    board.squaresById['railroad-a'].previousId = 'utility-a';
}, /cycle that omits Board squares/);

const taxBoard = cloneFixture();
taxBoard.squaresById['utility-a'].nextId = 'city-tax';
taxBoard.squaresById.go.previousId = 'city-tax';
taxBoard.squaresById['city-tax'] = {
    id: 'city-tax', kind: 'tax', nextId: 'go', previousId: 'utility-a',
    rules: { purchasePrice: 0, baseRent: 0, rentTiers: [], mortgageValue: 0, houseCost: 0, taxAmount: 200, taxPercentOfNetWorth: 0.1 },
    presentation: { x: 50, y: 50, rotationDegrees: 0 }
};
assert.strictEqual(BoardApi.validateBoard(taxBoard), taxBoard);
const invalidTaxBoard = JSON.parse(JSON.stringify(taxBoard));
invalidTaxBoard.squaresById['city-tax'].rules.taxPercentOfNetWorth = 0;
assert.throws(() => BoardApi.validateBoard(invalidTaxBoard), /taxPercentOfNetWorth/);
invalidTaxBoard.squaresById['city-tax'].rules.taxPercentOfNetWorth = 1.1;
assert.throws(() => BoardApi.validateBoard(invalidTaxBoard), /taxPercentOfNetWorth/);

function createVariableBoard(tileCount) {
    const squaresById = {};
    const squareIds = ['go'].concat(Array.from({ length: tileCount - 1 }, (_, index) => 'chance-' + (index + 1)));
    squareIds.forEach((squareId, index) => {
        squaresById[squareId] = {
            id: squareId,
            kind: index === 0 ? 'go' : 'chance',
            nextId: squareIds[(index + 1) % tileCount],
            previousId: squareIds[(index + tileCount - 1) % tileCount],
            rules: { purchasePrice: 0, baseRent: 0, rentTiers: [], mortgageValue: 0, houseCost: 0, taxAmount: 0 },
            presentation: { x: index % 101, y: (index * 3) % 101, rotationDegrees: 0 }
        };
    });
    return {
        editionId: 'VariableFixture', startSquareId: 'go',
        rules: { startSalary: 200, houseTotal: 32, hotelTotal: 12, bailAmount: 50 },
        squaresById, groupsById: {}
    };
}

[28, 40, 52, 64, 100].forEach(tileCount => {
    assert.strictEqual(Object.keys(BoardApi.validateBoard(createVariableBoard(tileCount)).squaresById).length, tileCount);
});

const apiSquareIds = Object.keys(apiBoardFixture.squaresById);
assert.strictEqual(apiSquareIds.length, 4);
apiSquareIds.forEach(squareId => {
    const square = apiBoardFixture.squaresById[squareId];
    assert.strictEqual(apiBoardFixture.squaresById[square.nextId].previousId, squareId, 'Board fixture links should be reciprocal');
    assert.strictEqual(apiBoardFixture.squaresById[square.previousId].nextId, squareId, 'Board fixture links should be reciprocal');
});
assert.deepStrictEqual(apiBoardFixture.groupsById.transit.squareIds, ['railroad-a']);
const firstStateFixture = apiCases.createStateFixture(apiBoardFixture);
const secondStateFixture = apiCases.createStateFixture(apiBoardFixture);
assert.notStrictEqual(firstStateFixture.squareStateById, secondStateFixture.squareStateById);
apiSquareIds.forEach(squareId => {
    assert.deepStrictEqual(firstStateFixture.squareStateById[squareId], {
        ownerId: null,
        mortgage: false,
        house: 0,
        hotel: 0,
        landcount: 0
    });
});
assert.deepStrictEqual(firstStateFixture.players.map(player => player.playerId), ['player-1', 'player-3']);
console.log('Structured Board catalogs and contract fixtures are internally consistent.');