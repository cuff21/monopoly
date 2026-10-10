'use strict';

// Run complete, seeded games through the same Game used by browser play.
const assert = require('node:assert/strict');
const { SimBoard } = require('../js/simulation/match-runner');
require('../js/ai/ai-gen5/simulation-adapter');
const adapter = global.SimulationAdapters.get('gen5');
const originalCreate = adapter.createPlayerAI;
const originalLog = console.log;
const profiles = ['Tactician', 'Sentinel', 'Vulture', 'Gambler'];
const option = (name, fallback) => {
    const argument = process.argv.find(arg => arg.startsWith('--' + name + '='));
    const value = argument ? Number(argument.split('=')[1]) : fallback;
    assert.ok(Number.isInteger(value) && value > 0, name + ' must be a positive integer');
    return value;
};
const maxTurns = option('turns', 600);
const matches = [
    ['Classic', 719, 2], ['Classic', 12345, 3], ['Classic', 54321, 4],
    ['NYC', 719, 2], ['NYC', 12345, 3], ['NYC', 54321, 4]
];

async function run() {
    for (const [edition, seed, playerCount] of matches.slice(0, option('games', matches.length))) {
        let game, reportedTurn = 0, invalidActions = 0;
        const recentLogs = [], counts = {};
        console.log = (...args) => {
            recentLogs.push(args.join(' '));
            if (recentLogs.length > 15) recentLogs.shift();
        };
        adapter.createPlayerAI = function(contestant, player) {
            if (!game) {
                game = player.game;
                const request = game.requestDecision;
                game.requestDecision = function(kind, ...args) {
                    counts[kind] = (counts[kind] || 0) + 1;
                    if (game.turnCount >= reportedTurn + 100) {
                        reportedTurn = game.turnCount;
                        originalLog(JSON.stringify({ edition, seed, turns: reportedTurn,
                            remainingPlayers: game.state.pcount, status: 'running' }));
                    }
                    return request.call(this, kind, ...args);
                };
                const dispatch = game.dispatchPlayerAction;
                game.dispatchPlayerAction = async function(request, action) {
                    const result = await dispatch.call(this, request, action);
                    if (!result.ok && result.error) {
                        invalidActions++;
                        if (invalidActions <= 5) originalLog(JSON.stringify({ edition, seed,
                            turn: game.turnCount, kind: request.kind, action, error: result.error }));
                        assert.ok(invalidActions < 1000, 'repeated invalid policy actions stall the game');
                    }
                    return result;
                };
            }
            return originalCreate(contestant, player);
        };
        try {
            const contestants = Array.from({ length: playerCount }, (_, i) => ({
                kind: 'gen5', profile: profiles[i % profiles.length]
            }));
            const results = await new SimBoard(contestants, maxTurns, { edition, seed, playerCount }).run();
            await game.play();
            assert.equal(game.error, undefined);
            assert.equal(game._requests.size, 0, 'no outstanding player decision');
            assert.equal(Boolean(game.tradeState.pending), false, 'no unfinished negotiation');
            assert.equal(results.filter(p => !p.bankrupt).length, game.state.pcount);
            assert.ok(game.state.pcount === 1 || game.turnCount === maxTurns,
                'game must finish with a winner or reach the explicit safety limit');
            originalLog(JSON.stringify({ edition, seed, playerCount, turns: game.turnCount,
                winner: game.state.pcount === 1 ? results[0].playerIndex + 1 : null,
                remainingPlayers: game.state.pcount, decisions: counts, invalidActions,
                status: game.state.pcount === 1 ? 'winner' : 'turn-limit' }));
        } catch (error) {
            originalLog(JSON.stringify({ edition, seed, playerCount, turns: game && game.turnCount,
                status: 'failed', error: error.stack, recentLogs }));
            throw error;
        } finally {
            console.log = originalLog;
            adapter.createPlayerAI = originalCreate;
        }
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
