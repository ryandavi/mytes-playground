# Socket Schema & Affordance `when` DSL — Frozen Spec

**Status:** FROZEN 2026-07-05 (Fable). Implementation tasks T6/T6b/T7 implement exactly this; deviations need Fable sign-off.
**Companion code contracts:** `js/Engine/AttachmentSystem.js` (SocketSet/AttachmentSystem skeletons), `js/Engine/EntityRelationships.js`.
**Context:** docs/ARCHITECTURE_AUDIT_2026-07.md §Attachment and Socket Architecture, §Capability and Interaction Model.

Pre-release: migrations are **destructive**. T6b deletes `actionConfigs.use_surface_slot.slots` / `slotsByFacing` / `mytePosition` / `myteFacing` after conversion — no dual-read.

---

## 1. `sockets` — object-level socket definitions (types.json / species json)

```jsonc
"sockets": {
    "<socketId>": {
        "kind": "seat",              // REQUIRED: seat | sleep | hold | surface | mount
        "position": {                // REQUIRED for seat/sleep/hold/mount (point sockets)
            "xFactor": 0.35,         //   fraction of owner size (0..1), OR
            "yFactor": 0.5,
            "offsetX": 0,            //   optional px fine-tune added after factors
            "offsetY": 0
        },
        "area": {                    // REQUIRED for surface kind INSTEAD of position
            "xFactor": [0.1, 0.9],   //   [min,max] fractions defining the rect
            "yFactor": [0.05, 0.25]
        },
        "facing": "S",               // facing applied to occupant when inheritFacing (default: owner facing)
        "accepts": ["myte"],         // entity kinds or capability tags; default ["myte"]
        "capacity": 1,               // default 1; surface kinds may be >1
        "zBias": 2,                  // occupant sortY = owner sortY + zBias; default 2
        "collision": "disabled",     // occupant collision while attached: disabled | inherit; default disabled
        "approach": { ... },         // EXISTING approachConfig shape, unchanged (allowedSides, preferredSide, gap, align, alignTo, myteAlignTo)
        "entryGap": 10,              // optional, as today
        "exit": {                    // optional dismount placement; default = entry side reversal (today's returnToEntry behavior)
            "returnToEntry": true,
            "gap": 14,
            "searchRadius": 20
        },
        "byFacing": {                // per-owner-facing overrides, merged over the base (same rule as directionConfigs)
            "E": { "position": { "xFactor": 0.5, "yFactor": 0.35 }, "facing": "E", "approach": { ... } }
        }
    }
}
```

Rules:

- **Socket ids are stable and unique per object type.** Occupancy, persistence, and AI selection key on `(entityId, socketId)`.
- `byFacing` replaces today's `slotsByFacing` inversion: instead of listing all slots per facing, each socket declares its per-facing variant. A socket absent for a facing (e.g. `"byFacing": { "E": null }`) does not exist while the owner faces E.
- Choreography stays in `actionConfigs`: durations, stat `effects`, `benefit`, `randomDuration`, `settleDuration`, `dismountDuration`, bob params remain under `actionConfigs.use_surface_slot` (and future action ids). Actions reference sockets by kind: `use_surface_slot` targets `kind: seat|sleep` sockets. **Position/occupancy data lives only in `sockets`.**
- Myte-side anchors (`spatial.anchors["carry.item"]`, `mouth.item`, future `accessory.head`) are re-expressed as `hold`-kind sockets on the species definition in T6; the anchor math (`itemAnchorX/Y`) maps to the attachment's child-alignment and stays data-compatible.

## 2. Worked example — COUCH conversion

Today (`data/map-objects/types.json` COUCH): `actionConfigs.use_surface_slot.slotsByFacing.{S,N,E,W}` × `{left_seat/right_seat | top_seat/bottom_seat}`, each with `restPosition`, `restFacing`, `approachConfig`.

After T6b:

