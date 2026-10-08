# Review Fix Plan

## Complete


## In Progress

- None. No queued item is currently being worked.

## Queued

Items are ordered by priority, with P1 highest.

- [ ] **P18: Normalized-rank metric contract:** Document the per-game candidate-versus-baseline score and aggregation. Specify whether the reported 95% lower bound is one-sided or the lower end of a two-sided interval, and test rank normalization, candidate-seat handling, and confidence-bound arithmetic with deterministic fixtures.
- [ ] **P20: Metric calibration controls:** Add repeated baseline-versus-baseline null comparisons and a positive-control comparison. Report results by seat, player count, edition, and rules combination; check for systematic bias and whether confidence-bound coverage matches its stated interpretation.
- [ ] **P21: Training-effect benchmark:** Across independently initialized ES runs, compare each initial mean policy with its trained champion on a locked held-out set using paired setups/seeds. Predeclare a meaningful learning effect, use a power analysis to choose evaluation size, and report paired effect estimates and confidence intervals.
- [ ] **P22: Independent promotion requirement:** Set the playable-champion performance threshold from an external gameplay requirement, separately from evidence that training improves over initialization.
- [ ] **P23: Promotion gate implementation:** Apply the agreed promotion requirement and retain ES optimizer state, candidate archive, and league progress when candidates fail; regression-test that failed candidates cannot replace the playable champion and passing candidates can.
## Completion Criteria

- Move work to Complete only after its stated acceptance criteria are verified.
- Keep In Progress limited to work actively underway; leave it empty otherwise.
- Keep Queued in priority order and split broad efforts when they can be verified independently.