# Myte Behavioral Systems — Implementation Spec

## How To Use This Document

This is an execution spec. Read the full document before implementing any phase. Implement phases in the order listed. Each phase must be complete and verified before the next begins.

Each phase contains:
- **Depends on** — phases that must be complete first
- **Files** — exact files to modify
- **Changes** — imperative instructions; do exactly this
- **Verify** — how to confirm the phase is correct

Do not implement anything in the **Future Considerations** section at the bottom.

---

## Architecture Reference

This is the target state after all phases complete. Use it as the source of truth when there is ambiguity.

### Layer 1 — Persistent Needs

Six needs drain continuously over time and are restored by specific actions, objects, or zones. All stored on `MyteStats`.

| Need | Drains from | Restored by | Does NOT affect |
|------|-------------|-------------|-----------------|
| `energy` | time + action exertion | rest, sleep, eating (+5% only) | hunger |
| `hunger` | time only (no exertion modifier) | eating actions, drinking | energy (eating gives +5% energy crossover only) |
| `fun` | time, idle actions, purposeful movement | play, explore, novelty, social actions | comfort directly |
| `social` | time, prolonged isolation | greet, show_affection, watch, talk, play_tag | fun directly |
| `comfort` | time, high-exertion actions, scary events | beds, flowers, being held, fountains, calming objects | environment |
| `environment` | time, nearby scary/noisy/cluttered objects | ambient light on, music on, cozy decor, calm zones | comfort |

**Critical distinction:**
- `comfort` = restored by direct physical/emotional interaction (touch, warmth, specific objects the Myte interacts with)
- `environment` = restored by the ambient quality of the surrounding space (lighting, music, decoration — things the Myte is near but does not interact with directly)

**Removed from the system:** `home` (emotional need), `lightNeed`, `musicNeed`, `boredom`, `enrichment`. None of these exist in the final system.

### Layer 2 — Traits

Slow-moving personality values set per species at creation. They do not drain. They are not meters. They change only through deliberate long-term mechanics outside this spec.

| Trait | Range | Effect |
|-------|-------|--------|
| `curiosity` | 0–1 | Scales `exploreDrive`; high = inspects and wanders more |
| `activity` | 0–1 | Scales `playDrive`; affects energy consumption rate |
| `sensitivity` | 0–1 | Scales how strongly need deficits pull all drives; high = reacts quickly to any deficit |
| `sociability` | 0–1 | Scales `socialDrive` specifically; adds a baseline social drive even when social need is full; low = tolerates isolation, social drive barely fires even when depleted |
| `boldness` | 0–1 | Modifies how fast confidence changes and sets a confidence floor; high = gains confidence quickly, loses it slowly, takes more risks at same confidence level; low = slow to rebuild, easily rattled |

`confidence` is **not** a trait. See Layer 2b.

### Trait Pole Labels

Each trait is a spectrum. Neither pole is inherently good or bad — both extremes have real drawbacks. Labels are used in the debug overlay and Myte profile UI.

| Trait | Low (0.0–0.25) | Mid (0.35–0.65) | High (0.75–1.0) |
|-------|----------------|-----------------|-----------------|
| `curiosity` | **Contented** — stays near familiar things, won't explore, predictable but dull | **Curious** | **Obsessive** — can't settle, burns through novelty, restless |
| `activity` | **Lethargic** — rarely initiates play, low energy cost but uninspiring | **Active** | **Frantic** — burns out fast, hard to calm down |
| `sensitivity` | **Stoic** — barely reacts to need deficits, stable but emotionally flat | **Balanced** | **Fragile** — reacts to every small deficit, high-maintenance |
| `sociability` | **Reclusive** — tolerates isolation without distress, does not seek others | **Friendly** | **Clingy** — distressed when alone, constantly needs social contact |
| `boldness` | **Timid** — confidence floor near zero, scared easily, avoids all risk | **Steady** | **Reckless** — confidence barely drops, takes risks even when it shouldn't |

**Label resolution:** A trait value of 0.0–0.25 = low label, 0.35–0.65 = mid label, 0.75–1.0 = high label. Values in the 0.25–0.35 and 0.65–0.75 bands show the adjacent label with no special treatment.

**Where labels appear:**
- Debug overlay: each trait bar shows the low label on the left end, high label on the right end
- Myte profile tooltip: shows the 1–2 most extreme trait labels as personality tags (e.g. "Reckless · Fragile")
- Species description flavor text may use these labels (UI concern — not part of this AI spec)

**Trait interaction notes:**
- `sensitivity` is a general amplifier — it affects all drives equally. `sociability` is specific to social behavior only.
- `boldness` governs confidence *dynamics* (rate of change, floor). Starting `confidence` (in species stats) is the current value at spawn. A bold species with low starting confidence recovers quickly; a timid species with high starting confidence crumbles slowly but doesn't bounce back.
- `curiosity` and `boldness` are independent: a curious-but-timid Myte explores eagerly but is easily scared by what it finds.

### Layer 2b — Confidence

A medium-term stat (0–1). No passive drain. Changes only via `notifyConfidenceEvent()`. Visible meter in debug UI. Starting value declared per species.

| Tier | Range | Candidate generation behavior |
|------|-------|-------------------------------|
| Low | < 0.35 | Skip risky/unfamiliar candidates; no portals, no chests, no strangers; prefer comfort/rest/familiar objects |
| Medium | 0.35–0.70 | Allow local inspect, nearby social with known Mytes, mild novelty |
| High | > 0.70 | All candidates available including portals, deep explore, strangers, risky interactions |

An action's `risk` field (0–5) gates whether it is generated: if `action.metadata.risk > confidence * 5`, skip that candidate.

### Layer 3 — Derived Drives

Computed each AI think tick. Never stored — always recalculated from needs + traits + context. Stored temporarily on the context object only.

| Drive | Formula | Generated candidate actions |
|-------|---------|----------------------------|
| `restDrive` | `energyDeficit * sensitivity` | sleep, simple_sleep, lie_down, sit, rest at bed/home slot |
| `eatDrive` | `hungerDeficit * sensitivity` | eat_element, harvest (food objects), drink_fountain |
| `playDrive` | `funDeficit * max(0.15, curiosity * activity) * energyModifier` | run_laps, circle, zigzag, jump, dance, nudge_ball, play_tag, play_fetch |
| `socialDrive` | `(socialDeficit * sensitivity * (0.5 + sociability)) + (0.08 * sociability)` | greet, show_affection, watch, talk, play_tag |
| `exploreDrive` | `curiosity * max(curiosity * 0.2, noveltyHunger) * confidence * energyModifier` | inspect, deep_inspect, wander, investigate dropped items |
| `comfortDrive` | `comfortDeficit * sensitivity` | seek beds, flowers, fountains, calming objects, cozy zones |
| `safetyDrive` | `(1 - confidence) * normalizedDistanceFromSafeArea * exhaustionModifier` | safe return to home position, avoid far zones |

`environment` is a passive ambient need — it has no drive. It is restored by being near good-environment objects (light, music, cozy decor) without the Myte needing to take any action. Low environment slowly drains comfort over time, which eventually generates a `comfortDrive` response.

**`socialDrive` formula notes:**
- The `0.08 * sociability` term adds a baseline social drive even when social need is full. At `sociability: 1.0` this adds 0.08. At `sociability: 0.0` it adds nothing.
- The `(0.5 + sociability)` multiplier means a reclusive Myte (`sociability: 0.1`) generates 0.6× the social drive of a social-need deficit. A clingy Myte (`sociability: 0.9`) generates 1.4× plus the baseline.

**`playDrive` note:** Using `max(0.15, curiosity * activity)` instead of bare multiplication prevents extreme low-trait combinations from collapsing the drive to near-zero. Trait minimums set in `resolveTraitValue()` are the first line of defense; this floor is the safety net.

**`exploreDrive` note:** `noveltyHunger` uses a curiosity-scaled floor (`curiosity * 0.2`) so a curious Myte always has some pull toward unexplored space, even from an empty or fully-visited area.

**Definitions:**
- `xDeficit` = `1 - (currentValue / maxValue)` → 0.0 when full, 1.0 when empty
- `energyModifier` = `clamp(energy / maxEnergy, 0, 1)` — low energy suppresses playDrive and exploreDrive
- `noveltyHunger` = ratio of unvisited objects in range vs. total in range; falls back to `curiosity * 0.2` when no objects are present
- `normalizedDistanceFromSafeArea` = `clamp(distanceFromHome / safeAreaRadius, 0, 1)`
- `exhaustionModifier` = `1.0` normally; `2.0` when `isExhausted === true`

**Mood/buff naming convention:**

`getDerivedMood()` returns human-readable emotional labels (`cozy`, `playful`, `lonely`, `anxious`, etc.) used for animation, expression, and speed. Buff IDs must **not** use the same string values as mood labels. Buffs are mechanical modifiers; moods are emotional states. Having both a `cozy` buff and a `cozy` mood label creates two systems claiming the same semantic meaning. In the buff system, use descriptive-but-distinct names: e.g., `well_settled` instead of `cozy`, `energized` instead of `playful`, `socially_depleted` instead of `lonely`. See Phase 5 and Phase 9 for where this applies.

---

### Preserved Systems

Do not remove or restructure these. They continue to function as-is:
- Candidate scoring engine and `minCandidateScore` floor
- Affordance system (object availability checks, slot management)
- `objectMemories` Map (novelty/recency tracking, pruning)
- Repeat penalty system
- Emergency safe return behavior (the behavior, not the home need)
- Action queue (priority, interrupt, sequence, ActionSync)
- Autonomy modes
- `noteBehavior()` call sites (standardized in Phase 7 but not removed)
- `BuffRegistry`, `MyteBuffController`, `GameZone` context buff keys (extended, not replaced)

---

## Action Tag Vocabulary

All action metadata must include `tags`. Use only these defined tags. Do not invent new ones without updating this list.

| Tag | Meaning | Replaces |
|-----|---------|---------|
| `stimulating` | Engages curiosity/novelty; raises fun | `isStimulating` array |
| `playful` | Physical or expressive play; raises fun | `isPlayful` array |
| `social` | Involves another Myte; raises social | `isSocial` array |
| `restful` | Lowers energy drain; raises energy over time | — |
| `comfort_giving` | Directly raises comfort | — |
| `soothing` | Calming; gently raises comfort; lowers anxiety effects | — |
| `purposeful_movement` | Directed movement, not play; neutral fun impact | `isPurposefulMovement` array |
| `risky` | High novelty/confidence requirement; triggers confidence events on outcome | — |
| `food` | Eating action; restores hunger; gives small energy bonus | — |
| `creative` | Expressive action; mild fun + comfort boost | — |

