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

## 2026-08-03 doorway fixture

`follow-DoorTest-6mytes.json` closes the doorway criterion left open above, using the purpose-built `data/maps/DoorTest.tmx` fixture: two rooms joined by exactly one 96px-tall opening in a full-height wall, verified at runtime (the recording includes the walkable rows of the wall column, so a map edit that opened a second route would show up in the diff).

Two things this recording is careful about:

- **A literal one-cell (32px) door is impossible.** A Myte collider is 96x58, so 32px admits nobody. 96px is the narrowest opening that passes one Myte and refuses two abreast (which would need 116px).
- **"Single file" is not enforced by collision.** Mytes are deliberately non-blocking to each other (T3: `kind: 'myte'` never contributes to walkability), so colliders may overlap while passing through the gap. The meaningful property is *ordering along the trail*, recorded as `orderViolationSamples`.

Re-run with the scenario in the audit's 2026-08-03 Group A entry. Followers must start clustered within `trailReach` of the leader; a strung-out start puts the tail off-trail before any trail exists, and those Mytes correctly path to the trail once — a start-up artifact, not a follow regression.
