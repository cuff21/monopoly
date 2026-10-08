# Structured Board Migration: Implementation Plan

## Objective

Migrate the game from positional square indices and shared/global square state to validated edition Boards, per-game square state keyed by stable IDs, and stable player IDs. Convert Classic and NYC and migrate game rules, AIs, simulations, workers, and UI to those APIs while preserving gameplay and layouts. Integrate Gen6 as an edition-agnostic policy over variable-length Board-contract boards, following the [Schema 1 specification](GEN6_INPUT_SCHEMA_INVENTORY.md).

This document is the cross-project migration roadmap: it owns phase ordering, Board/game/UI migration tasks, and project-level acceptance gates. The [Gen6 Policy Schema 1 Specification](GEN6_INPUT_SCHEMA_INVENTORY.md) owns the normative Gen6 policy contract and its required tests.

Gen6 compatibility changes and rejection tests must follow the [Schema 1 specification](GEN6_INPUT_SCHEMA_INVENTORY.md).

## Frozen Contracts

### Board and Edition Contract

- Use permanent edition IDs `Classic` and `NYC`; keep display labels separate. Each edition board has `editionId`, `startSquareId: go`, `squaresById`, `groupsById`, and base `rules` including positive integer `startSalary`, positive integer `houseTotal` and `hotelTotal`, and nonnegative integer `bailAmount`.
- Each square defines a stable `id`, `kind`, optional `groupId`, immutable rules/economics and behavior handlers, and presentation metadata. Each group defines a stable `groupId`, display name, presentation, rules, and member square IDs.
- IDs match `[a-z0-9]+(-[a-z0-9]+)*` and are unique per board. For the initial built-in conversion, normalize canonical square names by lowercasing, replacing each run of non-ASCII alphanumerics with `-`, and trimming edge hyphens; store each result as a literal separate from its label. Repeated card squares are `chance-south`, `chance-east`, `chance-north`, `community-chest-south`, `community-chest-west`, `community-chest-east`. Shared special IDs are `go`, `jail`, `free-parking`, `go-to-jail`, `city-tax`, `luxury-tax`. Labels may change independently of IDs.
- Store group labels separately from IDs. Classic group IDs, in order: `railroads`, `utilities`, `brown`, `light-blue`, `pink`, `orange`, `red`, `yellow`, `green`, `blue`. NYC: `railroads`, `utilities`, `dark-purple`, `light-blue`, `purple`, `orange`, `red`, `yellow`, `green`, `blue`. Normalize existing unique group names as above; labels and colors may change independently of IDs.
- Every square defines `nextId` and `previousId`. Built-in boards contain 40 squares; the validator accepts any positive count.
- Allowed kinds: `street`, `railroad`, `utility`, `tax`, `chance`, `community-chest`, `jail`, `go-to-jail`, `free-parking`, `go`. Only purchasable properties have a group. “Just visiting” is player state on `jail`, not a kind.
- Square economics use `rules.purchasePrice`, `rules.baseRent`, `rules.rentTiers`, `rules.mortgageValue`, `rules.houseCost`, and `rules.taxAmount`; `rules.taxPercentOfNetWorth` is optional and tax-only. Streets require purchase price, base rent, mortgage value, house cost, and five dollar-valued building rents (one through four houses, then hotel); tax fields are zero. Railroads require purchase price, mortgage value, and five dollar rent tiers by group ownership count one through five; base rent, house cost, and tax fields are zero. Utilities use the same required fields, but their five rent tiers are dice multipliers, not dollars; base rent, house cost, and tax fields are zero. Tax squares require `taxAmount`, may define `taxPercentOfNetWorth`, and have zero property economics. All economic fields on other kinds are zero/empty. `taxPercentOfNetWorth`, when present, is in `(0,1]`. GO salary comes from `board.rules.startSalary`. Group rent rules must agree with these square schedules and member IDs.
- Use presentation coordinates `x`, `y` (percentages), and `rotationDegrees`; preserve current placements. Layout order is presentation only; game and DOM actions resolve stable IDs.
- Board contracts and edition data are unversioned; validate every locally built board against the Board contract.
- Keep decks as ordered arrays and shuffle per game. Card handlers receive explicit game context and use square IDs or traversal predicates; execute the drawn effect and encode its result in the next game state.
- Require registry methods `buildBoard()`, `buildCommunityChestCards()`, and `buildChanceCards()`. Workers receive edition ID and game setup, then construct the edition locally; function-bearing boards remain local to their Game.
- Each `buildBoard()` returns a new complete board. Validate and discard one board during registration. For each Game, build and validate a fresh board, clone its base rules into that Game's private Board, apply any match-specific rule overrides to `Game.state.board.rules`, validate the effective rules, then freeze the Board before play begins. Board instances and mutable game state are isolated per Game; overrides never mutate the registered edition or persist to another Game. Function internals remain callable.