---

## Phase Dependencies

```
Phase 1 (Action Metadata)
    ├──→ Phase 2 (Needs + Drives)
    │         ├──→ Phase 3 (Confidence Gate)
    │         │         └──→ Phase 4 (Object + Zone Metadata)
    │         ├──→ Phase 6 (Debug Snapshots)
    │         ├──→ Phase 9 (Mood as Derived State)  [also needs Phase 6]
    │         └──→ Phase 11 (Battery + Sound Decoupling)
    └──→ Phase 5 (Buff System)  [also needs Phase 2 for trigger stat names]
Phase 1 + 2 + 3 + 5 → Phase 7 (Action Result Standardization)
Phase 2 + 3 + 7     → Phase 8 (Candidate Scoring Audit)
Phase 2 + 9         → Phase 10 (Config Audit) + Phase 12 (Species Defaults)
All above           → Phase 13 (Cleanup)
```

---

## Phase 1 — Action Metadata + Result Standardization

**Depends on:** nothing (implement first)

**Goal:** Every action declares its behavioral semantics. Replace all hardcoded category arrays with metadata-driven lookups. Standardize how all action completions and interruptions apply stat effects.

### Files
- `data/metadata/actions.json`
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `js/Myte/Queue/ActionDefinitionRegistry.js`
- `js/Myte/Queue/Actions/BaseActions.js`
- `js/Myte/Queue/Actions/ObjectInteractions.js`
- `js/Myte/Queue/Actions/SocialActions.js`
- `js/Myte/Queue/Actions/StateActions.js`
- `js/Myte/Queue/Actions/ReactiveActions.js`
- `js/Myte/Queue/Actions/MoveActions.js`

### Changes

#### `data/metadata/actions.json`

Add the following fields to every action entry. All fields are required. Use `0` or `[]` for none.

```json
"tags": [],
"effects": {
  "fun": 0,
  "social": 0,
  "comfort": 0,
  "energy": 0,
  "hunger": 0,
  "environment": 0,
  "confidence": 0
},
"exertion": 0,
"novelty": 0,
"risk": 0,
"soothingValue": 0,
"repeatMode": "diminishing"
```

**`repeatMode` values:**
- `"free"` — no repeat penalty; navigation, reactive, rest, and social-receive actions
- `"diminishing"` — increasing penalty per repeat, scaled down when the relevant drive is high (see Phase 8)

Apply these values per action:

| actionId | tags | effects (fun/social/comfort/energy/hunger/env/confidence) | exertion | novelty | risk | soothingValue | repeatMode |
|----------|------|----------------------------------------------------------|----------|---------|------|---------------|------------|
| `inspect` | `["stimulating"]` | 4/0/0/-1/0/0/0 | 1 | 6 | 1 | 0 | `"diminishing"` |
| `deep_inspect` | `["stimulating","risky"]` | 6/0/0/-2/0/0/2 | 1 | 8 | 2 | 0 | `"diminishing"` |
| `smell_flower` | `["stimulating","soothing","comfort_giving"]` | 5/0/4/-1/0/0/0 | 0 | 3 | 0 | 6 | `"diminishing"` |
| `drink_fountain` | `["soothing","food"]` | 3/0/2/3/5/0/0 | 0 | 2 | 0 | 4 | `"diminishing"` |
| `water_plant` | `["stimulating","creative"]` | 3/0/2/-1/0/0/0 | 1 | 2 | 0 | 1 | `"diminishing"` |
| `harvest` | `["stimulating","food"]` | 5/0/0/-1/10/0/0 | 1 | 3 | 0 | 0 | `"diminishing"` |
| `interact_object` | `["stimulating"]` | 4/0/0/-1/0/0/0 | 1 | 4 | 0 | 0 | `"diminishing"` |
| `open_chest` | `["stimulating","risky"]` | 10/0/0/-2/0/0/3 | 1 | 10 | 3 | 0 | `"diminishing"` |
| `eat_element` | `["food"]` | 2/0/0/5/20/0/0 | 0 | 2 | 0 | 2 | `"diminishing"` |
| `run_laps` | `["playful"]` | 8/0/-1/-5/0/0/0 | 5 | 2 | 0 | 0 | `"diminishing"` |
| `circle` | `["playful"]` | 6/0/0/-3/0/0/0 | 3 | 2 | 0 | 0 | `"diminishing"` |
| `zigzag` | `["playful"]` | 7/0/0/-4/0/0/0 | 4 | 3 | 0 | 0 | `"diminishing"` |
| `jump` | `["playful"]` | 5/0/0/-3/0/0/0 | 3 | 2 | 0 | 0 | `"diminishing"` |
| `dance` | `["playful","creative"]` | 8/2/0/-3/0/0/0 | 3 | 3 | 0 | 1 | `"diminishing"` |
| `play_tag` | `["playful","social"]` | 10/6/0/-5/0/0/0 | 5 | 4 | 0 | 0 | `"diminishing"` |
| `play_fetch` | `["playful","social"]` | 8/4/0/-4/0/0/0 | 4 | 3 | 0 | 0 | `"diminishing"` |
| `nudge_ball` | `["playful"]` | 6/0/0/-3/0/0/0 | 3 | 3 | 0 | 0 | `"diminishing"` |
| `show_affection` | `["social","comfort_giving","soothing"]` | 3/8/5/0/0/0/0 | 0 | 1 | 0 | 5 | `"diminishing"` |
| `greet` | `["social"]` | 2/6/0/0/0/0/1 | 0 | 2 | 1 | 0 | `"diminishing"` |
| `greet_receive` | `["social"]` | 1/4/0/0/0/0/0 | 0 | 1 | 0 | 0 | `"free"` |
| `watch` | `["social","stimulating"]` | 2/3/0/0/0/0/0 | 0 | 3 | 0 | 1 | `"diminishing"` |
| `talk` | `["social"]` | 3/7/1/0/0/0/0 | 0 | 2 | 1 | 0 | `"diminishing"` |
| `kiss` | `["social","comfort_giving"]` | 4/8/6/0/0/0/0 | 0 | 2 | 0 | 4 | `"diminishing"` |
| `go_to_object` | `["purposeful_movement"]` | -1/0/0/-2/0/0/0 | 2 | 0 | 0 | 0 | `"free"` |
| `astar-move` | `["purposeful_movement"]` | 0/0/0/-1/0/0/0 | 1 | 0 | 0 | 0 | `"free"` |
| `move` | `["purposeful_movement"]` | 0/0/0/-1/0/0/0 | 1 | 0 | 0 | 0 | `"free"` |
| `follow_object` | `["purposeful_movement","social"]` | 0/1/0/-2/0/0/0 | 2 | 0 | 0 | 0 | `"free"` |
| `sleep` | `["restful"]` | -2/0/8/30/0/0/0 | 0 | 0 | 0 | 8 | `"free"` |
| `simple_sleep` | `["restful"]` | 0/0/4/15/0/0/0 | 0 | 0 | 0 | 6 | `"free"` |
| `stretch` | `["restful","soothing"]` | 0/0/3/2/0/0/0 | 0 | 0 | 0 | 3 | `"free"` |
| `yawn` | `["restful"]` | 0/0/1/0/0/0/0 | 0 | 0 | 0 | 2 | `"free"` |
| `run_away` | `["purposeful_movement"]` | 0/0/-4/-5/0/0/-2 | 5 | 0 | 0 | 0 | `"free"` |
| `hide` | `["restful","soothing"]` | 0/0/2/-1/0/0/-1 | 0 | 0 | 0 | 2 | `"free"` |
| `carry_pickup` | `["social"]` | 0/0/-1/0/0/0/-1 | 0 | 2 | 0 | 0 | `"free"` |
| `carry` | `["social"]` | 0/0/-2/0/0/0/-1 | 0 | 1 | 0 | 0 | `"free"` |
| `being_carried` | `["social","comfort_giving"]` | 0/3/3/0/0/0/0 | 0 | 2 | 0 | 3 | `"free"` |
| `carry_putdown` | `["social"]` | 0/0/1/0/0/0/0 | 0 | 0 | 0 | 1 | `"free"` |
| `rest` | `["restful","comfort_giving"]` | 0/0/8/15/0/0/0 | 0 | 0 | 0 | 6 | `"free"` |
| `lie_down` | `["restful","soothing"]` | 0/0/5/5/0/0/0 | 0 | 0 | 0 | 5 | `"free"` |
| `sit` | `["restful"]` | 0/0/3/3/0/0/0 | 0 | 0 | 0 | 3 | `"free"` |
| `wander` | `["purposeful_movement"]` | 1/0/0/-1/0/0/0 | 1 | 2 | 0 | 0 | `"diminishing"` |

#### `js/Myte/MyteStats.js`

1. Delete these four arrays entirely — they will not be replaced inline:
   ```js
   const isStimulating = [...].includes(actionId);
   const isPlayful = [...].includes(actionId);
   const isSocial = [...].includes(actionId);
   const isPurposefulMovement = [...].includes(actionId);
   ```

2. In `applyActionCompletionEffects(actionId)`: replace all category-based switch/if logic with:
   ```js
   const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
   if (!def) return;
   const { effects = {}, tags = [] } = def;
   // apply effects using existing normalizeStatEffects / applyStatEffects
   ```

3. In `applyActivityEffects()` (or `updateBehaviorDrives()`): replace `isStimulating`, `isPlayful`, `isSocial`, `isPurposefulMovement` checks with tag lookups:
   ```js
   const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
   const tags = def?.tags ?? [];
   const isStimulating = tags.includes('stimulating');
   const isPlayful = tags.includes('playful');
   const isSocial = tags.includes('social');
   const isPurposefulMovement = tags.includes('purposeful_movement');
   const isRestful = tags.includes('restful');
   ```

4. Import `ActionDefinitionRegistry` at the top of `MyteStats.js` if not already present.

#### `js/Myte/MyteAI.js`

Replace any hardcoded action ID comparisons in candidate scoring with tag lookups via `ActionDefinitionRegistry.getDefinitionSync(actionId)?.tags`.

#### `js/Myte/Queue/Actions/BaseActions.js`

Add `buildActionResult(overrides = {})` to `MyteAction`:

```js
buildActionResult(overrides = {}) {
    const def = ActionDefinitionRegistry.getDefinitionSync(this.id);
    const base = def?.effects ?? {};
    return {
        funDelta:         base.fun         ?? 0,
        socialDelta:      base.social      ?? 0,
        comfortDelta:     base.comfort     ?? 0,
        energyDelta:      base.energy      ?? 0,
        hungerDelta:      base.hunger      ?? 0,
        environmentDelta: base.environment ?? 0,
        confidenceDelta:  base.confidence  ?? 0,
        novelty:          def?.novelty     ?? 0,
        soothingValue:    def?.soothingValue ?? 0,
        exertion:         def?.exertion    ?? 0,
        accomplishment:   0,
        scary:            false,
        safeOutcome:      true,
        failedOutcome:    false,
        ...overrides
    };
}
```

In `MyteAction.complete()`: call `this.myte.stats.applyActionResult(this.buildActionResult())` as the default. Subclasses override `buildActionResult(overrides)` to pass per-instance adjustments.

In `MyteAction.interrupt()`: call `this.myte.stats.applyActionResult(this.buildActionResult({ safeOutcome: false, failedOutcome: true }))` if the action was meaningfully in-progress.

#### `js/Myte/MyteStats.js` — `applyActionResult()`

Add `applyActionResult(result)`:

```js
applyActionResult(result) {
    const scale = this.noteBehaviorScale ?? 0.55;

    if (result.funDelta)         this.updateFun(result.funDelta * scale);
    if (result.socialDelta)      this.updateSocial(result.socialDelta * scale);
    if (result.comfortDelta)     this.updateComfort(result.comfortDelta * scale);
    if (result.energyDelta)      this.updateEnergy(result.energyDelta * scale);
    if (result.hungerDelta)      this.updateHunger(result.hungerDelta * scale);
    if (result.environmentDelta) this.updateEnvironment(result.environmentDelta * scale);

    if (result.confidenceDelta !== 0) {
        this.notifyConfidenceEvent(result.confidenceDelta > 0 ? 'positiveOutcome' : 'negativeOutcome', 0);
    }
    if (result.safeOutcome && result.novelty > 3) {
        this.notifyConfidenceEvent('riskySuccess', 0);
    }
    if (result.failedOutcome) {
        this.notifyConfidenceEvent('negativeOutcome', 0);
    }

    this.myte.buffs?.checkStatusTriggers?.();
}
```

Update `noteBehavior()` to call `applyActionResult()` internally — do not break existing callers.

#### All action `complete()` methods

Replace ad-hoc stat delta calls with `this.buildActionResult({ ... })` overrides where the action has instance-specific deltas beyond what metadata provides. If an action currently grants +20 energy on complete, ensure that value is either in the metadata `effects.energy` field or in the override.

### Verify
- Launch game in autonomous mode. Watch a Myte for 2 minutes. Confirm behavior is unchanged.
- Open browser console. Confirm no errors from missing `ActionDefinitionRegistry` lookups.
- Grep for `isStimulating`, `isPlayful`, `isSocial`, `isPurposefulMovement` as array declarations — confirm none exist.
- Complete each action type in game. Confirm stats change correctly.
- Confirm failing/interrupting an action triggers a `negativeOutcome` confidence event.
- Confirm `noteBehavior()` still works for any callers not yet migrated.

---

## Phase 2 — Needs + Drives Restructuring

**Depends on:** Phase 1

**Goal:** MyteStats holds only clearly named persistent needs and traits. MyteAI computes drives as a separate step. `home`, `lightNeed`, `musicNeed`, `boredom` are removed. `hunger` is added.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `data/mytes/myte.json`

### Changes

#### `js/Myte/MyteStats.js`

**Add `hunger` as a new persistent need:**
```js
this.maxHunger = statConfig.maxHunger ?? 100;
this.minHunger = 0;
this.hunger = statConfig.hunger ?? this.maxHunger;
this.hungerDecayRate = statConfig.hungerDecayRate ?? SiteConfig.stats.hungerDecayRate;
```

Add `getHungerRatio()` method: `return this.hunger / this.maxHunger;`

In the main update loop, drain hunger over time: `this.hunger = Math.max(this.minHunger, this.hunger - this.hungerDecayRate * deltaTime);`

**Remove `home` as an emotional stat:**
- Delete `this.home`, `this.homeNeed`, or equivalent home meter property
- Keep all emergency safe return behavior and `getHomePosition()` — only the stat meter is removed
- Keep `homeRadius` (used for spatial math) — rename it to `safeAreaRadius` everywhere in MyteStats and MyteAI

**Remove `lightNeed` and `musicNeed` as standalone stats:**
- Delete `this.lightNeed` and `this.musicNeed` properties
- Their aura buffs (`light_aura`, `music_aura`) already apply `comfortPerMs` and `moodPerMs` — update those buff effects in `buffs.json` to apply `environmentPerMs` instead (handled in Phase 5)
- The `environment` need now absorbs ambient light and music quality effects

**Add `environment` as a persistent need if not present:**
```js
this.maxEnvironment = statConfig.maxEnvironment ?? 100;
this.minEnvironment = 0;
this.environment = statConfig.environment ?? 70;
this.environmentDecayRate = statConfig.environmentDecayRate ?? SiteConfig.stats.environmentDecayRate;
```

Add `getEnvironmentRatio()` method.

**Rename `neediness` trait to `sensitivity`, add `sociability` and `boldness`:**
```js
this.traits = {
    curiosity:   this.resolveTraitValue(traitConfig.curiosity),
    activity:    this.resolveTraitValue(traitConfig.activity),
    sensitivity: this.resolveTraitValue(traitConfig.sensitivity ?? traitConfig.neediness),
    sociability: this.resolveTraitValue(traitConfig.sociability ?? 0.5),
    boldness:    this.resolveTraitValue(traitConfig.boldness ?? 0.5)
};
```

Set confidence floor from boldness after traits are initialized:
```js
this.minConfidence = this.traits.boldness * 0.2;
```

**Enforce trait minimums in `resolveTraitValue()`:** This is the primary protection against extreme personality configurations collapsing all drives. Ensure no trait can resolve below 0.1 for core traits (`curiosity`, `activity`, `sensitivity`). `sociability` and `boldness` may go to 0.0 since their full range is intentional (truly reclusive / truly timid Mytes).

```js
resolveTraitValue(config) {
    if (typeof config === 'number') return Math.max(0, Math.min(1, config));
    if (typeof config === 'object' && config !== null) {
        return Math.max(config.min ?? 0, Math.min(config.max ?? 1, config.default ?? 0.5));
    }
    return 0.5;
}
```

The trait `min` values in `data/mytes/myte.json` are the enforcement point — set `curiosity`, `activity`, `sensitivity` minimums to `0.1` in the base config.

**Move `confidence` out of traits:**
- Remove `confidence` from `this.traits`
- Add as standalone stat with its own property:
```js
this.confidence = statConfig.confidence ?? 0.5;
this.minConfidence = 0;
this.maxConfidence = 1;
```
- Add `getConfidenceRatio()` returning `this.confidence`
- Add `setConfidence(value)`: `this.confidence = Math.max(0, Math.min(1, value));`

**Enforce need drain/restore rules:**
- `comfort` drain sources: time, actions with `exertion >= 4`, scary events (see Phase 3)
- `comfort` restore sources: actions tagged `comfort_giving`, `soothing` — apply from action `effects.comfort`
- `environment` drain sources: time, nearby objects with `environmentEffects` negatives (Phase 4)
- `environment` restore sources: ambient — handled by aura buffs (Phase 5), not by action completion

**Remove `boredom` as a stat:**
- Delete `this.boredom`, `this.minBoredom`, `this.maxBoredom`, `this.boredomDecayRate`
- `fun` need is its replacement — low fun = bored state
- Update `getBoredomRatio()` to be an alias: `return 1 - this.getFunRatio();` (for backward compat during transition; remove in Phase 13)

**Remove `enrichment` as a stat** if it exists separately from `fun`.

#### `js/Myte/MyteAI.js` — `buildContext()`

Split `buildContext()` into two methods:

```js
_buildNeedsSnapshot(myte) {
    const s = myte.stats;
    return {
        energyRatio:      s.getEnergyRatio(),
        hungerRatio:      s.getHungerRatio(),
        funRatio:         s.getFunRatio(),
        socialRatio:      s.getSocialRatio(),
        comfortRatio:     s.getComfortRatio(),
        environmentRatio: s.getEnvironmentRatio(),
        confidence:       s.confidence,
        traits: {
            curiosity:    s.traits.curiosity,
            activity:     s.traits.activity,
            sensitivity:  s.traits.sensitivity,
            sociability:  s.traits.sociability,   // required by socialDrive formula
            boldness:     s.traits.boldness        // required by risk gating in Phase 3
        }
    };
}

_computeDrives(needs, spatialContext) {
    const { energyRatio, hungerRatio, funRatio, socialRatio, comfortRatio, confidence, traits } = needs;
    const { normalizedDistanceFromSafeArea, isExhausted, noveltyHunger } = spatialContext;

    const energyDeficit      = 1 - energyRatio;
    const hungerDeficit      = 1 - hungerRatio;
    const funDeficit         = 1 - funRatio;
    const socialDeficit      = 1 - socialRatio;
    const comfortDeficit     = 1 - comfortRatio;
    const energyModifier     = Math.max(0, energyRatio);
    const exhaustionModifier = isExhausted ? 2.0 : 1.0;

    // noveltyHunger floor — curious Mytes always have some pull toward unexplored space
    const effectiveNoveltyHunger = Math.max(traits.curiosity * 0.2, noveltyHunger);

    const drives = {
        restDrive:    energyDeficit * traits.sensitivity,
        eatDrive:     hungerDeficit * traits.sensitivity,
        playDrive:    funDeficit * Math.max(0.15, traits.curiosity * traits.activity) * energyModifier,
        socialDrive:  (socialDeficit * traits.sensitivity * (0.5 + traits.sociability)) + (0.08 * traits.sociability),
        exploreDrive: traits.curiosity * effectiveNoveltyHunger * confidence * energyModifier,
        comfortDrive: comfortDeficit * traits.sensitivity,
        safetyDrive:  (1 - confidence) * normalizedDistanceFromSafeArea * exhaustionModifier
    };

    // Apply drive weights from config — applied here so debug snapshot reflects actual scored values
    const weights = this.config?.driveWeights ?? {};
    for (const key of Object.keys(drives)) {
        drives[key] = drives[key] * (weights[key] ?? 1.0);
    }

    return drives;
}
```

Call both from `buildContext()` and attach the result to `context.needs` and `context.drives`.

All candidate builders must receive `context` and reference `context.drives.xDrive` instead of computing inline.

#### `data/mytes/myte.json`

