async function runContractTests() {
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BoardApi = require('./js/core/board.js');
const GameStateApi = require('./js/core/game-state-context.js');
const { Game } = require('./js/game/game-core.js');
const Editions = require('./js/editions/edition-registry.js');
const catalogs = require('./js/editions/board-id-catalogs.js');
const scriptManifest = require('./js/script-manifest.js');
const Gen6Compatibility = require('./js/ai/ai-gen6/schema1-compatibility.js');
const editionGoldens = require('./structured-board-edition-fixtures.json');
const apiCases = require('./structured-board-api-contract.cases.js');
require('./js/editions/classic.js');
require('./js/editions/newyorkcity.js');

const scriptPaths = scriptManifest.scripts.map(script => script.src);
assert.ok(!scriptPaths.includes('editions/native-board-builder.js'));
assert.ok(!scriptPaths.includes('editions/legacy-board-adapter.js'));

function assertCatalog(editionId) {
    const edition = Editions.get(editionId);
    const catalog = catalogs[editionId];
    assert.ok(edition, editionId + ' edition should be registered');
    assert.ok(catalog, editionId + ' should have a permanent ID catalog');
    assert.strictEqual(edition.buildGroups, undefined, editionId + ' must not expose positional group builders');
    assert.strictEqual(edition.buildSquares, undefined, editionId + ' must not expose positional square builders');

    const board = edition.buildBoard();
    assert.strictEqual(BoardApi.validateBoard(board), board);
    const squareIds = [];
    let squareId = board.startSquareId;
    for (let index = 0; index < Object.keys(board.squaresById).length; index++) {
        assert.ok(!squareIds.includes(squareId), editionId + ' traversal must not repeat before visiting every square');
        squareIds.push(squareId);
        squareId = board.squaresById[squareId].nextId;
    }
    assert.strictEqual(squareId, board.startSquareId, editionId + ' traversal should return to the start');
    assert.strictEqual(catalog.squareIds.length, 40, editionId + ' catalog should contain all 40 squares');
    assert.deepStrictEqual(squareIds, catalog.squareIds, editionId + ' Board traversal should match the permanent square ID catalog');
    assert.strictEqual(new Set(catalog.squareIds).size, catalog.squareIds.length, editionId + ' square IDs should be unique');
    catalog.squareIds.forEach((id, index) => {
        assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, editionId + ' square ID should match the permanent ID syntax: ' + id);
        const expected = index === 0 ? { x: 94, y: 94, rotationDegrees: 0 }
            : index < 10 ? { x: 94 - index * 8.5, y: 94, rotationDegrees: 0 }
                : index === 10 ? { x: 6, y: 94, rotationDegrees: 0 }
                    : index < 20 ? { x: 6, y: 94 - (index - 10) * 8.5, rotationDegrees: 90 }
                        : index === 20 ? { x: 6, y: 6, rotationDegrees: 0 }
                            : index < 30 ? { x: 6 + (index - 20) * 8.5, y: 6, rotationDegrees: 180 }
                                : index === 30 ? { x: 94, y: 6, rotationDegrees: 0 }
                                    : { x: 94, y: 6 + (index - 30) * 8.5, rotationDegrees: 270 };
        ['x', 'y', 'rotationDegrees'].forEach(field => {
            assert.strictEqual(board.squaresById[id].presentation[field], expected[field], editionId + ' ' + id + ' coordinate ' + field);
        });
    });

    const groupIds = Object.keys(board.groupsById);
    assert.deepStrictEqual(groupIds, catalog.groupIds, editionId + ' Board groups should match the permanent group ID catalog');
    assert.strictEqual(new Set(catalog.groupIds).size, catalog.groupIds.length, editionId + ' group IDs should be unique');
    catalog.groupIds.forEach(id => {
        assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, editionId + ' group ID should match the permanent group ID syntax: ' + id);
    });
}