### Game State and Identity Contract

- Each Game owns one immutable board reference and a mutable `squareStateById`; initialize `ownerId`, `mortgage`, `house`, `hotel`, `landcount` to `null`, `false`, `0`, `0`, `0`.
- Assign each player immutable `playerId: player-<original-one-based-seat>` at creation. That original seat ordinal remains stable after elimination; roster indices represent ordered active seats.
- `ownerId: null` means unowned or bank-held. `BANK_ID: bank` is reserved for creditor/debt references; square owners are null or active player IDs. Return bank-held property to the unowned pool with `ownerId: null`.
- `Game.state` owns players, active seats, board, square state, deck order, and match rules; game state is scoped to its owning Game. `Game.state.board.rules` contains the effective rules for that match, starting from the edition's base rules and allowing validated setup-time overrides. It is frozen before play and is not persisted between Games.
- Board APIs take the board explicitly and are pure: `getSquare`, `getGroup`, `getGroupSquareIds`, `walk`, `findNext`. `walk` accepts signed integer steps, wraps at either end, and returns the input ID for zero. `findNext` starts after the origin, searches forward one circuit, and returns `null` if unmatched. Unknown IDs, non-integer steps, and missing groups throw `RangeError`.
- Game-state APIs take `Game.state`: `getSquareState`, `setSquareOwner`, `getPlayerById`, `getPlayerAtSeat`. Unknown square/player IDs throw `RangeError`; owners must be `null` or an active `playerId`. Transfer or clear property before bankruptcy removes a player.
- Movement returns destination ID, ordered traversed IDs, and `crossedStart`. Salary is paid once on forward crossing or landing on `go`; backward movement does not pay salary. A direct card advance pays only when explicitly specified. Nearest-square movement searches forward and pays only if it crosses `go`.
- Landing/card handlers receive `{game, state, playerId, squareId, ui}` and use game/state APIs plus semantic UI methods. UI methods stay outside core rules.

## Ordered Implementation Steps

### Phase 0: Prerequisites and Contract Tests

1. Define deterministic Classic/NYC test fixtures from the frozen rules for movement, Start salary, card destinations, taxes, rent, economics, auctions, and bankruptcy ownership. Fixtures state expected outcomes directly from those rules. **Done when:** fixtures assert the required behavior and can run in the relevant tests.
2. Before board-state work, remove the `Game` singleton, ambient `game`/`player`/`turn`/state reads, and async-local accessors from game modules. Pass `Game`/`Game.state` through actions and UI notifications; keep browser UI ownership per Game. **Done when:** overlapping Classic/NYC runs route all mutations and notifications to the owning Game, previously passing suites remain passing, and existing unrelated failures are recorded rather than folded into this migration.
3. Add compatibility and rejection tests for unsupported Gen6 inputs as specified in the [Schema 1 contract](GEN6_INPUT_SCHEMA_INVENTORY.md). **Done when:** rejection behavior is covered before replacement runtime work begins.

### Phase 1: Freeze and Record the Contracts

4. Freeze and test the Schema 1 contract in the [Gen6 specification](GEN6_INPUT_SCHEMA_INVENTORY.md). Phase 6 starts only after its required contract tests pass.
5. Before edition changes, create canonical Classic/NYC square/group ID catalogs from current definitions using the frozen normalization and repeated-card names. Phase 3 uses these permanent Board-contract IDs; Gen6 does not use them. **Done when:** tests prove the catalogs are complete, unique, and match the frozen normalization.
6. Document the Board/state contracts, callback signature, player/bank identities, movement rules, and exact shared APIs in core modules and the registry contract. **Done when:** a contract test imports the APIs and verifies errors/returns.

### Phase 2: Build the Board and State Boundary

