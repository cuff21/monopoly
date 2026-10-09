const assert = require('assert');
const NetworkAdapter = require('./js/ai/ai-gen6/neat/network-adapter');

// 1. Load Gen6 modules
const { Genotype } = require('./js/ai/ai-gen6/neat/genotype');
const Crossover = require('./js/ai/ai-gen6/neat/crossover');
const { Phenotype } = require('./js/ai/ai-gen6/neat/phenotype');
const { Gen6AI } = require('./js/ai/ai-gen6/index');
const { SimBoard } = require('./js/simulation/match-runner');
const { Tournament } = require('./js/ai/ai-gen6/sim/tournament');
const { Population } = require('./js/ai/ai-gen6/neat/population');
const PopulationLoader = require('./js/ai/ai-gen6/data/population-loader');
const { Gen6Trainer } = require('./js/ai/ai-gen6/sim/trainer');
const Gen6SimulationAdapter = require('./js/ai/ai-gen6/simulation-adapter');
const PolicyEvaluator = require('./js/ai/ai-gen6/sim/policy-evaluator');
const ApplicationScriptManifest = require('./js/script-manifest');
const { processBatch, bootstrapWorker } = require('./js/simulation/worker-entry');
const { createWorkerMessageHandler } = require('./js/simulation/worker-runtime');
const Gen6Compatibility = require('./js/ai/ai-gen6/schema1-compatibility');
require('./js/game/property-actions');