assertCatalog('Classic');
assertCatalog('NYC');
assert.deepStrictEqual(catalogs.Classic.squareIds.filter(id => id.startsWith('chance-')), ['chance-south', 'chance-east', 'chance-north']);
assert.deepStrictEqual(catalogs.Classic.squareIds.filter(id => id.startsWith('community-chest-')), ['community-chest-south', 'community-chest-west', 'community-chest-east']);

// Golden snapshots protect the built-in edition economics, presentation and ordered decks.
['Classic', 'NYC'].forEach(editionId => {
    const edition = Editions.get(editionId);
    const board = edition.buildBoard();
    const expected = editionGoldens[editionId];
    const actualSquares = Object.values(board.squaresById).map(square => ({
        id: square.id,
        kind: square.kind,
        groupId: square.groupId || null,
        rules: square.rules,
        presentation: Object.fromEntries(Object.entries(square.presentation).filter(([, value]) => typeof value !== 'function'))
    }));
    const actualGroups = Object.values(board.groupsById).map(group => ({
        id: group.groupId,
        label: group.label,
        squareIds: group.squareIds,
        rules: group.rules,
        presentation: Object.fromEntries(Object.entries(group.presentation).filter(([, value]) => typeof value !== 'function'))
    }));
    assert.deepStrictEqual(board.rules, expected.rules, editionId + ' Board rules should match the golden fixture');
    assert.deepStrictEqual(actualSquares, expected.squares, editionId + ' square economics and presentation should match the golden fixture');
    assert.deepStrictEqual(actualGroups, expected.groups, editionId + ' group economics and presentation should match the golden fixture');
    assert.deepStrictEqual(edition.buildCardDecks()['community-chest'].cards.map(card => card.text), expected.communityChest, editionId + ' Community Chest order should match the golden fixture');
    assert.deepStrictEqual(edition.buildCardDecks().chance.cards.map(card => card.text), expected.chance, editionId + ' Chance order should match the golden fixture');
    assert.strictEqual(expected.communityChest.length, 16, editionId + ' Community Chest should contain 16 cards');
    assert.strictEqual(expected.chance.length, 16, editionId + ' Chance should contain 16 cards');
});

// Representative deterministic card effects cover each shared behavior class in both editions.
function assertCardEffect(editionId, deckName, cardIndex, expectedCall, stateCheck) {
    const edition = Editions.get(editionId);
    const player = { name: 'Card player', money: 1000, heldCards: [] };
    GameStateApi.assignPlayerId(player, 1);
    const board = edition.buildBoard();
    const state = GameStateApi.createState({ player: [null, player], pcount: 1, players: [player], board });
    const calls = [];
    const game = { state };
    ['addAmount', 'subtractAmount', 'collectFromEachPlayer', 'payEachPlayer', 'streetRepairs', 'advanceToSquare', 'advanceToGroupNearest', 'moveRelative', 'goToJail'].forEach(method => {
        game[method] = function() { calls.push([method].concat(Array.from(arguments))); };
    });
    const deck = edition.buildCardDecks()[deckName];
    deck.cards[cardIndex].action({ game, state, playerId: 'player-1', squareId: 'chance-south', ui: {}, deckId: deckName, cardIndex, cardId: deckName + ':' + cardIndex });
    if (expectedCall) assert.deepStrictEqual(calls, [expectedCall], editionId + ' ' + deckName + ' card ' + cardIndex + ' effect');
    else assert.deepStrictEqual(calls, [], editionId + ' ' + deckName + ' card ' + cardIndex + ' should update player state directly');
    if (stateCheck) stateCheck(player, state);
}