7. In `js/core/board.js`, replace `Square.applyGroupDefinitions` and numeric groups with Board/Square/Group construction from explicit IDs. Add `getSquare`, `getGroup`, `getGroupSquareIds`, `walk`, and `findNext`. **Done when:** tests cover lookups/errors, zero/positive/negative/multi-lap walking, and one-lap forward predicate search.
8. Add `validateBoard` in `js/core/board.js`. Reject missing/duplicate/malformed IDs, invalid edition metadata, missing start, nonreciprocal links, disconnected/branching traversal, cycles omitting squares, invalid group references, duplicate/missing group members, unknown kinds, missing required economics/presentation, and invalid coordinates. Enforce the field-by-kind economics and rent-tier contract above, zero unused economics, and consistent group membership/rules; utility rent tiers are dice multipliers, while all other monetary economics are finite nonnegative integer dollars. Require finite `x`/`y` percentages in `[0,100]` and finite `rotationDegrees`. Validate optional `taxPercentOfNetWorth` (tax squares only, in `(0,1]`). Identify edition, square/group ID, and field/invariant in errors. **Done when:** one positive and one negative fixture per validation rule pass; errors identify the bad edition and ID.
9. In the Game state module, initialize independent `squareStateById` and implement `getSquareState`, `setSquareOwner`, `getPlayerById`, `getPlayerAtSeat`. Keep each player's original seat ordinal in `playerId` through elimination. Use `ownerId: null` and creditor-only `BANK_ID: bank`. **Done when:** two Games from one edition have isolated state, ownership, elimination, and bank transfers.
10. Require `buildBoard()` and both deck builders in the edition registry; remove `buildGroups()`/`buildSquares()`. Validate and discard a fresh board at registration. For every Game, build and validate another board, copy its base rules, apply and validate match overrides on the Game-owned board, then freeze it and create fresh state/deck copies. **Done when:** tests reject legacy-only editions, validate overrides, prove overrides do not leak between Games, and create isolated headless Classic/NYC Games.

### Phase 3: Convert Built-in Editions and Cards

11. Convert Classic to a 40-square `buildBoard()` using the specified IDs/groups. Preserve all rents, prices, mortgage/build/tax values, rent tiers, group rules, deck order, and coordinates. Put display names, labels, token images, and tooltips in presentation fields only. **Done when:** the validated board has 40 squares, and Classic fixtures pass.
12. Convert NYC to the same contract with specified IDs/groups. Preserve property economics, City Tax options (expressed as `taxAmount` 200 plus `taxPercentOfNetWorth` 0.10), $75 Luxury Tax, card order/effects, presentation, and coordinates. **Done when:** the validated 40-square board and NYC fixtures pass.
13. Make every card handler accept explicit game context. Replace numeric `advance` destinations with IDs; use `findNext` by kind/group for nearest railroad/utility; route payment, jail, repairs, and transfers through Game APIs. Keep ordered decks and shuffle per-game copies. **Done when:** handlers use no global player/game/square or numeric destination, and deterministic card fixtures match.
14. Keep Board contracts and edition data unversioned as defined above. Validate each fresh edition board, apply any match-specific overrides to its Game-owned `board.rules`, validate the effective rules, then recursively freeze that board. Worker payloads contain only edition ID, rule overrides, roster/setup, and seed; board rules resist mutation after match setup while handlers remain callable. **Done when:** effective board rules resist mutation during play, overrides remain isolated to one Game, and worker payloads contain only setup data.

### Phase 4: Migrate Game Rules by Domain

15. Use `player.squareId` and `walk` for movement/turn flow; return traversed IDs and `crossedStart`. Pay salary once on forward crossing/landing and on direct card advances only when specified. Resolve jail/go-to-jail by kind/ID. **Done when:** fixtures cover forward/backward, multiple laps, exact/crossed Start, and salary behavior.
16. Use square/group rules and `squareStateById` for rent/deeds. Check monopolies/ownership by group member IDs and use street, railroad, and utility schedules. **Done when:** Classic/NYC fixtures match base, monopoly, building, railroad-count, utility-dice, and mortgaged cases.
17. Migrate buy/mortgage/unmortgage/build/sell to square IDs and per-game state. Preserve costs, interest, even-building, and 32-house/12-hotel limits. Reject unknown IDs/illegal transitions without partial mutation. **Done when:** tests cover affordability, supply, even building, mortgage group restrictions, and rollback.
18. Carry square IDs throughout auctions; call AI hooks with `(squareId, currentBid)`. Validate ownership, current bid, cash, and auction rules. **Done when:** headless/browser tests award the correct square, ask every active player, and prove invalid bids neither stall nor mutate state.
19. Replace trade bitmaps with square-ID transfers and stable player IDs. Preserve money/jail-card behavior; update trade UI and both AI interfaces. **Done when:** tests cover single/multiple transfers, reverse/counter offers, invalid IDs, and no unrelated transfers.
20. Migrate bankruptcy, liquidation, creditor payment, elimination, and ownership to `playerId`. Transfer to player creditors by ID; clear to `ownerId: null` for bank creditors; use `BANK_ID` only for bank debt. Transfer all assets before removing an active player. **Done when:** tests cover bank/player creditors, returned-property auction, seat shifts, and unchanged remaining-player ownership.

