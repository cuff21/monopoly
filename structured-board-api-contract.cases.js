const assert = require('assert');

function createBoardFixture() {
    const squareIds = ['go', 'street-a', 'railroad-a', 'utility-a'];
    const kinds = ['go', 'street', 'railroad', 'utility'];
    const groupIds = [null, 'streets', 'transit', 'utilities'];
    const rentTiers = [[], [10, 30, 90, 160, 250], [25, 50, 100, 200, 400], [4, 10, 10, 10, 10]];
    const squaresById = {};
    squareIds.forEach((id, index) => {
        squaresById[id] = {
            id,
            kind: kinds[index],
            groupId: groupIds[index] || undefined,
            nextId: squareIds[(index + 1) % squareIds.length],
            previousId: squareIds[(index + squareIds.length - 1) % squareIds.length],
            rules: {
                purchasePrice: [0, 60, 200, 150][index],
                baseRent: [0, 2, 0, 0][index],
                rentTiers: rentTiers[index],
                mortgageValue: [0, 30, 100, 75][index],
                houseCost: [0, 50, 0, 0][index],
                taxAmount: 0
            },
            presentation: { x: index * 25, y: 0, rotationDegrees: 0 }
        };
    });

    return {
        editionId: 'ContractFixture',
        startSquareId: 'go',
        rules: { startSalary: 200, houseTotal: 32, hotelTotal: 12, bailAmount: 50 },
        squaresById,
        groupsById: {
            streets: { groupId: 'streets', label: 'Streets', presentation: {}, rules: { monopolyMultiplier: 2 }, squareIds: ['street-a'] },
            transit: { groupId: 'transit', label: 'Railroads', presentation: {}, rules: { rentTiers: rentTiers[2].slice() }, squareIds: ['railroad-a'] },
            utilities: { groupId: 'utilities', label: 'Utilities', presentation: {}, rules: { rentTiers: rentTiers[3].slice() }, squareIds: ['utility-a'] }
        }
    };
}

function createStateFixture(board) {
    const playerOne = { playerId: 'player-1' };
    const playerThree = { playerId: 'player-3' };
    const squareStateById = {};
    Object.keys(board.squaresById).forEach(squareId => {
        squareStateById[squareId] = {
            ownerId: null,
            mortgage: false,
            house: 0,
            hotel: 0,
            landcount: 0
        };
    });
    return {
        board,
        player: [null, playerOne, playerThree], pcount: 2,
        squareStateById
    };
}

function runBoardApiContractCases(boardApi) {
    const board = createBoardFixture();
    assert.strictEqual(boardApi.getSquare(board, 'street-a'), board.squaresById['street-a']);
    assert.strictEqual(boardApi.getGroup(board, 'transit'), board.groupsById.transit);
    assert.deepStrictEqual(boardApi.getGroupSquareIds(board, 'transit'), ['railroad-a']);
    assert.strictEqual(boardApi.walk(board, 'street-a', 0), 'street-a');
    assert.strictEqual(boardApi.walk(board, 'street-a', 1), 'railroad-a');
    assert.strictEqual(boardApi.walk(board, 'street-a', -1), 'go');
    assert.strictEqual(boardApi.walk(board, 'street-a', 8), 'street-a');
    assert.strictEqual(boardApi.walk(board, 'street-a', -5), 'go');
    assert.strictEqual(boardApi.findNext(board, 'street-a', square => square.kind === 'utility'), 'utility-a');
    assert.strictEqual(boardApi.findNext(board, 'street-a', square => square.id === 'street-a'), 'street-a');
    assert.strictEqual(boardApi.findNext(board, 'street-a', () => false), null);

    assert.throws(() => boardApi.getSquare(board, 'missing-square'), RangeError);
    assert.throws(() => boardApi.getGroup(board, 'missing-group'), RangeError);
    assert.throws(() => boardApi.getGroupSquareIds(board, 'missing-group'), RangeError);
    assert.throws(() => boardApi.walk(board, 'missing-square', 1), RangeError);
    assert.throws(() => boardApi.walk(board, 'go', 1.5), RangeError);
    assert.throws(() => boardApi.findNext(board, 'missing-square', () => true), RangeError);
}

function runGameStateApiContractCases(stateApi) {
    const board = createBoardFixture();
    const state = createStateFixture(board);
    const playerOne = state.player[1];
    const playerThree = state.player[2];

    assert.strictEqual(stateApi.getSquareState(state, 'street-a'), state.squareStateById['street-a']);
    assert.strictEqual(stateApi.getPlayerById(state, 'player-1'), playerOne);
    assert.strictEqual(stateApi.getPlayerAtSeat(state, 3), playerThree);
    const firstGameState = stateApi.initializeBoardState({}, board);
    const secondGameState = stateApi.initializeBoardState({}, board);
    assert.strictEqual(firstGameState.board, board);
    assert.notStrictEqual(firstGameState.squareStateById, secondGameState.squareStateById);
    assert.deepStrictEqual(Object.keys(firstGameState.squareStateById), Object.keys(board.squaresById));
    stateApi.setSquareOwner(state, 'street-a', 'player-3');
    assert.strictEqual(state.squareStateById['street-a'].ownerId, 'player-3');
    stateApi.setSquareOwner(state, 'street-a', null);
    assert.strictEqual(state.squareStateById['street-a'].ownerId, null);

    assert.throws(() => stateApi.getSquareState(state, 'missing-square'), RangeError);
    assert.throws(() => stateApi.setSquareOwner(state, 'missing-square', null), RangeError);
    assert.throws(() => stateApi.getPlayerById(state, 'player-2'), RangeError);
    assert.throws(() => stateApi.getPlayerAtSeat(state, 0), RangeError);
    assert.throws(() => stateApi.setSquareOwner(state, 'street-a', 'player-2'), RangeError);
    assert.throws(() => stateApi.setSquareOwner(state, 'street-a', 'bank'), RangeError);
    assert.strictEqual(state.squareStateById['street-a'].ownerId, null);

    const identifiedPlayer = {};
    assert.strictEqual(stateApi.assignPlayerId(identifiedPlayer, 4), 'player-4');
    assert.strictEqual(Object.getOwnPropertyDescriptor(identifiedPlayer, 'playerId').writable, false);
    assert.throws(() => stateApi.assignPlayerId(identifiedPlayer, 5), RangeError);
}

module.exports = {
    createBoardFixture,
    createStateFixture,
    runBoardApiContractCases,
    runGameStateApiContractCases
};