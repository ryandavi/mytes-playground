# Audit Baselines

Behavior recordings that make refactor acceptance mechanical (see `docs/ARCHITECTURE_AUDIT_2026-07.md`, Fable pre-delegation checklist item 2).

**Workflow:** before a migration task starts, boot the game, open DevTools, and record with `window.__audit` (source: `js/UI/Debug/AuditHarness.js`). Commit the JSON here. After the migration, record again and diff — **zero diff = accepted** (candidate streams: compare decision/candidate structure, not timestamps).

| File | Produced by | Protects task |
|---|---|---|
| `depth-<map>.json` | `__audit.download('depth-<map>', __audit.dumpDepth())` | T2 (depth caching/dedupe) |
| `affordances-<map>.json` | `__audit.download('affordances-<map>', __audit.dumpAffordances())` | T7 (capability/affordance data migration) |
| `candidates-<scenario>.json` | `recordCandidates()` → roam → `stop()` → `download` | T4 (WorldQuery migration — structural comparison only; the stream is stochastic, so compare which candidate builders fire and their score formulas via a fixed-position scenario, not exact scores) |

Record on **Outside** and **House** at minimum. Re-record baselines whenever `data/` content intentionally changes (note the reason in the commit message so a data change isn't mistaken for a regression).

## 2026-07-10 live-browser recordings

Depth and affordance recordings for Outside, House, and FieldTest were captured from the current post-migration working tree using the project Playwright workflow. No pre-migration recordings existed, so these establish future reference points but do not constitute before/after zero-diff acceptance results. `autoplay-FieldTest-60s.json` is the clean 13-sample rerun after fixing the initial-map registry leak; `autoplay-FieldTest-5m.json` is the formal clean 61-sample/default-duration gate.

`follow-FieldTest-6mytes.json` records the temporary six-Myte shared-trail run. It proves ordered breadcrumb following with zero follower A* calls and clean relations/invariants, but is intentionally marked partial because FieldTest does not force traversal through its freestanding door.
