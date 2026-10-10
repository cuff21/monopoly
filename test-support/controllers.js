const Controllers = require('../js/application/player-controllers');
const Context = require('../js/core/game-state-context');
function registerFixtures(game) {
    (game.state.player || []).slice(1).forEach((player, index) => {
        if (!player) return;
        if (!player.playerId) Context.assignPlayerId(player, index + 1);
        const controller = new Controllers.AIController(player.AI || {});
        const decide = controller.decide.bind(controller);
        controller.decide = request => {
            if (request.kind === 'tax' && player.human && game.ui.chooseTax) return new Promise(resolve => {
                game.ui.chooseTax(request.options.fixedAmount, request.options.percentageAmount, amount => resolve({ actions: [{ type: 'tax', amount }], complete: true }));
            });
            return decide(request);
        };
        game.registerController(player.playerId, controller);
    });
    return game;
}
module.exports = { registerFixtures };