['Classic', 'NYC'].forEach(editionId => {
    assertCardEffect(editionId, 'community-chest', 0, null, player => assert.deepStrictEqual(player.heldCards, ['community-chest:0']));
    assertCardEffect(editionId, 'community-chest', 1, ['addAmount', 10, 'Community Chest']);
    assertCardEffect(editionId, 'community-chest', 8, ['subtractAmount', 100, 'Community Chest']);
    assertCardEffect(editionId, 'community-chest', 12, ['collectFromEachPlayer', editionId === 'NYC' ? 50 : 10, 'Community Chest']);
    assertCardEffect(editionId, 'community-chest', 13, ['advanceToSquare', 'go', 'always']);
    assertCardEffect(editionId, 'community-chest', 14, ['streetRepairs', 40, 115, 'Community Chest']);
    assertCardEffect(editionId, 'community-chest', 15, ['goToJail']);
    assertCardEffect(editionId, 'chance', 0, null, player => assert.deepStrictEqual(player.heldCards, ['chance:0']));
    assertCardEffect(editionId, 'chance', 3, ['payEachPlayer', 50, 'Chance']);
    assertCardEffect(editionId, 'chance', 4, ['moveRelative', -3]);
    assertCardEffect(editionId, 'chance', 5, ['advanceToGroupNearest', 'utilities']);
    assertCardEffect(editionId, 'chance', 7, ['advanceToGroupNearest', 'railroads']);
    assertCardEffect(editionId, 'chance', 9, ['advanceToSquare', editionId === 'Classic' ? 'reading-railroad' : 'the-regency-hotel', 'onCrossing']);
    assertCardEffect(editionId, 'chance', 10, ['advanceToSquare', editionId === 'Classic' ? 'boardwalk' : 'trump-tower', 'never']);
});