```jsonc
"COUCH": {
    "category": "static",
    "physics": { "collision": true },
    "draggable": true, "snapToGrid": true,
    "majorActionId": ["use_surface_slot"],
    "capabilities": { "sittable": true },
    "ai": { "affordances": [ { "actionId": "use_surface_slot", "purpose": "rest" } ] },

    "sockets": {
        "seat_a": {
            "kind": "seat",
            "position": { "xFactor": 0.35, "yFactor": 0.5 },
            "facing": "S",
            "approach": { "allowedSides": ["bottom"], "preferredSide": "bottom", "gap": 10,
                          "align": "left-edge", "alignTo": "collider", "myteAlignTo": "collider" },
            "byFacing": {
                "N": { "facing": "N", "approach": { "allowedSides": ["top"], "preferredSide": "top", "gap": 10, "align": "left-edge", "alignTo": "collider", "myteAlignTo": "collider" } },
                "E": { "position": { "xFactor": 0.5, "yFactor": 0.35 }, "facing": "E",
                        "approach": { "allowedSides": ["right"], "preferredSide": "right", "gap": 10, "align": "top-edge", "alignTo": "collider", "myteAlignTo": "collider" } },
                "W": { "position": { "xFactor": 0.5, "yFactor": 0.35 }, "facing": "W",
                        "approach": { "allowedSides": ["left"], "preferredSide": "left", "gap": 10, "align": "top-edge", "alignTo": "collider", "myteAlignTo": "collider" } }
            }
        },
        "seat_b": { /* mirror of seat_a: xFactor 0.65 / yFactor 0.65, align right-edge/bottom-edge */ }
    },

    "actionConfigs": {
        "use_surface_slot": {
            "label": "Sit", "description": "Sit on the couch for a bit",
            "benefit": "comfort", "randomDuration": true,
            "minDuration": 12000, "maxDuration": 28000,
            "effects": { "energy": 8, "health": 2, "comfort": 18, "fun": 12 },
            "settleDuration": 220, "dismountDuration": 200,
            "bobHeight": 1.5, "bobSpeed": 0.08
        }
    }
}
```

Deleted keys in the conversion: `slotsByFacing`, `mytePosition`, `myteFacing`, `exclusive` (capacity expresses it), `entryGap`/`exitGap`/`exitSearchRadius`/`returnToEntry` (move into socket `entryGap`/`exit`), `stuckCompletionDistance`/`maxFinalAdjustmentDistance` (SurfaceSlotAction internals → `SiteConfig.actions.surfaceSlot`).

T6b acceptance: a conversion script proves losslessness — for every type × facing, `SocketSet.resolveWorldPosition(socketId)` equals the old `resolveTargetSlotPosition(slot.restPosition)` result to the pixel, and available-socket counts match old `getAvailableActionSlots` counts.

## 3. Affordance `when` DSL — exhaustive grammar (T7)

An `ai.affordances[]` entry: `{ "actionId", "purpose", "chain?", "when?" }`. `when` is a single object; **all present clauses must pass (AND)**. Exactly these clauses exist — adding a clause type requires updating this spec, the interpreter, and `validate-content-data.js`:

| Clause | Value | Passes when |
|---|---|---|
| `capability` | string | `this.capabilities[value]` is truthy |
| `isEnabled` | boolean | `this.isEnabled()` exists and equals value |
| `isActiveMusicSource` | boolean | `this.isActiveMusicSource()` equals value |
| `method` | string | `this[value]()` exists and returns truthy (bridges subclass predicates: `isReadyToHarvest`, `canWater`) |
| `notMethod` | string | method absent or returns falsy |
| `actorNotCarrying` | true | `!actor?.queue?.isCarrying?.()` |
| `socketAvailable` | socket kind string | `this.sockets.availableFor(actor, kind).length > 0` |
| `contextGate` | `{ "path": "drives.eatDrive", "op": "gt"\|"lt"\|"gte"\|"lte", "value": n }` | resolved context number passes the comparison (replaces the inline curiosity/fun/novelty thresholds) |
| `novelty` | `{ "op", "value" }` | `context.getNoveltyScore(this)` passes |

Occupancy exclusion (today's trailing `isActionOccupied` filter) remains a built-in interpreter step, not a clause.

## 4. Decisions log (closes audit soft points)

| Question | Decision |
|---|---|
| ActionSlotLedger absorb vs wrap | **Absorbed** — SocketSet replaces it; ledger file deleted in T6 |
| `pendingPickup` | **Stays a flag** on the object; not a relation |
| Occupancy key | `(entityId, socketId)`; cross-action exclusivity is automatic since sockets are physical |
| Semantic relation per socket kind | seat/sleep/surface → `occupying`; hold → `carrying`; mount → `riding` |
| Attachment update order | mytes → objects → `AttachmentSystem.update()` → `MapRenderer.flush` |
| Bob/idle motion | writes `attachment.localOffset`, never entity pos |
| WallRun id format | `wall_{mapId}_{x0}_{y0}_{axis}` (confirmed) |
| Legacy data keys | deleted at conversion, no dual-read (pre-release) |