### Phase 5: Migrate AI, Simulation, and UI Consumers

21. Give Gen5/StrategicAI the explicit Game decision view; use ID/state APIs for valuation, group completion, auctions, building, trades, and debt. Preserve roster order. **Done when:** decision fixtures pass for both editions and static search finds no global `square[]` or numeric groups in these modules.
22. Pass edition ID/setup through match runner, tournament, direct simulation, and workers; construct boards inside each Game/worker. Keep seeds/rules identical in direct and worker runs. **Done when:** deterministic fixtures match setup, edition, active seats, rules, and outcomes across both editions.
23. Use `data-square-id`, `data-group-id`, and `playerId` in rendering/actions. Resolve clicks, hover/deeds, tokens, trade/property panels, and animations by stable IDs; render using preserved coordinates. **Done when:** UI tests prove unique actionable IDs, correct action targets, and specified Classic/NYC layouts.
24. Load core Board/State APIs before editions in `index.html`, script manifests, page loader, and worker loader; update `styles.css` only where ID-based rendering requires it. Remove obsolete square/group globals and dependencies after migration. **Done when:** browser, Node, and worker startup load both editions without `square[]`/`groups[]` globals.

### Phase 6: Implement Gen6 Schema 1 and Persistence

25. Implement the Gen6 policy runtime and game-decision integration against the [Schema 1 contract](GEN6_INPUT_SCHEMA_INVENTORY.md); remove legacy runtime paths only after replacement call paths are active. **Done when:** contract tests pass and production no longer imports `neat/`.
26. Integrate deterministic training, league evaluation, and the Board Evaluation Set with the shared simulation and worker runtime. Preserve progress reporting, cancellation, and checkpointing between complete updates. **Done when:** contract coverage passes and direct/worker setup parity and lifecycle behavior are verified.
27. Integrate policy and resumable-state persistence. **Done when:** save/reload validation preserves deterministic inference and the next seeded update, with failures surfaced rather than reported as successful checkpoints.

### Phase 7: Cutover and Acceptance

28. Remove numeric runtime board interfaces after consumers use IDs. Retain numbers only for seats, ordered decks, feature/parameter tensor offsets, and presentation coordinates; tile observations remain variable-length and have no absolute slots. **Done when:** search finds no square-array indexing, position arithmetic/comparison, numeric card destinations/groups, positional DOM IDs, or mutable shared-board state; list allowed numeric uses here.
29. Run these seven suites separately: `ai-gen5.test.js`, `ai-gen6.test.js`, `ai-setup-registry.test.js`, `ai-strategic.test.js`, `game-ui.test.js`, `setup-screen.test.js`, and `simulation.test.js`. Smoke-test browser setup/play for Classic/NYC, AI turns, cards, auction, trade, bankruptcy, and Gen6 training/save/load through the worker runtime. Verify worker-slot timeout recovery and single cleanup of an injected worker pool; document unrelated pre-existing failures with evidence. **Done when:** suites and flows pass apart from evidenced unrelated failures and integration lifecycle behavior is verified.

## Acceptance Gates

1. Board validation and lookup/traversal APIs pass positive and negative contract tests.
2. Classic/NYC movement, cards, taxes, rent, economics, and layouts satisfy the frozen contracts.
3. Match state is isolated; player/bank ownership and creditor identities survive liquidation and seat shifts.
4. AIs, UI, direct simulation, and workers use IDs/explicit context; no numeric runtime board interface remains.
5. Gen6 integration satisfies the authoritative [Schema 1 specification](GEN6_INPUT_SCHEMA_INVENTORY.md).
6. Migration-specific lifecycle behavior, including worker recovery, cancellation/checkpointing, and direct/worker parity, is verified.
7. Suites and browser smoke checks pass; unrelated pre-existing failures are evidenced and documented, with no unrelated fixes mixed into this work.