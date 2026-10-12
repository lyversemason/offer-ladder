# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and commit it
as a new version; history is never rewritten.

## v0.2.0 (2026-10-11 23:10 ET): the engine

- All the money math, with no screens yet (`src/engine/`): topline, gross dollars,
  margin, tier, commission on gross dollars, the adjustable-base attach bonus, delivery
  cost, floor-model and clearance costs, bundle deals, financing (adds or subtracts
  gross), and every rule (price-locked items, below cost, below the floor, delivery
  minimums, financing that isn't offered at that amount, unknown products).
- The discount formula finds the lowest price that holds a margin, rounded up to whole
  $10 and re-checked; the offer ladder (opening top-tier offer, middle-tier offers,
  final offer at the floor, never a lowball step); target mode (2–3 ways to reach a
  tier, plus floor-model, financing and full-price add-on levers).
- A check that rejects broken manager settings (tiers out of order, etc.).
- 82 tests, including 200 random deals checked for "meets the target, passes every rule,
  and $10 lower would not".
- Restore this if: a later engine change breaks the math.

## v0.1.0 (2026-10-11 20:40 ET): plan and repo

- PLAN.md: scope, Mason's decisions (name, SQL, financing, import, launch bar), the money
  math, made-up numbers, architecture, milestones.
- Restore this if: you want to restart from the plan alone.
