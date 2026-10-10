(function(global) {
    'use strict';

    var SimulationAdapters = global.SimulationAdapters ||
        (typeof module !== 'undefined' && module.exports ? require('../../simulation/ai-adapter-registry') : null);
    var Gen5AI = global.Gen5AI;

    if (typeof module !== 'undefined' && module.exports) {
        if (!Gen5AI) {
            [
                'probability', 'game-analytics', 'valuation', 'liquidity', 'building',
                'debt-manager', 'trade-memory', 'trade-evaluation', 'auction',
                'parameter-generator', 'index'
            ].forEach(function(name) { require('./' + name); });
        }
        Gen5AI = global.Gen5AI;
    }

    var adapter = {
        kind: 'gen5',
        supports: function(contestant) {
            return !!contestant && ((contestant.kind === 'gen5') ||
                (contestant.kind === 'baseline' && contestant.ai === 'gen5'));
        },
        createPlayerAI: function(contestant, player) {
            var params = contestant.params ? Object.assign({}, contestant.params) :
                global.AIGen5.ParameterGenerator.generate({
                    random: player.game.state.random,
                    history: contestant.history || []
                });
            return new Gen5AI(player, { name: contestant.profile || 'Tactician' }, params);
        },
        serialize: function(contestant) {
            var serialized = { kind: 'baseline', ai: 'gen5', profile: contestant.profile || 'Tactician' };
            if (contestant.params) serialized.params = Object.assign({}, contestant.params);
            if (contestant.history) serialized.history = JSON.parse(JSON.stringify(contestant.history));
            return serialized;
        }
    };

    SimulationAdapters.register(adapter);
    global.Gen5SimulationAdapter = adapter;
    if (typeof module !== 'undefined' && module.exports) module.exports = adapter;
})(typeof window !== 'undefined' ? window : globalThis);
