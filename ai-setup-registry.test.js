const assert = require('assert');
const AISetupRegistry = require('./js/application/ai-setup-registry');

require('./js/ai/parameter-generator');
require('./js/ai/ai-genetic');
require('./js/ai/ai-strategic');
require('./js/ai/ai-gen5/simulation-adapter');
require('./js/ai/ai-gen6/simulation-adapter');

assert.deepStrictEqual(AISetupRegistry.list().map(entry => entry.id), ['3', '4', '5', '6']);
assert.strictEqual(AISetupRegistry.getDefaultId(), '6');
assert.deepStrictEqual(AISetupRegistry.getProfiles('4'), ['Aggressive', 'Balanced', 'Defensive', 'Opportunist']);
assert.ok(AISetupRegistry.getProfiles('5').length > 0);
assert.strictEqual(typeof AISetupRegistry.get('3').createPlayer, 'function');
assert.strictEqual(AISetupRegistry.get('3').trackResults, true);
console.log('Selectable AI modules register setup factories, profiles, and the default model.');