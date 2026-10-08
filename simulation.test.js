const assert = require('assert');
const SimulationAdapters = require('./js/simulation/ai-adapter-registry');
const { SimBoard } = require('./js/simulation/match-runner');

async function runTests() {
    const adapter = {
        kind: 'fixture',
        supports: contestant => contestant && contestant.kind === 'fixture',
        createPlayerAI: () => ({
            buyProperty: () => false,
            beforeTurn: () => false,
            onLand: () => false,
            postBail: () => false,
            payDebt() {},
            bid: () => -1,
            acceptTrade: () => false
        }),
        serialize: contestant => ({ kind: 'fixture', marker: contestant.marker }),
        deserialize: contestant => contestant
    };
    SimulationAdapters.register(adapter);

    const encoded = SimulationAdapters.serialize({ kind: 'fixture', marker: 'round-trip' });
    assert.deepStrictEqual(encoded, { kind: 'fixture', marker: 'round-trip' });
    assert.deepStrictEqual(SimulationAdapters.deserialize(encoded), encoded);
    assert.strictEqual(
        Object.keys(require.cache).some(path => /[\\/]ai[\\/]ai-gen6[\\/]/.test(path)),
        false,
        'shared simulation must not load a Gen6 implementation'
    );

    const results = await new SimBoard([{ kind: 'fixture' }], 1, {
        edition: 'Classic',
        playerCount: 2
    }).run();
    assert.strictEqual(results.length, 2);
    assert.deepStrictEqual(results.map(result => result.playerIndex).sort(), [0, 1]);
    console.log('Shared simulation runs with an independently registered adapter.');
}

runTests().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