async function runTests() {
    console.log('Testing Gen6 AI Interface & Headless Decoupled Core...');

    [126, 146, 147].forEach(inputCount => {
        assert.throws(
            () => Gen6Compatibility.rejectLegacyInput({ inputCount }),
            /Unsupported legacy Gen6 NEAT data/,
            inputCount + '-input saved policies must be rejected'
        );
        assert.throws(
            () => Gen6Compatibility.rejectLegacyInput({ schemaVersion: 1, inputCount }),
            /legacy NEAT fields are not supported/,
            'matching version metadata must not make a legacy shape usable'
        );
    });
    assert.throws(() => Gen6Compatibility.rejectLegacyInput('saved-neat-genome'), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => Gen6Compatibility.rejectLegacyInput({ population: [] }), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => Genotype.fromString('saved-neat-genome'), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => PopulationLoader.fromString('saved-neat-population'), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => Population.loadFromString('saved-neat-population'), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => new Gen6AI({}, 'saved-neat-genome'), /Unsupported legacy Gen6 NEAT data/);
    assert.throws(() => Gen6SimulationAdapter.deserialize({ kind: 'gen6', genotype: 'saved-neat-genome' }), /Unsupported legacy Gen6 NEAT data/);
    const workerGenome = Genotype.createInitial(3, 2);
    const workerPayload = Gen6SimulationAdapter.serialize({ kind: 'gen6', genotype: workerGenome });
    const restoredWorkerGenome = Gen6SimulationAdapter.deserialize(workerPayload).genotype;
    assert.ok(restoredWorkerGenome instanceof Genotype, 'worker transport should restore an in-memory genotype');
    assert.strictEqual(restoredWorkerGenome.toString(), workerGenome.toString(), 'structured worker transport should preserve genome values');

    let enumeratedLegacyKeys = 0;
    const legacyStorage = {
        get length() { return 3; },
        key(index) {
            enumeratedLegacyKeys++;
            return ['gen6Population', 'gameHistory', 'gen6Champion'][index];
        },
        getItem() { throw new Error('legacy values must never be read'); }
    };
    assert.throws(() => Gen6Compatibility.rejectLegacyStorage(legacyStorage), /gen6Population, gen6Champion/);
    assert.strictEqual(enumeratedLegacyKeys, 3, 'legacy detection should enumerate key names only');
    assert.strictEqual(Gen6Compatibility.rejectLegacyStorage({ length: 1, key: () => 'gameHistory' }).length, 0);
    const schema1PolicyTensors = Gen6Compatibility.TENSOR_SHAPES.map(([name, shape]) => ({
        name,
        shape: shape.slice(),
        values: new Float32Array(shape.reduce((size, dimension) => size * dimension, 1))
    }));
    assert.strictEqual(schema1PolicyTensors.reduce((total, tensor) => total + tensor.values.length, 0), 25107);
    assert.strictEqual(Gen6Compatibility.PARAMETER_COUNT, 25107);
    assert.deepStrictEqual(Gen6Compatibility.TILE_KINDS, ['street', 'railroad', 'utility', 'tax', 'card', 'jail', 'go-to-jail', 'free-parking', 'go']);
    assert.deepStrictEqual(Array.from(Gen6Compatibility.encodeTileKind('card')), [0, 0, 0, 0, 1, 0, 0, 0, 0]);
    assert.throws(() => Gen6Compatibility.encodeTileKind('chance'), RangeError);
    assert.ok(Gen6Compatibility.normalizeCardCount(3) > Gen6Compatibility.normalizeCardCount(2), 'card-count features must distinguish counts above two');
    [0, 1, 2, 3, 16, 1000, 1000000].forEach(count => assert.ok(Number.isFinite(Gen6Compatibility.normalizeCardCount(count))));
    assert.deepStrictEqual(Array.from(Gen6Compatibility.encodeTradeCardTransfer(3, 4)), [Math.fround(Math.log1p(3)), Math.fround(Math.log1p(4))]);
    assert.deepStrictEqual(Gen6Compatibility.jailActionMask(0, 200, 50), [false, true, true]);
    assert.deepStrictEqual(Gen6Compatibility.jailActionMask(9, 0, 50), [true, true, false]);
    const cardCopyKeys = [0, 1, 2].map(copyOrdinal => Array.from(Gen6Compatibility.encodeJailCardCandidateKey(1, 0, copyOrdinal)));
    assert.strictEqual(new Set(cardCopyKeys.map(key => key.join(','))).size, 3, 'equivalent card copies need distinct sampling keys');
    assert.deepStrictEqual(cardCopyKeys, [0, 1, 2].map(copyOrdinal => Array.from(Gen6Compatibility.encodeJailCardCandidateKey(1, 0, copyOrdinal))), 'candidate keys must not depend on held-card IDs or their order');
    assert.throws(() => Gen6Compatibility.normalizeCardCount(-1), RangeError);
    const schema1PolicyEnvelope = {
        format: 'monopoly-gen6-policy', schemaVersion: 1, policyId: 'active',
        tensors: schema1PolicyTensors,
        validation: {}, coverage: {}
    };
    assert.strictEqual(Gen6Compatibility.assertSchema1Record(schema1PolicyEnvelope), schema1PolicyEnvelope);
    assert.throws(() => Gen6Compatibility.assertSchema1Record({ schemaVersion: 1 }), /Malformed Schema 1/);
    assert.throws(() => Gen6Compatibility.assertSchema1Record({
        ...schema1PolicyEnvelope, tensors: [{ ...schema1PolicyTensors[0], shape: [32, 51], values: new Float32Array(32 * 51) }, ...schema1PolicyTensors.slice(1)]
    }), /Malformed Schema 1 Gen6 policy record/);
    assert.throws(() => Gen6Compatibility.assertSchema1Record({
        ...schema1PolicyEnvelope, tensors: schema1PolicyTensors.slice(0, -1)
    }), /Malformed Schema 1 Gen6 policy record/, 'interim and old tensor manifests must not be accepted as Schema 1');
    assert.throws(() => Gen6Compatibility.assertSchema1Record({ schemaVersion: 2 }), /schemaVersion 1 is required/);
    console.log('✔ Test 0.01: Unsupported Gen6 schemas and legacy storage are rejected without reading values.');

    // --- Test 0.05: Browser simulation worker bootstrap loads all required modules ---
    const importedScripts = [];
    const fakeWorkerScope = {
        location: { href: 'https://example.test/js/simulation/worker-entry.js' },
        ApplicationScriptManifest: ApplicationScriptManifest,
        importScripts(...scripts) {
            importedScripts.push(...scripts);
            if (scripts.some(script => script.endsWith('/match-runner.js'))) this.SimBoard = function() {};
            if (scripts.some(script => script.endsWith('/ai-adapter-registry.js'))) this.SimulationAdapters = {};
        }
    };
    bootstrapWorker(fakeWorkerScope);
    assert.strictEqual(importedScripts[0], 'https://example.test/js/script-manifest.js');
    const workerScripts = ApplicationScriptManifest.scripts.filter(script => script.worker);
    assert.deepStrictEqual(importedScripts.slice(1), workerScripts.map(script =>
        new URL(script.src, importedScripts[0]).href
    ));
    const fs = require('fs');
    const path = require('path');
    workerScripts.forEach(script => {
        assert.ok(fs.existsSync(path.resolve(__dirname, 'js', script.src)), 'worker dependency should exist: ' + script.src);
    });
    assert.ok(workerScripts.some(script => script.src === 'simulation/match-runner.js'));
    assert.ok(workerScripts.some(script => script.src === 'ai/ai-gen6/index.js'));
    assert.ok(workerScripts.some(script => script.src === 'simulation/worker-runtime.js'));
    assert.ok(!importedScripts.some(script => script.includes('/ai-gen6/sim/worker-entry.js')));
    console.log('✔ Test 0.05: Browser worker bootstrap verified.');

    // --- Test 0.08: Browser worker pool bounds and overlaps match dispatch ---
    let workerActiveMatches = 0;
    let workerMaxActiveMatches = 0;
    const workerMessages = [];
    class FakeSimulationWorker {
        postMessage(message) {
            workerMessages.push(message);
            workerActiveMatches++;
            workerMaxActiveMatches = Math.max(workerMaxActiveMatches, workerActiveMatches);
            setTimeout(() => {
                workerActiveMatches--;
                this.onmessage({ data: {
                    id: message.id,
                    success: true,
                    result: [{ results: message.matches[0].contestants.map((_, playerIndex) => ({ playerIndex, netWorth: 1000 })) }]
                } });
            }, 1);
        }
        terminate() {}
    }
    const workerPool = new Gen6Trainer.BrowserWorkerPool(2, 'fake-worker.js', FakeSimulationWorker);
    const workerBrains = Array.from({ length: 4 }, () => Genotype.createInitial(147, 9));
    const workerMatches = await Promise.all([
        workerPool.runMatch(workerBrains, 5, { edition: 'NYC', playerCount: 6, boardRuleOverrides: { startSalary: 250 }, seed: 77 }),
        workerPool.runMatch(workerBrains, 5, { edition: 'NYC', playerCount: 6 }),
        workerPool.runMatch(workerBrains, 5, { edition: 'NYC', playerCount: 6 }),
        workerPool.runMatch([
            { kind: 'gen6', genotype: workerBrains[0] },
            { kind: 'baseline', ai: 'gen5', profile: 'Tactician' }
        ], 5, { edition: 'Classic', playerCount: 4 })
    ]);
    workerPool.terminate();
    assert.strictEqual(workerMatches.length, 4);
    assert.strictEqual(workerMaxActiveMatches, 2, 'pool should execute concurrently but respect its worker limit');
    assert.ok(workerMessages.slice(0, 3).every(message => message.matches[0].edition === 'NYC' && message.matches[0].playerCount === 6), 'worker messages should preserve the fixed tournament setup');
    assert.deepStrictEqual(workerMessages[0].matches[0].boardRuleOverrides, { startSalary: 250 }, 'worker payloads should carry rule overrides as setup data');
    assert.strictEqual(workerMessages[0].matches[0].seed, 77, 'worker payloads should carry the match seed as setup data');
    assert.strictEqual(workerMessages[0].matches[0].board, undefined, 'workers should build Boards locally rather than receive function-bearing Boards');
    assert.deepStrictEqual(
        workerMessages[3].matches[0].contestants[0].genotype,
        Gen6SimulationAdapter.serialize({ kind: 'gen6', genotype: workerBrains[0] }).genotype
    );
    assert.deepStrictEqual(workerMessages[3].matches[0].contestants[1], { kind: 'baseline', ai: 'gen5', profile: 'Tactician' });

    let slotWorkerCount = 0;
    class SlotTimeoutSimulationWorker {
        constructor() { this.workerIndex = ++slotWorkerCount; }
        postMessage(message) {
            if (this.workerIndex === 1) return;
            setTimeout(() => this.onmessage({ data: {
                id: message.id,
                success: true,
                result: [{ results: [{ playerIndex: 0 }] }]
            } }), 0);
        }
        terminate() {}
    }
    const multiWorkerPool = new Gen6Trainer.BrowserWorkerPool(2, 'slot-timeout-worker.js', SlotTimeoutSimulationWorker, 10);
    await Promise.race([
        Promise.all([
            multiWorkerPool.runMatch(workerBrains, 5, { edition: 'Classic', playerCount: 4 }),
            multiWorkerPool.runMatch(workerBrains, 5, { edition: 'Classic', playerCount: 4 })
        ]),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('A stalled worker slot was not retried.')), 100))
    ]);
    assert.strictEqual(slotWorkerCount, 3, 'the watchdog should retry a hung job on its own worker slot');
    multiWorkerPool.terminate();

    class HangingSimulationWorker {
        postMessage() {}
        terminate() {}
    }
    let retryWorkerCount = 0;
    class RetrySimulationWorker {
        constructor() { this.attempt = ++retryWorkerCount; }
        postMessage(message) {
            if (this.attempt === 2) {
                setTimeout(() => this.onmessage({ data: {
                    id: message.id,
                    success: true,
                    result: [{ results: [{ playerIndex: 0 }] }]
                } }), 0);
            }
        }
        terminate() {}
    }
    const retryPool = new Gen6Trainer.BrowserWorkerPool(1, 'retry-worker.js', RetrySimulationWorker, 10);
    const retriedResults = await retryPool.runMatch(workerBrains, 5, { edition: 'Classic', playerCount: 4 });
    assert.strictEqual(retryWorkerCount, 2, 'timed-out matches should be retried on a replacement worker');
    assert.strictEqual(retriedResults.length, 1, 'the retry should resolve with its match results');
    retryPool.terminate();

    const timedPool = new Gen6Trainer.BrowserWorkerPool(1, 'hanging-worker.js', HangingSimulationWorker, 10, 0);
    await assert.rejects(
        timedPool.runMatch(workerBrains, 5, { edition: 'Classic', playerCount: 4 }),
        /timed out after 10 ms and 0 retries/
    );
    assert.strictEqual(timedPool.terminated, true, 'a hung match should close its worker pool instead of freezing training');

    const workerErrors = [];
    const messageHandler = createWorkerMessageHandler(message => workerErrors.push(message));
    const pendingWorkerResult = messageHandler.handle({ id: 7 });
    assert.strictEqual(messageHandler.handleUnhandledRejection(new Error('turn flow failed')), true);
    assert.deepStrictEqual(workerErrors, [{ id: 7, success: false, error: 'turn flow failed' }]);
    await pendingWorkerResult;
    console.log('✔ Test 0.08: Bounded worker pool verified.');

    // --- Test 0.5: Gen6 features encode the game's mortgage field ---
    const mortgageSquares = [];
    mortgageSquares[1] = { mortgage: true };
    const mortgageInputs = NetworkAdapter.encodeInputs({ squares: mortgageSquares });
    assert.strictEqual(mortgageInputs[48], 1, 'mortgaged property state should be visible to the network');
    console.log('✔ Test 0.5: Mortgage state encoding verified.');

    const eightPlayerSquares = [];
    eightPlayerSquares[1] = { owner: 8, mortgage: true };
    const eightPlayerInputs = NetworkAdapter.encodeInputs({
        players: Array.from({ length: 8 }, (_, index) => ({ position: index, money: 1000 + index })),
        currentTurn: 7,
        squares: eightPlayerSquares,
        selectedPropertyIndex: 1
    }, 146);
    assert.strictEqual(eightPlayerInputs.length, 146);
    assert.strictEqual(eightPlayerInputs[7], 1, 'eighth player should have a distinct turn feature');
    assert.strictEqual(eightPlayerInputs[40], 1, 'eighth-player ownership should be encoded');
    assert.strictEqual(eightPlayerInputs[68], 1, 'v2 mortgage feature should use its versioned offset');
    assert.strictEqual(eightPlayerInputs[118], 1, 'v2 property selection should use its versioned offset');
    const eightPlayerChild = Crossover.breed(Genotype.createInitial(146, 9), Genotype.createInitial(146, 9));
    const legacyChild = Crossover.breed(Genotype.createInitial(126, 9), Genotype.createInitial(126, 9));
    assert.strictEqual(new Phenotype(eightPlayerChild).inputCount, 146, 'crossover should preserve v2 input nodes');
    assert.strictEqual(new Phenotype(legacyChild).inputCount, 126, 'crossover should preserve legacy input nodes');

    const eightPlayerRoster = [null, ...Array.from({ length: 8 }, (_, index) => ({
        index: index + 1,
        position: index + 1,
        money: 1000 + index
    }))];
    const eightPlayerGame = { state: { player: eightPlayerRoster, pcount: 8, square: [] } };
    eightPlayerRoster[8].game = eightPlayerGame;
    const eightPlayerAI = new Gen6AI(eightPlayerRoster[8], Genotype.createInitial(147, 9));
    let eightPlayerDecisionInputs;
    eightPlayerAI.phenotype.evaluate = inputs => {
        eightPlayerDecisionInputs = inputs;
        return new Float64Array(9);
    };
    eightPlayerAI.getDecision();
    assert.strictEqual(eightPlayerDecisionInputs[15], 8 / 39, '147-input brains should see player 8 position');
    assert.strictEqual(eightPlayerDecisionInputs[23], 1007 / 4000, '147-input brains should see player 8 money');

    const tradeContextAI = new Gen6AI({ index: 1, money: 1000, position: 0 }, Genotype.createInitial(147, 9));
    let encodedOffer;
    tradeContextAI.phenotype.evaluate = inputs => { encodedOffer = inputs; return new Float64Array(9); };
    const tradeProperties = [];
    tradeProperties[1] = -1;
    tradeContextAI.acceptTrade({ getMoney: () => -200, getProperty: index => tradeProperties[index] || 0 });
    assert.strictEqual(encodedOffer[118], -1, 'v3 policy should receive signed property offer context');
    assert.strictEqual(encodedOffer[146], -0.05, 'v3 policy should receive normalized money context');
    console.log('✔ Test 0.6: Eight-player and context input schemas verified.');

    // --- Test 0.62: Gen6 property outputs invoke legal mortgage and debt actions ---
    const policyPlayer = { index: 1, money: 1500, position: 0 };
    const policySquares = Array.from({ length: 40 }, () => ({ owner: 0, house: 0, hotel: 0, mortgage: false, price: 100, houseprice: 50, group: [] }));
    policySquares[1].owner = 1;
    let mortgageCalls = 0;
    let unmortgageCalls = 0;
    let houseSaleCalls = 0;
    const policyGame = {
        state: { player: [null, policyPlayer], square: policySquares, pcount: 1 },
        mortgage(index) { mortgageCalls++; policySquares[index].mortgage = true; return true; },
        unmortgage(index) { unmortgageCalls++; policySquares[index].mortgage = false; return true; },
        getHouseHotelSupply() { return { housesAvailable: 0, hotelsAvailable: 0 }; },
        canSellHouse() { return true; },
        sellHouse(index) { houseSaleCalls++; policySquares[index].house--; policyPlayer.money += 100; return true; }
    };
    policyPlayer.game = policyGame;
    const policyAI = new Gen6AI(policyPlayer, Genotype.createInitial(147, 9));
    policyAI.getDecision = () => policySquares[1].mortgage
        ? { unmortgage: true, mortgage: false, buildHouseCount: 0 }
        : { mortgage: true, unmortgage: false, buildHouseCount: 0 };
    policyAI.beforeTurn();
    assert.strictEqual(mortgageCalls, 1, 'mortgage output should invoke mortgage()');
    policyAI.beforeTurn();
    assert.strictEqual(unmortgageCalls, 1, 'unmortgage output should invoke unmortgage()');

    policySquares[1].house = 1;
    policyPlayer.money = -50;
    policyAI.getDecision = () => ({ sellHouseCount: 1 });
    policyAI.payDebt();
    assert.strictEqual(houseSaleCalls, 1, 'sellHouseCount should limit and invoke house sales');
    console.log('✔ Test 0.62: Gen6 property policy actions verified.');

    // --- Test 0.65: Gen6 proposes a legal reciprocal monopoly trade ---
    const tradeBot = { index: 1, playerId: 'player-1', position: 5, money: 1200 };
    const tradeOpponent = { index: 2, playerId: 'player-2', position: 10, money: 1100 };
    const tradeBoard = Array.from({ length: 40 }, (_, index) => ({ id: 'trade-property-' + index, index, owner: 0, house: 0, hotel: 0, mortgage: false, houseprice: 50, group: null }));
    tradeBoard[1].group = tradeBoard[3].group = [1, 3];
    tradeBoard[6].group = tradeBoard[8].group = [6, 8];
    tradeBoard[1].owner = tradeBoard[6].owner = 1;
    tradeBoard[3].owner = tradeBoard[8].owner = 2;
    let proposedTrade = null;
    const tradeGame = {
        state: { player: [null, tradeBot, tradeOpponent], square: tradeBoard, pcount: 2 },
        trade(trade) { proposedTrade = trade; }
    };
    tradeBot.game = tradeGame;
    const tradingAI = new Gen6AI(tradeBot, Genotype.createInitial(147, 9));
    tradingAI.getDecision = () => ({ proposeTrade: true });
    assert.strictEqual(tradingAI.onLand(), true, 'proposal output should submit a valid reciprocal trade');
    assert.deepStrictEqual(proposedTrade.getRequestedSquareIds(), ['trade-property-3'], 'AI should request the opponent-owned missing group member');
    assert.deepStrictEqual(proposedTrade.getOfferedSquareIds(), ['trade-property-6'], 'AI should offer its piece completing the opponent group');
    console.log('✔ Test 0.65: Reciprocal trade proposal verified.');

    // --- Test 1: Gen6AI instantiation & decision methods ---
    const genome = Genotype.createInitial(126, 9);
    const playerMock = { index: 1, money: 1500, name: 'Gen6 Bot', human: false, position: 0 };
    const ai = new Gen6AI(playerMock, genome);

    assert.strictEqual(typeof ai.buyProperty, 'function', 'buyProperty should be a function');
    assert.strictEqual(typeof ai.postBail, 'function', 'postBail should be a function');
    assert.strictEqual(typeof ai.beforeTurn, 'function', 'beforeTurn should be a function');
    assert.strictEqual(typeof ai.onLand, 'function', 'onLand should be a function');
    assert.strictEqual(typeof ai.payDebt, 'function', 'payDebt should be a function');
    assert.strictEqual(typeof ai.bid, 'function', 'bid should be a function');
    assert.strictEqual(typeof ai.acceptTrade, 'function', 'acceptTrade should be a function');
    assert.strictEqual(ai.phenotype.inputCount, 126, 'legacy 126-input genomes should retain their original schema');
    const defaultSchemaAI = new Gen6AI(playerMock);
    assert.strictEqual(defaultSchemaAI.phenotype.inputCount, 147, 'new Gen6 brains should use the context-aware schema');
    assert.strictEqual(Gen6AI.supportsPlayerCount(4), true, 'Gen6 should support four-player games');
    assert.strictEqual(Gen6AI.supportsPlayerCount(8), true, 'Gen6 should support eight-player games');
    assert.strictEqual(Gen6AI.supportsPlayerCount(9), false, 'Gen6 should reject player counts beyond eight');

    // Test buy decision
    const buyDecision = ai.buyProperty(1);
    assert.strictEqual(typeof buyDecision, 'boolean', 'buyProperty should return boolean');

    // Test bid decision
    const bidDecision = ai.bid(1, 100);
    assert.strictEqual(typeof bidDecision, 'number', 'bid should return integer/number');

    // Test postBail decision
    const bailDecision = ai.postBail();
    assert.strictEqual(typeof bailDecision, 'boolean', 'postBail should return boolean');

    console.log('✔ Test 1: Gen6AI interface methods verified.');

    // --- Test 2: Headless Game Simulation using Decoupled Core ---
    console.log('Testing Headless Game Simulation (4 Gen6 AI bots, 60 turns)...');
    const contestants = [
        Genotype.createInitial(126, 9),
        Genotype.createInitial(126, 9),
        Genotype.createInitial(126, 9),
        Genotype.createInitial(126, 9)
    ];

    const startTime = Date.now();
    const preSimulationPlayerArray = global.player;
    const preSimulationGame = global.game;
    const preSimulationSquare = global.square;
    const board = new SimBoard(contestants, 60);
    const results = await board.run();
    const elapsed = Date.now() - startTime;

    assert.ok(Array.isArray(results), 'board.run() should return an array');
    assert.strictEqual(results.length, 4, 'should have results for all 4 players');
    assert.strictEqual(global.player, preSimulationPlayerArray, 'headless match should restore the original player array');
    assert.strictEqual(global.game, preSimulationGame, 'headless match should restore the previous game instance');
    assert.strictEqual(global.square, preSimulationSquare, 'headless match should restore the original board');
    assert.ok(results.every(result => Number.isInteger(result.turns) && result.turns >= 0 && result.turns <= 60), 'match results should report bounded turns played');
    assert.ok(results[0].netWorth >= results[1].netWorth || (!results[0].bankrupt && results[1].bankrupt), 'results should be sorted descending');
    assert.ok(elapsed < 5000, `Headless game completed in ${elapsed}ms (should be < 5000ms)`);

    console.log(`✔ Test 2: Headless match completed in ${elapsed}ms without DOM dependencies.`);

    const eightBrains = Array.from({ length: 8 }, () => Genotype.createInitial(146, 9));
    const eightPlayerResults = await new SimBoard(eightBrains, 5).run();
    assert.strictEqual(eightPlayerResults.length, 8, 'eight Gen6 players should complete a headless match');
    console.log('✔ Test 2.5: Eight-player Gen6 headless match completed.');

    const previousEdition = global.Monopoly.Editions.getActiveName();
    const nycResults = await new SimBoard(contestants, 20, { edition: 'NYC', playerCount: 4 }).run();
    assert.strictEqual(nycResults.length, 4, 'NYC edition should complete a headless match');
    assert.strictEqual(global.Monopoly.Editions.getActiveName(), previousEdition, 'headless match should restore the active edition');
    console.log('✔ Test 2.6: NYC headless match and edition restoration verified.');

    // --- Test 3: Simulation Worker batch processing ---
    console.log('Testing Simulation Worker batch processing...');
    const workerResult = await processBatch({
        matches: [
            {
                contestants: contestants.map(g => Gen6SimulationAdapter.serialize(g)),
                maxTurns: 20,
                edition: 'NYC',
                playerCount: 5
            },
            {
                contestants: [
                    Gen6SimulationAdapter.serialize(contestants[0]),
                    { kind: 'baseline', ai: 'gen5', profile: 'Tactician' },
                    { kind: 'baseline', ai: 'strategic', profile: 'Balanced' },
                    { kind: 'baseline', ai: 'strategic', profile: 'Defensive' }
                ],
                maxTurns: 5,
                edition: 'Classic',
                playerCount: 4
            }
        ]
    });
    assert.ok(Array.isArray(workerResult), 'worker should return array of match results');
    assert.strictEqual(workerResult.length, 2, 'worker should return both match results');
    assert.strictEqual(workerResult[0].results.length, 5, 'match should include the configured fifth seat');
    assert.strictEqual(workerResult[1].results.length, 4, 'worker should run mixed Gen6 and baseline contestants');
    console.log('✔ Test 3: Simulation Worker batch execution verified.');

    // --- Test 4: Tournament Execution ---
    console.log('Testing Tournament round execution with Headless Core...');
    const pop = new Population(8, 126, 9);
    pop.initialize();
    const tournament = new Tournament(pop, 20);
    const tourneyResults = await tournament.run();

    assert.ok(tourneyResults.champion !== null, 'tournament should produce a champion');
    assert.ok(tourneyResults.topScore > 0, 'tournament champion should have positive fitness');
    assert.ok(['Classic', 'NYC'].includes(tournament.setup.edition), 'tournament should choose a registered edition');
    assert.ok(tournament.setup.playerCount >= 2 && tournament.setup.playerCount <= 8, 'tournament should choose a supported player count');

    console.log(`✔ Test 4: Tournament successfully determined champion with score ${tourneyResults.topScore}.`);

    async function tournamentScoreAtDuration(turns) {
        const durationPopulation = new Population(2, 147, 9);
        durationPopulation.initialize();
        const durationTournament = new Tournament(durationPopulation, 100, async () => [
            { playerIndex: 0, netWorth: 1000, turns: turns },
            { playerIndex: 1, netWorth: 500, turns: turns }
        ], { edition: 'Classic', playerCount: 2 });
        return durationTournament.run();
    }
    const quickTournament = await tournamentScoreAtDuration(10);
    const slowTournament = await tournamentScoreAtDuration(100);
    assert.ok(quickTournament.topScore > slowTournament.topScore, 'longer games should reduce tournament fitness');

    const firstSetup = new Tournament(pop, 5, null, { random: () => 0 }).selectSetup();
    const lastSetup = new Tournament(pop, 5, null, { random: () => 0.999 }).selectSetup();
    assert.deepStrictEqual(firstSetup, { edition: 'Classic', playerCount: 2 });
    assert.deepStrictEqual(lastSetup, { edition: 'NYC', playerCount: 8 });

    const qualityProgress = [];
    const strongPolicyEvaluator = new PolicyEvaluator({
        games: 6,
        turnsPerGame: 100,
        editions: ['Classic', 'NYC'],
        playerCounts: [4, 6],
        random: () => 0.999,
        matchRunner: async (lineup, turns, setup) => {
            assert.strictEqual(turns, 100);
            assert.deepStrictEqual(setup, { edition: 'NYC', playerCount: 6 });
            return lineup.map((contestant, playerIndex) => ({
                playerIndex,
                netWorth: contestant.kind === 'gen6' ? 5000 : 1000 - playerIndex,
                bankrupt: false
            })).sort((a, b) => b.netWorth - a.netWorth);
        }
    });
    const passingQuality = await strongPolicyEvaluator.evaluate(workerBrains[0], update => qualityProgress.push(update));
    assert.strictEqual(passingQuality.games, 6);
    assert.strictEqual(passingQuality.passed, true, 'strong held-out results should clear the configured confidence-adjusted threshold');
    assert.strictEqual(passingQuality.requiredImprovement, 5);
    assert.strictEqual(qualityProgress.length, 6);

    const weakPolicyEvaluator = new PolicyEvaluator({
        games: 6,
        editions: ['Classic'],
        playerCounts: [4],
        random: () => 0.999,
        matchRunner: async lineup => lineup.map((contestant, playerIndex) => ({
            playerIndex,
            netWorth: contestant.kind === 'gen6' ? 0 : 1000 - playerIndex,
            bankrupt: false
        })).sort((a, b) => b.netWorth - a.netWorth)
    });
    const failingQuality = await weakPolicyEvaluator.evaluate(workerBrains[0]);
    assert.strictEqual(failingQuality.passed, false, 'weak held-out results must not be reported as learned improvement');

    // --- Test 5: Tournament uses smaller finals instead of cloning finalists ---
    const originalSimRun = SimBoard.prototype.run;
    const matchSizes = [];
    const matchSetups = [];
    SimBoard.prototype.run = async function() {
        matchSizes.push(this.contestants.length);
        matchSetups.push(this.options);
        const results = this.contestants.map((genotype, playerIndex) => ({ playerIndex, netWorth: 1000, bankrupt: false }));
        if (this.options.playerCount > this.contestants.length) {
            results.push({ playerIndex: this.options.playerCount - 1, netWorth: 2000, bankrupt: false });
        }
        return results.sort((a, b) => b.netWorth - a.netWorth);
    };
    try {
        const bracketPopulation = new Population(8, 126, 9);
        bracketPopulation.initialize();
        const bracketTournament = new Tournament(bracketPopulation, 5, null, {
            edition: 'NYC',
            playerCount: 3
        });
        const bracketResult = await bracketTournament.run();
        assert.ok(bracketResult.champion, 'tournament should produce a real-genome champion even when filler seats rank first');
        assert.deepStrictEqual(matchSizes, [3, 3, 2, 3], 'every tournament match should use the selected three-player setup');
        assert.ok(matchSetups.every(setup => setup.edition === 'NYC' && setup.playerCount === 3), 'all rounds should share one edition and player count');
    } finally {
        SimBoard.prototype.run = originalSimRun;
    }
    console.log('✔ Test 5: Tournament finalist bracket verified without clones.');

    // --- Test 6: Trainer evolves and rejects saved legacy generations ---
    const storedData = {};
    const storageReads = [];
    const memoryStorage = {
        get length() { return Object.keys(storedData).length; },
        key(index) { return Object.keys(storedData)[index] || null; },
        getItem(key) { storageReads.push(key); return storedData[key] || null; },
        setItem(key, value) { storedData[key] = value; }
    };
    let evaluatedGenerations = 0;
    const fixedTournamentFactory = population => ({
        async run() {
            evaluatedGenerations++;
            const members = population.species.flatMap(species => species.members);
            members.forEach((genotype, index) => { genotype.fitness = index + evaluatedGenerations * 10; });
            const champion = members[members.length - 1];
            return { champion, topScore: champion.fitness };
        }
    });
    let trainerValidationCalls = 0;
    const trainingPolicyEvaluator = {
        async evaluate(genome, progress) {
            trainerValidationCalls++;
            progress({ gamesCompleted: 6, gamesRequested: 6 });
            return { games: 6, improvementPercentagePoints: 7, lower95ConfidenceBound: 6, requiredImprovement: 5, passed: true };
        }
    };
    const defaultTrainer = new Gen6Trainer({ storage: null, policyEvaluator: trainingPolicyEvaluator });
    assert.strictEqual(defaultTrainer.population.size, 32, 'default training should use a larger NEAT population');
    assert.strictEqual(defaultTrainer.turnsPerMatch, 60, 'default training matches should use a bounded evaluation length');
    const trainer = Gen6Trainer.loadOrCreate({
        storage: memoryStorage,
        populationSize: 8,
        tournamentFactory: fixedTournamentFactory,
        policyEvaluator: trainingPolicyEvaluator
    });
    const progressUpdates = [];
    const trainingResult = await trainer.train(2, update => progressUpdates.push(update));
    assert.strictEqual(evaluatedGenerations, 2, 'each requested generation should be evaluated');
    assert.strictEqual(trainingResult.population.generation, 2, 'each evaluation should be followed by an epoch');
    assert.strictEqual(trainingResult.population.size, 8, 'evolution should preserve population size');
    assert.strictEqual(trainingResult.population.inputCount, 147, 'new training should use the context-aware schema');
    assert.strictEqual(progressUpdates.length, 3, 'training should report both generations and held-out validation');
    assert.strictEqual(trainerValidationCalls, 1, 'training should run one held-out evaluation after evolution');
    assert.strictEqual(trainingResult.validation.passed, true, 'trainer should return the held-out quality report');
    assert.strictEqual(progressUpdates[2].phase, 'validation', 'trainer should report held-out evaluation progress');
    await assert.rejects(trainer.train(Gen6Trainer.MAX_GENERATIONS_PER_RUN + 1), /between 1 and/);

    const unapprovedData = {};
    const unapprovedStorage = {
        get length() { return Object.keys(unapprovedData).length; },
        key(index) { return Object.keys(unapprovedData)[index] || null; },
        getItem(key) { return unapprovedData[key] || null; },
        setItem(key, value) { unapprovedData[key] = value; }
    };
    const unapprovedTrainer = Gen6Trainer.loadOrCreate({
        storage: unapprovedStorage,
        populationSize: 8,
        tournamentFactory: fixedTournamentFactory,
        policyEvaluator: { async evaluate() { return { passed: false, improvementPercentagePoints: -10, lower95ConfidenceBound: -15 }; } }
    });
    const unapprovedResult = await unapprovedTrainer.train(1);
    assert.strictEqual(unapprovedResult.validation.passed, false);
    assert.strictEqual(unapprovedData.gen6Champion, undefined, 'a policy failing held-out validation must not become playable');
    assert.ok(unapprovedData.gen6Population, 'failed candidates should still preserve training progress');

    const readsBeforeReject = storageReads.length;
    assert.throws(() => Gen6Trainer.loadOrCreate({ storage: memoryStorage }), /Unsupported legacy Gen6 localStorage data/);
    assert.throws(() => Gen6Trainer.getStoredChampion(memoryStorage), /Unsupported legacy Gen6 localStorage data/);
    assert.strictEqual(storageReads.length, readsBeforeReject, 'legacy storage must be rejected before reading any values');
    const legacyPopulation = new Population(4, 126, 9);
    legacyPopulation.initialize();
    assert.throws(() => Population.loadFromString(legacyPopulation.saveToString()), /Unsupported legacy Gen6 NEAT data/);
    console.log('✔ Test 6: Trainer lifecycle and legacy persistence rejection verified.');

    console.log('\nAll Gen6 tests passed successfully!');
}

runTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
