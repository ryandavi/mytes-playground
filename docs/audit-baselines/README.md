# Audit Baselines

Behavior recordings that make refactor acceptance mechanical (see `docs/ARCHITECTURE_AUDIT_2026-07.md`, Fable pre-delegation checklist item 2).

**Workflow:** before a migration task starts, boot the game, open DevTools, and record with `window.__audit` (source: `js/UI/Debug/AuditHarness.js`). Commit the JSON here. After the migration, record again and diff — **zero diff = accepted** (candidate streams: compare decision/candidate structure, not timestamps).

| File | Produced by | Protects task |
|---|---|---|
| `depth-<map>.json` | `__audit.download('depth-<map>', __audit.dumpDepth())` | T2 (depth caching/dedupe) |
| `affordances-<map>.json` | `__audit.download('affordances-<map>', __audit.dumpAffordances())` | T7 (capability/affordance data migration) |
| `candidates-<scenario>.json` | `recordCandidates()` → roam → `stop()` → `download` | T4 (WorldQuery migration — structural comparison only; the stream is stochastic, so compare which candidate builders fire and their score formulas via a fixed-position scenario, not exact scores) |

Record on **Outside** and **House** at minimum. Re-record baselines whenever `data/` content intentionally changes (note the reason in the commit message so a data change isn't mistaken for a regression).