// Ensure edition source keeps handlers context-bound and destinations stable-ID based.
['classic.js', 'newyorkcity.js'].forEach(file => {
    const source = fs.readFileSync(path.join(__dirname, 'js', 'editions', file), 'utf8');
    assert.match(source, /this\.action\s*=\s*function\(context\)/, file + ' card handlers must accept explicit context');
    assert.doesNotMatch(source, /global\.(?:player|game|square)\b|state\.square\b/, file + ' must not read ambient player/game/square state');
    assert.doesNotMatch(source, /advanceToSquare\(\s*\d+/, file + ' must not use numeric card destinations');
});

['Classic', 'NYC'].forEach(editionId => {
    const edition = Editions.get(editionId);
    const sourceBoard = edition.buildBoard();
    const secondSourceBoard = edition.buildBoard();
    assert.strictEqual(BoardApi.validateBoard(sourceBoard), sourceBoard);
    assert.notStrictEqual(sourceBoard, secondSourceBoard);
    assert.notStrictEqual(sourceBoard.squaresById, secondSourceBoard.squaresById);
    const firstRailroadId = sourceBoard.groupsById.railroads.squareIds[0];
    assert.notStrictEqual(sourceBoard.squaresById[firstRailroadId].rules.rentTiers, secondSourceBoard.squaresById[firstRailroadId].rules.rentTiers);
    assert.notStrictEqual(sourceBoard.groupsById.railroads.rules.rentTiers, secondSourceBoard.groupsById.railroads.rules.rentTiers);
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

function createEditionGame(editionId, ruleOverrides) {
	const setup = Editions.buildGameSetup(editionId, ruleOverrides);
	const state = GameStateApi.createState({
		cardDecks: setup.cardDecks
	});
	GameStateApi.initializeBoardState(state, setup.board, editionId);
	return new Game(null, state);
}

const classicGame = createEditionGame('Classic', { startSalary: 250 });
const nycGame = createEditionGame('NYC');
assert.strictEqual(classicGame.state.board.editionId, 'Classic');
assert.strictEqual(classicGame.state.board.rules.startSalary, 250);
assert.strictEqual(nycGame.state.board.editionId, 'NYC');
assert.strictEqual(nycGame.state.board.rules.startSalary, 200);
assert.ok(Object.isFrozen(classicGame.state.board));
assert.notStrictEqual(classicGame.state.board, nycGame.state.board);
assert.notStrictEqual(classicGame.state.squareStateById, nycGame.state.squareStateById);
assert.notStrictEqual(classicGame.state.cardDecks.chance.cards, nycGame.state.cardDecks.chance.cards);
assert.notStrictEqual(classicGame.state.cardDecks.chance.cards[0], nycGame.state.cardDecks.chance.cards[0]);

assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['city-tax'].rules.taxAmount, 200);
assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['city-tax'].rules.taxPercentOfNetWorth, 0.1);
assert.strictEqual(Editions.get('NYC').buildBoard().squaresById['luxury-tax'].rules.taxAmount, 75);
assert.strictEqual(Editions.get('Classic').buildBoard().squaresById['luxury-tax'].rules.taxAmount, 100);

function createTaxFixture(board) {
    const player = {
        name: 'Taxpayer',
        money: 1000,
        human: true,
        pay(amount) { this.money -= amount; }
    };
    GameStateApi.assignPlayerId(player, 1);
    const state = GameStateApi.createState({ player: [null, player], pcount: 1, square: null, freeParkingTaxes: true });
    GameStateApi.initializeBoardState(state, board);
    const taxEvents = [];
    const game = { addTaxToFreeParking(amount) { state.freeParkingPot += amount; } };
    const ui = {
        alert() {},
        displayLanded() {},
        chooseTax(fixedAmount, percentageAmount, onChoose) {
            taxEvents.push({ fixedAmount, percentageAmount });
            onChoose(percentageAmount);
        }
    };
    game.requestDecision = async (kind, id, options) => {
        let amount;
        ui.chooseTax(options.fixedAmount, options.percentageAmount, value => { amount = value; });
        return { type: 'tax', amount };
    };
    return { player, state, game, ui, taxEvents };
}

const nycTaxBoard = Editions.get('NYC').buildBoard();
const nycTaxFixture = createTaxFixture(nycTaxBoard);
GameStateApi.setSquareOwner(nycTaxFixture.state, 'port-authority-bus-terminal', 'player-1');
GameStateApi.getSquareState(nycTaxFixture.state, 'port-authority-bus-terminal').house = 1;
await nycTaxBoard.squaresById['city-tax'].behavior.onLand({
    game: nycTaxFixture.game,
    state: nycTaxFixture.state,
    playerId: 'player-1',
    squareId: 'city-tax',
    ui: nycTaxFixture.ui
});
assert.deepStrictEqual(nycTaxFixture.taxEvents, [{ fixedAmount: 200, percentageAmount: 111 }]);
assert.strictEqual(nycTaxFixture.player.money, 889);
assert.strictEqual(nycTaxFixture.state.freeParkingPot, 111);

const classicTaxBoard = Editions.get('Classic').buildBoard();
const classicTaxFixture = createTaxFixture(classicTaxBoard);
classicTaxBoard.squaresById['city-tax'].behavior.onLand({
    game: classicTaxFixture.game,
    state: classicTaxFixture.state,
    playerId: 'player-1',
    squareId: 'city-tax',
    ui: classicTaxFixture.ui
});
assert.strictEqual(classicTaxFixture.player.money, 800);
assert.strictEqual(classicTaxFixture.state.freeParkingPot, 200);

const cardPlayer = { name: 'Card player', money: 1000 };
GameStateApi.assignPlayerId(cardPlayer, 1);
const cardState = GameStateApi.createState({ player: [null, cardPlayer], pcount: 1, square: null, board: classicTaxBoard });
const cardMovement = [];
Editions.get('Classic').buildCardDecks().chance.cards[9].action({
    game: { advanceToSquare() { cardMovement.push(Array.from(arguments)); } },
    state: cardState,
    playerId: 'player-1',
    squareId: 'chance-south',
    ui: {}
});
assert.deepStrictEqual(cardMovement, [['reading-railroad', 'onCrossing']]);

assert.throws(() => Editions.register('LegacyOnlyFixture', {
    buildGroups: () => [], buildSquares: () => [],
    buildCardDecks: () => ({})
}), /must provide buildBoard/);
assert.throws(() => Editions.register('MissingDeckFixture', {
    buildBoard: apiCases.createBoardFixture
}), /buildCardDecks\(\)/);
Editions.register('VariableDeckFixture', {
    buildBoard: () => { const board = apiCases.createBoardFixture(); board.editionId = 'VariableDeckFixture'; return board; },
    buildCardDecks: () => ({
        only: { cards: [{ text: 'one card', action() {} }] },
        extra: { cards: Array.from({ length: 4 }, (_, index) => ({ text: 'card ' + index, action() {} })) }
    })
});
const variableDecks = Editions.buildCardDecksForGame('VariableDeckFixture');
assert.deepStrictEqual(Object.keys(variableDecks), ['only', 'extra']);
assert.strictEqual(variableDecks.only.cards.length, 1);
assert.strictEqual(variableDecks.extra.cards.length, 4);
assert.deepStrictEqual(variableDecks.extra.order, [0, 1, 2, 3]);
assert.throws(() => Editions.register('InvalidBoardFixture', {
    buildBoard: () => { const board = apiCases.createBoardFixture(); board.rules.startSalary = 0; return board; },
    buildCardDecks: () => ({})
}), /rules\.startSalary/);
assert.throws(() => Editions.register('MismatchedEditionFixture', {
    buildBoard: apiCases.createBoardFixture,
    buildCardDecks: () => ({})
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
    buildCardDecks: () => ({})
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
    tileKindCount: 9,
    staticFeatureCount: 22,
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
assert.strictEqual(schema1FeatureLayout.staticFeatureCount + schema1FeatureLayout.dynamicFeatureCount + schema1FeatureLayout.circuitFeatureCount, 50);
assert.strictEqual(schema1FeatureLayout.tileKindCount + 13, schema1FeatureLayout.staticFeatureCount);
assert.strictEqual(schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount, 48);
assert.strictEqual(schema1FeatureLayout.contextEmbeddingWidth + schema1FeatureLayout.globalFeatureCount + schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount + schema1FeatureLayout.tileEmbeddingWidth, schema1FeatureLayout.attentionInputWidth);
assert.strictEqual(schema1FeatureLayout.tileEmbeddingWidth * 3 + schema1FeatureLayout.globalFeatureCount + schema1FeatureLayout.seatCount * schema1FeatureLayout.seatFeatureCount + schema1FeatureLayout.contextEmbeddingWidth, schema1FeatureLayout.trunkInputWidth);
assert.ok(schema1Spec.includes('50-feature tile records'));
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
assert.strictEqual(tensorParameterTotal, 25107, 'Schema 1 parameter count is fixed');
assert.deepStrictEqual(tensorRows.map(row => [row[2], row[3].split(',').map(value => Number(value.trim()))]), Gen6Compatibility.TENSOR_SHAPES, 'runtime policy validation must match the normative tensor manifest');
assert.strictEqual(Gen6Compatibility.PARAMETER_COUNT, tensorParameterTotal);

const moneyScale = 4 * 200;
assert.strictEqual(Math.min(1, 200 / moneyScale), 0.25, 'A $200 feature on a $200-salary board should normalize to 0.25');
assert.strictEqual(Math.min(1, 1200 / moneyScale), 1, 'Monetary features should clamp at 1');
assert.strictEqual(Math.min(1, 4 / 10), 0.4, 'Utility multipliers should normalize by 10');
assert.strictEqual(Math.log1p(28), Math.log(29), 'Tile count uses log1p without clamp');

assert.strictEqual(typeof apiCases.runBoardApiContractCases, 'function');
assert.strictEqual(typeof apiCases.runGameStateApiContractCases, 'function');
apiCases.runBoardApiContractCases(BoardApi);
apiCases.runGameStateApiContractCases(GameStateApi);
assert.throws(() => new BoardApi.Square('GO'), /structured specification/);
assert.throws(() => new BoardApi.Square({ name: 'GO' }), /structured specification/);
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
            kind: index === 0 ? 'go' : 'card',
            deckId: index === 0 ? undefined : 'fixture-deck',
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

}
runContractTests().catch(error => { console.error(error); process.exitCode = 1; });
