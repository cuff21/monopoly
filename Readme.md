# monopoly

A JavaScript/HTML/CSS Monopoly implementation with full game play. Supports two-eight players. Remembers games that have been played and allows import/export of game history.

Play online at [https://cuff21.github.io/monopoly/](https://cuff21.github.io/monopoly/).

Includes generalised AI that picks decision parameters according to game history.

Games use the shared xoshiro128** seeded generator. Browser games and simulations
without an explicit seed receive fresh seeds. To replay a headless match, pass its
recorded `game.state.setup.seed` to `SimBoard` with the same setup and policies.
Worker retries retain the original seed. Seeds now produce different sequences
from the former linear congruential generator.

Gen6 tournament match seeds use the lower half of the 32-bit seed space;
validation uses the upper half, with fresh, distinct seeds for each evaluation.
`PolicyEvaluator({ seed: 123 })` can reproduce an evaluation in a new evaluator.
The generator is deterministic and is not cryptographically secure; numeric seeds
still have 32 bits of entropy. Run `node random.test.js` and
`node simulation.test.js` to check randomness integration and seeded replay.