Add to the `ai` block:
```json
"driveWeights": {
    "restDrive":    1.0,
    "eatDrive":     1.0,
    "playDrive":    1.0,
    "socialDrive":  1.0,
    "exploreDrive": 1.0,
    "comfortDrive": 1.0,
    "safetyDrive":  1.0
},
"safeAreaRadius": 200
```

Add to the `stats` block:
```json
"maxHunger": 100,
"hunger": 100,
"hungerDecayRate": 0.003,
"maxEnvironment": 100,
"environment": 70,
"environmentDecayRate": 0.001
```

Replace any reference to `neediness` in traits config with `sensitivity`.

### Verify
- Confirm `MyteStats` has no `lightNeed`, `musicNeed`, `boredom` (as standalone stat), `home` (as meter), `enrichment`
- Confirm `hunger` drains over time and Myte eventually seeks food
- Confirm `confidence` is accessible as `myte.stats.confidence` (not `myte.stats.traits.confidence`)
- Confirm `context.drives` object exists and has all 7 drive values when `buildContext()` is called
- No regressions in emergency return, rest, or social behavior

---

## Phase 3 — Confidence as Behavioral Gate

**Depends on:** Phase 2

**Goal:** Confidence is a first-class stat that gates which candidates are generated and changes through tracked events.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `data/mytes/myte.json`

### Changes

#### `js/Myte/MyteStats.js`

Add `notifyConfidenceEvent(type, magnitude)`:
```js
notifyConfidenceEvent(type, magnitude) {
    const delta = this.confidenceEventMagnitudes?.[type] ?? magnitude;
    this.setConfidence(this.confidence + delta);
}
```

`setConfidence` clamps to `[this.minConfidence, this.maxConfidence]`. `minConfidence` = `boldness * 0.2` (set in Phase 2) — bold Mytes cannot fall to zero confidence.

`boldness` is not applied as a per-event multiplier. It operates through two simpler mechanisms: the confidence floor (set at init) and the starting confidence value declared per species. A bold species starts higher and can't fall as low. Event magnitudes are the same for all Mytes — the personality difference is expressed in the starting state and the floor, not in event math.

Initialize `confidenceEventMagnitudes` from config in constructor:
```js
this.confidenceEventMagnitudes = aiConfig.confidenceEventMagnitudes ?? {};
```

#### `js/Myte/MyteAI.js`

**Read confidence tier from config:**
```js
_getConfidenceTier(confidence) {
    const { low, high } = this.config.confidenceThresholds ?? { low: 0.35, high: 0.70 };
    if (confidence < low) return 'low';
    if (confidence >= high) return 'high';
    return 'medium';
}
```

**Gate candidates by confidence tier in every builder:**

In each candidate builder, check the action's `risk` field directly against confidence:
```js
const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
const risk = def?.risk ?? 0;
if (risk > context.needs.confidence * 5) return null; // skip this candidate
```

This is a straightforward threshold. A Myte at confidence 0.5 can attempt risk ≤ 2 actions. At confidence 0.8, risk ≤ 4. Boldness shapes the confidence value itself (via floor and starting point) — it doesn't need to appear again in this formula.

Additionally, apply these explicit gates per builder:

| Candidate builder | Low confidence | Medium confidence | High confidence |
|-------------------|---------------|-------------------|-----------------|
| Portal interaction | skip | skip | allow |
| `open_chest` | skip | skip | allow |
| Far wander (> 60% safeAreaRadius) | skip | allow at 80% radius | full radius |
| Social with unknown Myte (not in objectMemories) | skip | skip | allow |
| Social with known Myte | skip | allow | allow |
| `inspect` / `deep_inspect` | skip `deep_inspect` | allow both | allow both |
| `wander` radius | 30% of safeAreaRadius | 65% | 100% |

**Passive confidence recovery:**

A low-confidence Myte in a familiar area needs a way to slowly rebuild without requiring exploration. Each AI tick, check:

```js
_updatePassiveConfidenceRecovery() {
    const inSafeArea = this._lastDistanceFromHome <= (this.config.safeAreaRadius ?? 200);
    const scaryNearby = this._scaryObjectDetectedThisTick;
    if (inSafeArea && !scaryNearby) {
        this.myte.stats.notifyConfidenceEvent('safeAtHome', 0);
    }
}
```

`_scaryObjectDetectedThisTick` is set during context building if any nearby object has `scaryStrength > 0`. It resets each tick. No timestamp tracking needed.

At a configured magnitude of `0.0003` per tick (~10ms ticks ≈ +0.018/min), a timid Myte at confidence 0.20 reaches medium tier (0.35) in about 8 in-game minutes of staying near home.

**Hook `notifyConfidenceEvent()` from these four sources only:**

1. **Action complete (positive):** Any action completed normally → `'positiveOutcome'`. If the action is tagged `risky`, use `'riskySuccess'` instead.

2. **Action failed/interrupted:** Any action interrupted or that errors → `'negativeOutcome'`.

3. **Scary object nearby:** During context building, if any nearby object has `scaryStrength > 0` and is within interaction range → `'scaryThing'`. Fire at most once per AI tick.

4. **Safe at home:** During passive recovery tick (see below) when the Myte is within `safeAreaRadius` and no scary thing has been encountered recently → `'safeAtHome'`.

#### `data/mytes/myte.json`

Add to the `ai` block:
```json
"confidenceThresholds": { "low": 0.35, "high": 0.70 },
"confidenceEventMagnitudes": {
    "positiveOutcome":  0.03,
    "riskySuccess":     0.06,
    "safeAtHome":       0.0003,
    "scaryThing":      -0.05,
    "negativeOutcome": -0.04
}
```

### Verify
- Create a Myte with low starting confidence (`confidence: 0.2` in species JSON)
- Confirm it does not generate portal/chest/far-explore/stranger candidates
- Let it rest near home for 2–3 minutes — confirm confidence slowly rises via passive `safeAtHome` events
- Confirm `notifyConfidenceEvent` is called from action complete and does not throw errors
- Confirm `safeAtHome` does not fire when a scary object is within range that tick

---

## Phase 4 — Object + Zone Metadata Foundation

**Depends on:** Phase 2, Phase 3

**Goal:** Map objects declare their behavioral effects. Zones read from metadata instead of hardcoded switch statements.

### Files
- `js/Map/MapObjects/BaseMapObject.js` (or equivalent base class)
- `js/Map/GameZone.js`
- `data/metadata/zones.json` (new file)

### Changes

#### `js/Map/MapObjects/BaseMapObject.js`

Add the following optional schema to the base object definition structure. These are read from the object's definition/config, not hardcoded per class:

```js
// All optional — default to 0 / null if not declared
aiTags:             [],      // string[] — hints for candidate scoring e.g. ['cozy', 'scary']
environmentEffects: {},      // { comfort: 0, stimulation: 0, noise: 0, coziness: 0 }
confidenceEffect:   0,       // applied to nearby Myte confidence per second (negative = scary)
comfortEffect:      0,       // applied when Myte interacts with this object
noveltyValue:       0,       // 0–10; higher = more interesting to explore
scaryStrength:      0,       // 0–10; triggers scaryObjectNearby confidence event when > 0
```

Add a getter `getAIMetadata()` that returns these fields. `MyteAI` calls this during context building and candidate scoring.

In `MyteAI.buildContext()`, iterate nearby objects and accumulate:
- Sum `environmentEffects` values from all nearby objects → contributes to `context.environmentQuality`
- If any object has `scaryStrength > 0` and is within interaction radius → call `notifyConfidenceEvent('scaryObjectNearby', 0)`

#### `data/metadata/zones.json` (new file)

```json
{
  "schemaVersion": 1,
  "zones": [
    {
      "id": "rest",
      "label": "Rest Zone",
      "buffId": "zone_rest",
      "exclusiveGroup": "zone",
      "driveBoosts": { "restDrive": 1.3, "comfortDrive": 1.2 },
      "needEffectsPerMs": { "comfort": 0.00085, "energy": 0.0005 },
      "confidenceEffectPerMs": 0.0002
    },
    {
      "id": "play",
      "label": "Play Zone",
      "buffId": "zone_play",
      "exclusiveGroup": "zone",
      "driveBoosts": { "playDrive": 1.4, "exploreDrive": 1.1 },
      "needEffectsPerMs": { "fun": 0.0015, "social": 0.0003 },
      "confidenceEffectPerMs": 0.0004
    },
    {
      "id": "social",
      "label": "Social Zone",
      "buffId": "zone_social",
      "exclusiveGroup": "zone",
      "driveBoosts": { "socialDrive": 1.4, "playDrive": 1.1 },
      "needEffectsPerMs": { "social": 0.0012, "fun": 0.0006, "comfort": 0.0003 },
      "confidenceEffectPerMs": 0.00065
    },
    {
      "id": "danger",
      "label": "Danger Zone",
      "buffId": "zone_danger",
      "exclusiveGroup": "zone",
      "driveBoosts": { "safetyDrive": 2.0 },
      "needEffectsPerMs": { "comfort": -0.0005 },
      "confidenceEffectPerMs": -0.00035
    },
    {
      "id": "food",
      "label": "Food Zone",
      "buffId": null,
      "exclusiveGroup": "zone",
      "driveBoosts": { "eatDrive": 1.5 },
      "needEffectsPerMs": {},
      "confidenceEffectPerMs": 0
    },
    {
      "id": "boost",
      "label": "Boost Zone",
      "buffId": null,
      "exclusiveGroup": "zone",
      "driveBoosts": {},
      "needEffectsPerMs": {},
      "confidenceEffectPerMs": 0
    }
  ]
}
```

#### `js/Map/GameZone.js`

Import zone definitions directly from `zones.json` as a plain object — no registry needed, zones don't change at runtime:

```js
import ZONE_DEFINITIONS from '../../data/metadata/zones.json' assert { type: 'json' };
// or load via the existing asset loader if JSON imports aren't available
```

Add a helper:
```js
_getZoneDef() {
    return ZONE_DEFINITIONS.zones.find(z => z.id === this.type) ?? null;
}
```

Remove these methods entirely — their logic moves to data:
- `applyRestZoneEffects()`
- `applyPlayZoneEffects()`
- `applyFoodZoneEffects()`
- `applySocialZoneEffects()`
- `applyDangerZoneEffects()`
- `applyBoostZoneEffects()`

