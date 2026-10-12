# Changelog

Every version is tagged in git (`vX.Y.Z`). To restore one, check out its tag and commit it
as a new version; history is never rewritten.

## v0.3.0 (2026-10-11 23:40 ET): demo catalog, rules and the real-names guard

- Lantern Lane Home, the made-up store: 59 products (mattresses in five brands and
  several sizes, foundations, adjustable bases, pillows, protectors, sheets, protection
  plans). Kestrel is the price-locked premium line; it sits in the middle tier at list
  price, so its margin has to come from the rest of the bundle. Some lines have floor
  models and clearance, each with its own price and cost.
- Default rules: three tiers (top 50%+ pays 15% of gross, middle 40–49.99% pays 11%, low
  34–39.99% pays 7%), +2 points with an adjustable base, $45 delivery cost, four delivery
  tiers with minimums, three bundle deals, a made-up financing chart.
- Two stores and seven made-up reps.
- A guard test fails the build if a real retailer, brand, system or person's name
  appears in any file. It stores only fingerprints of the names.
- 91 tests.
- Restore this if: the catalog or default rules get changed in a way you don't like.

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
