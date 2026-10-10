// Drive a policy planner with the same sequential action/result protocol as a controller.
async function executePlanner(iterator, game) {
    if (!iterator || typeof iterator.next !== 'function') return iterator;
    let result, step;
    while (!(step = iterator.next(result)).done) {
        if (!Array.isArray(step.value) || step.value.length !== 1) throw new Error('Expected one planned action.');
        const action = step.value[0];
        result = action.type === 'proposeTrade' ? await game.trade(action.offer) : game[action.type](action.squareId);
    }
    return step.value;
}
module.exports = { executePlanner };