Replace the body of `update()` with:
```js
const zoneDef = this._getZoneDef();
if (!zoneDef) return;

// Apply need effects
if (zoneDef.needEffectsPerMs) {
    myte.stats.applyStatEffectsPerMs(zoneDef.needEffectsPerMs, deltaTime);
}

// Apply confidence effect
if (zoneDef.confidenceEffectPerMs) {
    myte.stats.notifyConfidenceEvent('zoneEffect', zoneDef.confidenceEffectPerMs * deltaTime);
}

// Apply drive boosts to context (store on zone for AI to read during context building)
this.driveBoosts = zoneDef.driveBoosts ?? {};

// Sync buff
if (zoneDef.buffId) {
    this.syncZoneBuff(myte, zoneDef.buffId);
}
```

In `MyteAI._computeDrives()`, after calculating raw drives, multiply each by any `driveBoosts` declared by zones the Myte is currently inside:
```js
for (const zone of context.currentZones) {
    for (const [drive, multiplier] of Object.entries(zone.driveBoosts ?? {})) {
        drives[drive] = (drives[drive] ?? 0) * multiplier;
    }
}
```

### Verify
- Place Myte in a play zone — confirm `playDrive` is boosted and Myte prefers play candidates
- Place a scary object near Myte — confirm confidence drops via `scaryThing` event
- Confirm `applyRestZoneEffects` etc. no longer exist in `GameZone.js`
- No console errors from missing zone definitions (check that `zones.json` is loadable)

---

## Phase 5 — Buff System Expansion + Conflict Resolution

**Depends on:** Phase 1 (for tag-based triggers), Phase 2 (for new stat names)

**Goal:** Add new buffs for hunger, time-of-day, and weather. Fix existing buff triggers broken by Phase 2. Add exclusion/cancellation system.

### Files
- `data/metadata/buffs.json`
- `js/Myte/MyteBuffController.js`
- `js/Engine/BuffRegistry.js`
- Main game loop file (wherever `SimClock` is accessible)

### Changes

#### `data/metadata/buffs.json` — Add new buffs

Add the following entries to the `buffs` array:

```json
{
  "id": "hungry",
  "label": "Hungry",
  "kind": "debuff",
  "category": "hunger",
  "priority": 65,
  "durationMs": 0,
  "cancellable": false,
  "icon": "HG",
  "description": "Growing hunger makes it harder to focus and drains mood.",
  "exclusiveGroup": "hunger_tier",
  "effects": {
    "stats": {
      "moodDecayMultiplier": 1.06,
      "behaviorDriveMultiplier": 0.95
    }
  },
  "triggers": {
    "status": {
      "conditions": [
        { "stat": "hungerRatio", "lte": 0.3 },
        { "stat": "hungerRatio", "gt": 0.05 }
      ]
    }
  }
},
{
  "id": "starving",
  "label": "Starving",
  "kind": "debuff",
  "category": "hunger",
  "priority": 95,
  "durationMs": 0,
  "cancellable": false,
  "icon": "SV",
  "description": "Severe hunger. Eating becomes the only priority.",
  "exclusiveGroup": "hunger_tier",
  "cancels": ["hungry", "nourished"],
  "effects": {
    "movement": { "speedMultiplier": 0.88 },
    "stats": {
      "moodDecayMultiplier": 1.15,
      "behaviorDriveMultiplier": 0.85
    }
  },
  "triggers": {
    "status": {
      "conditions": [
        { "stat": "hungerRatio", "lte": 0.05 }
      ]
    }
  }
},
{
  "id": "night_fatigue",
  "label": "Night Fatigue",
  "kind": "debuff",
  "category": "time",
  "priority": 55,
  "durationMs": 0,
  "cancellable": false,
  "icon": "NF",
  "description": "Late hours make everything heavier. Rest calls louder.",
  "exclusiveGroup": "time_of_day",
  "effects": {
    "movement": { "speedMultiplier": 0.92 },
    "stats": {
      "energyDecayMultiplier": 1.12,
      "moodDecayMultiplier": 1.05
    }
  }
},
{
  "id": "morning_energy",
  "label": "Morning Energy",
  "kind": "buff",
  "category": "time",
  "priority": 22,
  "durationMs": 0,
  "cancellable": false,
  "icon": "ME",
  "description": "The fresh morning hours give a natural lift.",
  "exclusiveGroup": "time_of_day",
  "effects": {
    "movement": { "speedMultiplier": 1.04 },
    "stats": {
      "energyDecayMultiplier": 0.9,
      "moodDecayMultiplier": 0.95
    }
  }
},
{
  "id": "afternoon_slump",
  "label": "Afternoon Slump",
  "kind": "debuff",
  "category": "time",
  "priority": 40,
  "durationMs": 0,
  "cancellable": false,
  "icon": "AS",
  "description": "The mid-afternoon lull nudges toward rest.",
  "exclusiveGroup": "time_of_day",
  "effects": {
    "stats": {
      "energyDecayMultiplier": 1.05
    }
  }
},
{
  "id": "far_from_home",
  "label": "Far From Home",
  "kind": "debuff",
  "category": "comfort",
  "priority": 45,
  "durationMs": 0,
  "cancellable": true,
  "icon": "FF",
  "description": "Too far from familiar ground. Comfort slowly drains.",
  "effects": {
    "stats": {
      "comfortPerMs": -0.00012
    }
  }
},
{
  "id": "rainy_day",
  "label": "Rainy Day",
  "kind": "debuff",
  "category": "weather",
  "priority": 35,
  "durationMs": 0,
  "cancellable": false,
  "icon": "RN",
  "description": "Rain keeps things indoors. Comfort matters more.",
  "exclusiveGroup": "weather",
  "effects": {
    "movement": { "speedMultiplier": 0.95 },
    "stats": {
      "moodDecayMultiplier": 1.04,
      "comfortPerMs": -0.00006
    }
  }
},
{
  "id": "sunny_day",
  "label": "Sunny Day",
  "kind": "buff",
  "category": "weather",
  "priority": 20,
  "durationMs": 0,
  "cancellable": false,
  "icon": "SN",
  "description": "Bright sunshine makes the world more inviting.",
  "exclusiveGroup": "weather",
  "effects": {
    "movement": { "speedMultiplier": 1.03 },
    "stats": {
      "moodSyncMultiplier": 1.05,
      "moodDecayMultiplier": 0.96
    }
  }
},
{
  "id": "stormy",
  "label": "Stormy",
  "kind": "debuff",
  "category": "weather",
  "priority": 70,
  "durationMs": 0,
  "cancellable": false,
  "icon": "ST",
  "description": "The storm unsettles everything. Safety feels far away.",
  "exclusiveGroup": "weather",
  "cancels": ["sunny_day", "rainy_day"],
  "effects": {
    "movement": { "speedMultiplier": 0.88 },
    "stats": {
      "moodDecayMultiplier": 1.12,
      "confidencePerMs": -0.00025,
      "comfortPerMs": -0.0001
    }
  }
}
```

#### `data/metadata/buffs.json` — Fix existing buffs

Add `exclusiveGroup` to existing buffs:

| Buff ID | Add field |
|---------|-----------|
| `well_rested` | `"exclusiveGroup": "energy_tier"` |
| `charged_up` | `"exclusiveGroup": "energy_tier"` |
| `tired` | `"exclusiveGroup": "energy_tier"` |
| `exhausted` | `"exclusiveGroup": "energy_tier"`, `"cancels": ["tired", "well_rested", "charged_up"]` |
| `nourished` | `"exclusiveGroup": "hunger_tier"`, `"cancels": ["hungry", "starving"]` |
| `spirited` | `"exclusiveGroup": "mood_polarity"` |
| `gloomy` | `"exclusiveGroup": "mood_polarity"` |
| `confident` | `"exclusiveGroup": "confidence_polarity"` |
| `anxious` | `"exclusiveGroup": "confidence_polarity"` |
| `zone_rest` | `"exclusiveGroup": "zone"` |
| `zone_play` | `"exclusiveGroup": "zone"` |
| `zone_social` | `"exclusiveGroup": "zone"` |
| `zone_danger` | `"exclusiveGroup": "zone"` |
| `well_rested` | add `"cancels": ["tired"]` |
| `playful` | add `"cancels": ["restless"]` |
| `disturbed` | add `"cancels": ["well_rested"]` |
| `charged_up` | add `"cancels": ["tired"]` |

**Fix `restless` trigger** — rename stat from `boredomRatio` to `funRatio` with inverted operator:
```json
"triggers": {
  "status": {
    "conditions": [
      { "stat": "funRatio", "lte": 0.28 }
    ]
  }
}
```
(0.28 funRatio = 0.72 boredomRatio — equivalent threshold)

**Update `light_aura` and `music_aura` buff effects** — replace `moodPerMs` with `environmentPerMs`:
```json
"light_aura": {
  "effects": {
    "stats": {
      "environmentPerMs": 0.00012,
      "comfortPerMs": 0.00008
    }
  }
},
"music_aura": {
  "effects": {
    "stats": {
      "environmentPerMs": 0.00018,
      "funPerMs": 0.00008,
      "confidencePerMs": 0.00004
    }
  }
}
```

**Add `far_from_home` buff trigger in `MyteAI`** — apply as a context buff based on distance and confidence tier only. Do not gate on energy — a well-rested Myte that is far from home should still feel the pressure if confidence is not high:
```js
const tier = this._getConfidenceTier(myte.stats.confidence);
const distanceThreshold = this.config.safeAreaRadius * (tier === 'high' ? 2.5 : 1.8);
const isFarFromHome = distanceFromHome > distanceThreshold;
myte.buffs.syncContextBuff('far_from_home_state', isFarFromHome ? 'far_from_home' : null);
```

High-confidence Mytes trigger the buff at a larger distance (2.5×), reflecting their comfort with exploration. Low/medium confidence Mytes trigger it at the closer 1.8× threshold.

#### `js/Myte/MyteBuffController.js`

Add `exclusiveGroup` and `cancels` handling to `applyBuff()`. Insert before the existing apply logic:

```js
applyBuff(buffId, options = {}) {
    const def = BuffRegistry.getBuffSync(buffId);
    if (!def) return null;

    // 1. Remove all buffs in the same exclusive group
    if (def.exclusiveGroup) {
        for (const [instanceId, activeBuff] of this.activeBuffs) {
            const activeDef = BuffRegistry.getBuffSync(activeBuff.id);
            if (activeDef?.exclusiveGroup === def.exclusiveGroup) {
                this.removeBuff(instanceId);
            }
        }
    }

    // 2. Remove explicitly cancelled buffs
    if (def.cancels?.length) {
        for (const cancelId of def.cancels) {
            this.removeBuffById(cancelId); // remove all instances of this buff ID
        }
    }

    // 3. Apply the buff normally (existing logic follows)
    // ...
}
```

Add `removeBuffById(buffId)` helper if not present — removes all active instances with that buff ID.

#### `js/Engine/BuffRegistry.js`

Add `exclusiveGroup` and `cancels` to `normalizeDefinition()` so they are preserved from JSON:
```js
exclusiveGroup: raw.exclusiveGroup ?? null,
cancels: raw.cancels ?? [],
```

#### Time-of-day buffs — add to main game loop (no new file needed)

Add this function in whatever file runs the main game tick. It needs access to `SimClock` and the active Myte list.

```js
const TIME_BUFF_WINDOWS = [
    { buffId: 'morning_energy',  startHour: 6,  endHour: 10 },
    { buffId: 'afternoon_slump', startHour: 14, endHour: 16 },
    { buffId: 'night_fatigue',   startHour: 22, endHour: 6  } // wraps midnight
];

function updateTimeOfDayBuffs(activeMytes) {
    const hour = SimClock.getHour();
    const active = TIME_BUFF_WINDOWS.find(w => {
        return w.startHour <= w.endHour
            ? hour >= w.startHour && hour < w.endHour
            : hour >= w.startHour || hour < w.endHour;
    });
    const buffId = active?.buffId ?? null;
    for (const myte of activeMytes) {
        myte.buffs.syncContextBuff('time_of_day', buffId);
    }
}
```

Call `updateTimeOfDayBuffs(activeMytes)` once per game tick.

**Weather buffs** (`rainy_day`, `sunny_day`, `stormy`) are defined in `buffs.json` but not wired to a manager in this phase. They will be applied manually via a future WeatherManager. The buff definitions and exclusiveGroup are ready.

**Buff ID naming rule:**

Buff IDs must not share names with `getDerivedMood()` return values (`cozy`, `playful`, `lonely`, `anxious`, `bored`, `excited`, `happy`, `sleepy`, `exhausted`, `neutral`). Buffs are mechanical modifiers; mood labels are emotional state descriptors used by animation and UI. Using the same string for both causes semantic ambiguity in the debug overlay and code.

Rename these freestanding buff IDs to avoid the conflict:

| Old ID | New ID | Reason |
|--------|--------|--------|
| `cozy` | `well_settled` | `cozy` is a mood label |
| `playful` (mood_polarity buff) | `energized` | `playful` is a mood label |
| `lonely` | `socially_depleted` | `lonely` is a mood label |

Update all references to these IDs in: `buffs.json`, `MyteBuffController.js` trigger sites, the chip table in Phase 6, the coexistence table below, and Phase 13 cleanup list.

### Intentional buff coexistence (do not add conflict rules for these)

| Combo | Reason |
|-------|--------|
| `energized` + `night_fatigue` | Myte wants to play but fighting fatigue — visible internal conflict |
| `thrilled` + `anxious` | Excitement despite low confidence — brief override, feels earned |
| `overstimulated` + `well_settled` | Overfussed but physically comfortable — nuanced valid state |
| `far_from_home` + `zone_play` | In a play zone but far from safety — competing pressures |
| `nourished` + `morning_energy` | Stacks naturally, feels rewarding |

### Verify
- Confirm `hungry` debuff appears in debug UI when hunger drops below 30%
- Confirm `starving` removes `hungry` and `nourished` when it applies
- Confirm `well_rested` is removed when `exhausted` applies
- Confirm `energized` removes `restless` when it applies
- Confirm `night_fatigue` applies between 10pm–6am and no other time-of-day buff is active simultaneously
- Confirm `TimeBuffManager` does not throw when no Mytes are active
- Confirm no buff ID matches any string returned by `getDerivedMood()`

---

## Phase 6 — Debug Snapshots + Derived Mood

**Depends on:** Phase 2

**Goal:** Debug snapshots clearly separate all layers. `DebugOverlayUI` consumes distinct snapshot methods. Remove the persistent mood meter and replace it with a read-only derived mood label.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `js/Myte/StateMachine.js`
- `js/UI/debug/DebugOverlayUI.js`
- `data/metadata/buffs.json`

### Changes

#### `js/Myte/MyteStats.js`

Replace the existing `getNeedsSnapshot()` with a version that returns only persistent needs:

```js
getNeedsSnapshot() {
    return {
        energy:      { value: this.energy,      max: this.maxEnergy,      ratio: this.getEnergyRatio() },
        hunger:      { value: this.hunger,      max: this.maxHunger,      ratio: this.getHungerRatio() },
        fun:         { value: this.fun,         max: this.maxFun,         ratio: this.getFunRatio() },
        social:      { value: this.social,      max: this.maxSocial,      ratio: this.getSocialRatio() },
        comfort:     { value: this.comfort,     max: this.maxComfort,     ratio: this.getComfortRatio() },
        environment: { value: this.environment, max: this.maxEnvironment, ratio: this.getEnvironmentRatio() }
    };
}
```

Add `getTraitsSnapshot()`:
```js
getTraitsSnapshot() {
    return {
        curiosity:   this.traits.curiosity,
        activity:    this.traits.activity,
        sensitivity: this.traits.sensitivity,
        sociability: this.traits.sociability,
        boldness:    this.traits.boldness,
        confidence:  { value: this.confidence, tier: this._getConfidenceTier(), floor: this.minConfidence }
    };
}

_getConfidenceTier() {
    if (this.confidence < 0.35) return 'low';
    if (this.confidence >= 0.70) return 'high';
    return 'medium';
}
```

#### `js/Myte/MyteAI.js`

Add `getDrivesSnapshot()` — returns last computed drives from context:
```js
getDrivesSnapshot() {
    const drives = this.lastContextSnapshot?.drives ?? {};
    return {
        restDrive:    drives.restDrive    ?? 0,
        eatDrive:     drives.eatDrive     ?? 0,
        playDrive:    drives.playDrive    ?? 0,
        socialDrive:  drives.socialDrive  ?? 0,
        exploreDrive: drives.exploreDrive ?? 0,
        comfortDrive: drives.comfortDrive ?? 0,
        safetyDrive:  drives.safetyDrive  ?? 0
    };
}
// Note: drives are post-weight (weights applied in _computeDrives) — matches actual scored values
```

Add `getPressuresSnapshot()`:
```js
getPressuresSnapshot() {
    const home = this.myte.getHomePosition?.();
    const pos = { x: this.myte.posX, y: this.myte.posY };
    const distanceFromHome = home ? Math.hypot(pos.x - home.x, pos.y - home.y) : 0;
    return {
        safetyPressure:      this.lastContextSnapshot?.drives?.safetyDrive ?? 0,
        familiarityPressure: Math.min(1, distanceFromHome / (this.config.safeAreaRadius ?? 200)),
        distanceFromHome:    Math.round(distanceFromHome)
    };
}
```

#### `js/UI/debug/DebugOverlayUI.js`

Update the debug overlay to render distinct sections using the new snapshot methods:

```js
// Replace existing single-section needs render with:
const needs     = myte.stats.getNeedsSnapshot();
const traits    = myte.stats.getTraitsSnapshot();
const drives    = myte.ai.getDrivesSnapshot();
const pressures = myte.ai.getPressuresSnapshot();
const buffs     = myte.buffs.getActiveBuffs();
const candidates = myte.ai.lastCandidateSnapshot;
```

Render sections in this order: **Needs → Traits + Confidence → Drives → Pressures → Active Buffs → Top Candidates**

#### Buff Display — Compact Chip System

The Active Buffs row is shared with the queue display and has limited horizontal space, especially on mobile. Use a two-mode rendering system to keep the row bounded regardless of how many buffs are active.

**Mode 1 — Group badges (for buffs with an `exclusiveGroup`)**

Each `exclusiveGroup` gets exactly one badge slot. If a buff in that group is active, the badge shows its short label. If none are active, the slot is empty (no badge rendered). Maximum 7 badges total (one per group). Because exclusive groups already guarantee only one buff per group is ever active, this is always bounded.

| Group | Badge slot label (use active buff's label, not the group name) |
|-------|--------------------------------------------------------------|
| `energy_tier` | Well Rested / Charged / Tired / Exhausted |
| `hunger_tier` | Nourished / Hungry / Starving |
| `mood_polarity` | Playful / Spirited / Gloomy |
| `confidence_polarity` | Confident / Anxious |
| `time_of_day` | Morning / Afternoon Slump / Night Fatigue |
| `weather` | Sunny / Rainy / Stormy |
| `zone` | Zone: Rest / Play / Social / Danger / Food / Boost |

**Mode 2 — Icon chips (for buffs without an `exclusiveGroup`)**

Freestanding buffs that don't belong to any exclusive group use compact abbreviation chips. Each chip is a small colored pill. Tap or hover to see the full buff name and description in a tooltip.

| Buff ID | Chip label | Color |
|---------|------------|-------|
| `overstimulated` | `OS` | red |
| `well_settled` | `WS` | green |
| `inspired` | `IN` | green |
| `socially_depleted` | `SD` | red |
| `soothed` | `ST` | green |
| `restless` | `RL` | orange |
| `thrilled` | `TH` | green |
| `far_from_home` | `FAR` | orange |
| `light_aura` | `LA` | grey |
| `music_aura` | `MA` | grey |
| `disturbed` | `DB` | red |

**Color encoding:**
- Green = net positive buff
- Red = debuff / negative pressure
- Orange = mixed / situational (not purely bad)
- Grey = ambient context effect (neutral, informational)

**Rendering order:** Group badges first (in fixed group order above), then icon chips sorted by valence (debuffs first, so problems are visible before the positives).

**Overflow guard:** If icon chips still overflow the row, clip to a `+N` indicator showing the count of hidden chips. Tapping `+N` opens a full buff list popover.

#### Derived Mood — `js/Myte/MyteStats.js`

**Remove:**
- `this.mood`, `this.maxMood`, `this.minMood`, `this.moodDecayRate`
- `this.currentMood`, `this.moodTimeout`
- `this.moodSyncRate`, `this.moodSyncMultiplier`
- `setMood()`, `handleMoodEffects()`, `getMoodRatio()`, `updateMood()`
- `this.moods` config object

**Add `getDerivedMood()`** — pure function, no side effects:

```js
getDerivedMood() {
    const e = this.getEnergyRatio();
    const f = this.getFunRatio();
    const s = this.getSocialRatio();
    const c = this.getComfortRatio();
    const conf = this.confidence;
    const far = this._lastDistanceFromHome > (this.safeAreaRadius ?? 200);

    // Priority order — first match wins
    if (e < 0.15 && f < 0.30) return 'exhausted';
    if (conf < 0.2 && far)    return 'anxious';
    if (s < 0.20 && c < 0.30) return 'lonely';
    if (f < 0.20)             return 'bored';
    if (e < 0.25)             return 'sleepy';
    if (c > 0.80 && e > 0.60) return 'cozy';
    if (f > 0.75 && e > 0.60) return 'playful';
    if (s > 0.80 && c > 0.60) return 'happy';
    if (f > 0.85 && s > 0.70) return 'excited';
    return 'neutral';
}
```

Store `_lastDistanceFromHome` — update it from `MyteAI` context each tick.

**Replace all `getMoodRatio()` call sites** with the nearest equivalent need ratio:
- Buff triggers using `moodRatio` → update to the appropriate need ratio (see buff updates below)
- Any scoring using `moodRatio` → use `getFunRatio()` or `getComfortRatio()` as appropriate

#### Derived Mood — `js/Myte/StateMachine.js`

Replace any `currentMood` string checks with `myte.stats.getDerivedMood()` calls. Animation states and expressions key off the derived mood label.

The speed multipliers previously provided by `mood_happy`, `mood_excited`, `mood_sleepy`, `mood_sad`, `mood_grumpy` hidden buffs must now be handled directly in `getSpeed()` in `MyteStats`:

```js
getSpeed() {
    const baseSpeed = this.myte.speed ?? 1;
    const buffMultiplier = this.myte.buffs?.getEffectValue('movement.speedMultiplier', 1) ?? 1;
    const moodMultiplier = this._getMoodSpeedMultiplier();
    return baseSpeed * buffMultiplier * moodMultiplier;
}

_getMoodSpeedMultiplier() {
    switch (this.getDerivedMood()) {
        case 'excited':   return 1.5;
        case 'happy':     return 1.2;
        case 'playful':   return 1.1;
        case 'cozy':      return 0.95;
        case 'bored':     return 0.95;
        case 'sleepy':    return 0.7;
        case 'lonely':    return 0.85;
        case 'exhausted': return 0.65;
        case 'anxious':   return 0.92;
        default:          return 1.0;
    }
}
```

#### Derived Mood — `data/metadata/buffs.json`

**Remove these hidden buffs entirely** — replaced by `_getMoodSpeedMultiplier()`:
- `mood_happy`, `mood_excited`, `mood_sleepy`, `mood_sad`, `mood_grumpy`

**Update `struggling` trigger** — remove `mood < 8` condition; replace with needs-based:
```json
"triggers": {
  "status": {
    "anyConditions": [
      { "stat": "energyRatio", "lte": 0.08 },
      { "stat": "funRatio", "lte": 0.08 },
      { "stat": "socialRatio", "lte": 0.08 }
    ]
  }
}
```

**Update `spirited` trigger** — replace `moodRatio` with `funRatio`:
```json
{ "stat": "funRatio", "gte": 0.82 }
```

**Update `gloomy` trigger** — replace `moodRatio` with `funRatio` as primary proxy:
```json
{ "stat": "funRatio", "lte": 0.25 }
```

**Rename dead buff effect fields:**
- `moodDecayMultiplier` → `funDecayMultiplier`
- `moodPerMs` → `funPerMs`
- `moodBoost` in instantEffects → `funBoost`
- `moodSyncMultiplier` → remove from all buff effects

#### Derived Mood — `js/UI/debug/DebugOverlayUI.js`

Show derived mood as a label in the Traits section: `Mood: ${myte.stats.getDerivedMood()}`. Do not show it as a meter or ratio value.

### Verify
- Open debug overlay. Confirm 6 needs are listed separately from traits.
- Confirm confidence shows as both a value and a tier label (low/medium/high).
- Confirm drives section shows all 7 drive values.
- Confirm pressures section shows safetyPressure and distanceFromHome.
- With multiple buffs active: confirm group badges never show more than one badge per group.
- Confirm icon chips show correct 2–3 letter label and color.
- Confirm tapping/hovering a chip shows full buff name and description.
- Confirm `+N` overflow indicator appears when chips exceed available width.
- Confirm `currentMood` and `getMoodRatio()` no longer exist on `MyteStats`.
- Confirm animation/expression system still changes based on derived mood.
- Confirm `excited` Mytes move faster, `sleepy` Mytes move slower.
- Confirm hidden `mood_*` buffs no longer appear in debug overlay.
- No console errors from removed mood system.

---

## Phase 7 — Candidate Scoring Audit

**Depends on:** Phase 1, Phase 2, Phase 3

**Goal:** All candidate builders use drive values and action metadata. All old terminology removed from builder logic.

### Files
- `js/Myte/MyteAI.js`

### Changes

Audit every candidate builder. Apply these rules uniformly:

**Remove from all builders:**
- Any inline stat ratio calculations (replace with `context.drives.*`)
- Any references to `boredom`, `lightNeed`, `musicNeed`, `homeNeed`, `enrichment`
- Any hardcoded action ID strings for scoring (use metadata tags instead)

**Rename:**
- `buildEmergencyHomeCandidate()` → `buildSafeReturnCandidate()`
- `homeRadius` references → `safeAreaRadius`
- Score variable names referencing old need names → use drive names

**Per-builder rules:**

| Builder | Primary drive | Confidence gate | Special rules |
|---------|--------------|-----------------|---------------|
| `buildRestCandidate()` | `restDrive` | none | Keep exhaustion emergency path unchanged |
| `buildEatCandidate()` (new) | `eatDrive` | none | Wire to hunger need; target food objects and food zones |
| `buildSocialCandidate()` | `socialDrive` | medium+ for strangers, low+ for known | Gate by `objectMemories` — unknown Mytes blocked at low confidence |
| `buildPlayCandidate()` | `playDrive` | low+ | Low confidence Mytes prefer familiar play objects/areas |
| `buildExploreCandidate()` | `exploreDrive` | medium+ | Action `risk > confidence * 5` skips that action |
| `buildWanderCandidate()` | `exploreDrive` | low+ | Wander radius = `safeAreaRadius * confidenceRadiusFactor` where low=0.3, medium=0.65, high=1.0 |
| `buildSafeReturnCandidate()` | `safetyDrive` | n/a | Never blocked by confidence gate |
| `buildDroppedItemCandidate()` | `exploreDrive + novelty` | low+ | Item novelty from `objectMemories` |
| `buildIdleCandidate()` | none | none | Always available; lowest possible score; when confidence is low and no other candidates pass, idle score is raised slightly so the Myte waits near home rather than trying to do something it can't |
| `buildNeedZoneCandidate()` | drive matching zone type | varies | Use zone `driveBoosts` to score |

**Add `buildEatCandidate()`** if it does not exist — new builder for the `eatDrive`.

---

### Repeat Penalty System

Replace the current blunt repeat penalty with a two-mode system: `"free"` (no penalty) and `"diminishing"` (standard increasing penalty). Remove the `"batch"` mode — drive-scaled leniency achieves the same effect with less machinery.

#### Scoring in `selectCandidate()`

```js
_getRepeatPenalty(actionId, context) {
    const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
    if (!def || def.repeatMode === 'free') return 1.0;

    const recentCount = this._getRecentRepeatCount(actionId);
    if (recentCount === 0) return 1.0;

    // When the relevant drive is high, the penalty is lenient — the Myte is motivated to keep going
    const relevantDrive = this._getRelevantDriveForAction(actionId, context.drives);
    const driveScale = 1 - (relevantDrive * 0.5); // high drive = up to 50% reduction in penalty
    const basePenalty = Math.max(0.1, 1.0 - (recentCount * 0.25));
    return Math.max(0.1, basePenalty + (1 - basePenalty) * (1 - driveScale));
}
```

When drive is high (0.8), `driveScale = 0.6`, making the repeat penalty lenient. A Myte watering many plants in a row with high `exploreDrive` does so naturally. When the drive drops, normal diminishing penalties apply.

**Same-target penalty** — prevents exact repetition regardless of mode:
```js
_getSameTargetPenalty(actionId, targetId) {
    const lastTarget = this._getLastTargetForAction(actionId);
    if (lastTarget && lastTarget === targetId) return 0.2;
    return 1.0;
}
```

Track `targetId` in `recentHistory` entries.

#### Relevant drive mapping

```js
_getRelevantDriveForAction(actionId, drives) {
    const tags = ActionDefinitionRegistry.getDefinitionSync(actionId)?.tags ?? [];
    if (tags.includes('food'))               return drives.eatDrive;
    if (tags.includes('playful'))            return drives.playDrive;
    if (tags.includes('social'))             return drives.socialDrive;
    if (tags.includes('stimulating'))        return drives.exploreDrive;
    if (tags.includes('purposeful_movement')) return drives.exploreDrive;
    return 0;
}
```

**Also remove `batchCeiling` and `batchDriveThreshold` from action metadata** (Phase 1). Keep `repeatMode` but only use values `"free"` and `"diminishing"`. Update the action table accordingly — all `"batch"` entries become `"diminishing"`.

**Drive weighting note:** Drive weights are applied inside `_computeDrives()` (Phase 2). The value in `context.drives.xDrive` is already weighted — do not multiply by weights again in scoring.

### Verify
- Myte with high `eatDrive` actively seeks food objects
- Myte with low confidence never wanders past 30% of safeAreaRadius
- `buildSafeReturnCandidate` works as before; confirm no reference to old home emotional need
- No references to `boredom`, `lightNeed`, `homeNeed` remain in `MyteAI.js`
- Myte watering multiple plants does so consecutively when drive is high, then naturally diversifies as drive drops

---

## Phase 8 — Config/Data-Driven Audit

**Depends on:** All phases above

**Goal:** No magic numbers remain in AI, stats, or scoring code. All tuning values live in config.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `data/mytes/myte.json`

### Changes

#### Magic numbers to move from `MyteStats.js` into `data/mytes/myte.json` under `stats`:

| Current value | Config key |
|--------------|------------|
| Need decay rates for energy, hunger, fun, social, comfort, environment | `energyDecayRate`, `hungerDecayRate`, `funDecayRate`, `socialDecayRate`, `comfortDecayRate`, `environmentDecayRate` |
| Exhaustion threshold (`0.02` energyRatio) | `exhaustionThreshold` |
| Exhaustion recovery threshold | `exhaustionRecoveryThreshold` |
| Comfort blend rate (`0.0016`) | `comfortBlendRate` |
| Energy crossover from eating (`0.05`) | `eatEnergyBonus` |

#### Magic numbers to move into `data/mytes/myte.json` under `ai`:

| Current value | Config key |
|--------------|------------|
| `boredomDelta` rates (`0.0022`, `0.0034`, `0.0006`, `0.0042`, `0.0008`, `0.0002`) | `funDeltaRates.resting`, `funDeltaRates.stimulating`, `funDeltaRates.movement`, `funDeltaRates.idle`, `funDeltaRates.default`, `funDeltaRates.moving` |
| Think intervals | `baseThinkInterval`, `minThinkInterval`, `maxThinkInterval` |
| `minCandidateScore` | `minCandidateScore` |
| Memory duration | `memoryDuration` |
| Target cooldown | `targetCooldownDuration` |
| Wander radius | `wanderRadius` |
| Social radius | `socialRadius` |
| Object search radius | `objectSearchRadius` |
| Confidence radius factors per tier | `confidenceRadiusFactors: { low: 0.3, medium: 0.65, high: 1.0 }` |
| Action result scale factor (`0.55`) | `noteBehaviorScale` |

All config values must be read in constructors and stored on `this`. Never read from config mid-loop.

### Verify
- Change a decay rate in `myte.json` and confirm the game behavior changes
- Change `noteBehaviorScale` and confirm stat deltas scale proportionally
- Grep for numeric literals like `0.0022`, `0.0034`, `0.0016`, `0.0042`, `0.55` in `MyteStats.js` and `MyteAI.js` — confirm they no longer exist as inline constants

---

## Phase 9 — Battery UI + Sound Cooldown Decoupling *(Deferred)*

**Status:** Deferred. Not part of the current refactor scope.

`MyteStats` mixes stat data with battery display state and sound cooldown timers. This separation is a good clean-up but carries non-trivial UI regression risk and is independent of the behavioral system changes. Tackle it in a separate pass after all behavioral phases are stable.

When ready: battery display should read `myte.stats.getEnergyRatio()` and own its own state; sound cooldowns should live on `Myte.js` or a `MyteSoundController`. `MyteStats` should not reference DOM elements or audio methods.

---

## Phase 10 — Species Personality Defaults

**Depends on:** Phase 2, Phase 3

**Goal:** Each species declares its own trait starting values and starting confidence.

### Files
- `data/mytes/myte.json` (base definition)
- `data/mytes/*.json` (all species files)

### Changes

#### `data/mytes/myte.json` — update base traits block

```json
"traits": {
    "curiosity":    { "default": 0.5, "min": 0.1, "max": 0.9 },
    "activity":     { "default": 0.5, "min": 0.1, "max": 0.9 },
    "sensitivity":  { "default": 0.5, "min": 0.1, "max": 0.9 },
    "sociability":  { "default": 0.5, "min": 0.0, "max": 1.0 },
    "boldness":     { "default": 0.5, "min": 0.0, "max": 1.0 }
},
"stats": {
    "confidence": { "default": 0.5 }
}
```

Remove any reference to `neediness` from trait config.

#### Each species file (`data/mytes/*.json`)

Override traits and starting confidence to give the species a distinct personality. Example archetypes:

```json
// Explorer species
"traits": {
    "curiosity":   { "default": 0.85 },
    "activity":    { "default": 0.6  },
    "sensitivity": { "default": 0.3  },
    "sociability": { "default": 0.3  },
    "boldness":    { "default": 0.75 }
},
"stats": { "confidence": { "default": 0.55 } }

// Social butterfly species
"traits": {
    "curiosity":   { "default": 0.4  },
    "activity":    { "default": 0.5  },
    "sensitivity": { "default": 0.7  },
    "sociability": { "default": 0.9  },
    "boldness":    { "default": 0.5  }
},
"stats": { "confidence": { "default": 0.6 } }

// Anxious homebody species
"traits": {
    "curiosity":   { "default": 0.25 },
    "activity":    { "default": 0.3  },
    "sensitivity": { "default": 0.8  },
    "sociability": { "default": 0.5  },
    "boldness":    { "default": 0.15 }
},
"stats": { "confidence": { "default": 0.25 } }
```

**Boldness and confidence interact:** A timid species (`boldness: 0.15`) with low starting confidence crumbles quickly under scary events and rebuilds very slowly. A bold species (`boldness: 0.75`) bounces back fast and has a confidence floor of 0.15 — it can never become completely paralyzed.

#### `js/Myte/MyteStats.js`

In `resolveTraitValue()`, read `.default` from the trait config object if present:
```js
resolveTraitValue(config) {
    if (typeof config === 'number') return Math.max(0, Math.min(1, config));
    if (typeof config === 'object' && config !== null) return Math.max(config.min ?? 0, Math.min(config.max ?? 1, config.default ?? 0.5));
    return 0.5;
}
```

Apply the same pattern for `confidence`:
```js
const confConfig = statConfig.confidence;
this.confidence = typeof confConfig === 'object' ? confConfig.default ?? 0.5 : confConfig ?? 0.5;
```

### Verify
- Create two Myte species with very different trait configs. Confirm they behave differently in autonomous mode.
- A high-confidence species immediately explores and uses portals/chests.
- A low-confidence species stays near its home area until confidence builds.

---

## Phase 11 — Cleanup + Naming Audit

**Depends on:** All phases above complete and stable

**Goal:** Remove all legacy concepts, stale code, and naming inconsistencies.

### Grep for and remove all occurrences of:

```
boredom              (as a stat — getBoredomRatio alias may remain briefly then remove)
lightNeed
musicNeed
homeNeed
enrichment           (if still present as standalone stat or need)
isStimulating        (as array declaration)
isPlayful            (as array declaration)
isSocial             (as array declaration)
isPurposefulMovement (as array declaration)
currentMood          (as stored property)
getMoodRatio
setMood
handleMoodEffects
moodDecayRate
moodSyncRate
moodSyncMultiplier
moodTimeout
this.moods           (the config object)
neediness            (in trait config or code — replaced by sensitivity)
traits.neediness     (in any drive or scoring code)
mood_happy           (buff ID reference)
mood_excited
mood_sleepy
mood_sad
mood_grumpy
socialDrive.*sensitivity  (old formula without sociability — confirm updated everywhere)
```

### Additional cleanup:

- Remove `getBoredomRatio()` alias added in Phase 2 (used only as transition shim)
- Remove `applyActivityEffects()` if fully replaced by tag-based logic
- Remove any `TODO`, `LEGACY`, or `DEPRECATED` comments left during earlier phases
- Remove duplicate stat update paths if both old `noteBehavior()` and new `applyActionResult()` coexist
- Validate all buff stat field names in `buffs.json` — no `moodDecayMultiplier`, `moodSyncMultiplier`, `moodPerMs`, `moodBoost` should remain
- Confirm no buff ID matches any return value of `getDerivedMood()` — grep buff IDs against: `cozy`, `playful`, `lonely`, `anxious`, `bored`, `excited`, `happy`, `sleepy`, `exhausted`, `neutral`
- Confirm old buff IDs `cozy`, `lonely`, `playful` (mood_polarity group) have been replaced by `well_settled`, `socially_depleted`, `energized` everywhere
- Remove any inline numeric drive weights — weights live in config and are applied only inside `_computeDrives()`
- Confirm no stale `_batchSessionActive` or `_batchSessionCounts` references remain (batch mode was removed in Phase 8 — repeat penalty is drive-scaled only)

Update all `objectMemories.get(id)` read sites — they currently expect a timestamp number. Update them to read `.lastVisited` instead: `objectMemories.get(id)?.lastVisited ?? 0`.

### Verify
- Run a global grep for each term in the list above — confirm zero results in `js/Myte/` and `data/`
- Play the game for 5+ minutes in autonomous mode with multiple Mytes
- Confirm debug overlay shows: Needs / Traits + Confidence / Drives / Pressures / Buffs / Candidates — all clearly separate
- Confirm no console errors or undefined property accesses
- Confirm emergency return, rest, social, play, and explore behaviors all still function
- Confirm `objectMemories` entries are objects with `lastVisited`, `visitCount`, `valence` fields — not raw timestamps

---

## Future Considerations — DO NOT IMPLEMENT

These are architectural hooks for future work. The phases above establish clean extension points for them. Do not implement any of the following as part of this spec.

**Memory-aware scoring:** `objectMemories` already tracks recency. Future: track emotional context per object (did it scare me? did it boost confidence?) and weight candidate scoring accordingly.

**Hunger system depth:** Food spoilage, food preferences per species, hunger-driven foraging path planning.

**Familiarity zones:** Areas visited frequently become "familiar" — reduce safetyDrive, preferred by low-confidence Mytes. Tied to `familiarityPressure`.

**Crowding / noise pressure:** Multiple objects with high `noiseLevel` in range reduce `environment` need faster. The architecture supports this via `environmentEffects` on objects.

**Relationship system:** Mytes track individual relationships (familiarity, affection, rivalry). Gates which social actions are generated with which targets.

**Weather system:** `WeatherManager` applies `rainy_day`, `sunny_day`, `stormy` context buffs. Buff definitions are ready; just needs the manager.

**Seasonal / time-of-day drive weight modifiers:** `restDrive` weight amplified at night via config overrides. `TimeBuffManager` is already in place; drive weight modifiers could be time-conditional.

**Interaction history per object type:** "I've interacted with 3 flowers today" reduces novelty for additional flowers. Extend repeat penalty system from instances to types.

**Trait evolution:** Very slow long-term trait changes based on accumulated experience (e.g., many successful explorations slightly raises `curiosity` permanently).

After the core system is stable, consider adding:

- Long-term emotional memory: favorite objects, disliked objects, trusted Mytes, scary places, preferred zones
- Relationship memory between Mytes: familiarity, trust, rivalry, attachment, jealousy, avoidance
- Place attachment: Mytes gradually feel safer in areas they visit often
- Learned preferences: repeated positive outcomes make certain actions/objects more appealing
- Trauma/fear associations: scary events can make a Myte avoid a location, object type, or action temporarily
- Personality growth: traits shift slowly over time through repeated experiences, not random stat changes
- Species instincts: species-specific biases layered on top of universal drives
- Daily routines: loose habits that emerge from past behavior instead of fixed schedules
- Seasonal/weather behavior: rain, storms, heat, cold, darkness, holidays, etc.
- Social contagion: one Myte playing, panicking, resting, or eating can influence nearby Mytes
- Group behavior: following, gathering, crowding, parallel play, flocking, or avoiding crowded areas
- Better mood interpretation: mood should mostly summarize internal state, not duplicate needs or confidence
- Action variety rules: prevent Mytes from feeling robotic even when one drive dominates
- Tuning tools: debug graphs for needs, drives, confidence, buffs, and chosen candidates over time
- Balance presets: timid, clingy, reckless, lazy, curious, etc. test Mytes for tuning edge cases
- Performance budget: cache metadata lookups and limit expensive nearby-object scans if many Mytes exist