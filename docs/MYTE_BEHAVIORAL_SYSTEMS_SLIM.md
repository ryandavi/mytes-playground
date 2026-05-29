# Myte Behavioral Systems — Implementation Spec (Simplified)

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

### Layer 1 — Persistent Needs

Five needs drain continuously and are restored by actions or objects. All stored on `MyteStats`.

| Need | Drains from | Restored by |
|------|-------------|-------------|
| `energy` | time + action exertion | rest, sleep, eating (+5% crossover only) |
| `hunger` | time only | eating actions, drinking |
| `fun` | time, idle, purposeful movement | play, explore, novelty, social actions |
| `social` | time, prolonged isolation | greet, show_affection, watch, talk, play_tag |
| `comfort` | time, high-exertion actions, scary events | beds, flowers, being held, fountains, calming objects |

**Removed from the system:** `environment`, `home` (emotional need), `lightNeed`, `musicNeed`, `boredom`, `enrichment`. Objects that previously raised environment now raise `comfort` or `fun` directly.

### Layer 2 — Traits

Slow-moving personality values set per species. Do not drain. Change only through deliberate long-term mechanics outside this spec.

| Trait | Range | Effect |
|-------|-------|--------|
| `curiosity` | 0–1 | Scales `exploreDrive`; high = inspects and wanders more |
| `activity` | 0–1 | Scales `playDrive`; affects energy consumption rate |
| `sociability` | 0–1 | Scales `socialDrive`; adds baseline social drive even when social is full |
| `boldness` | 0–1 | Scales how fast confidence changes; high = gains faster, loses slower |

`confidence` is **not** a trait. See Layer 2b.

### Trait Pole Labels

| Trait | Low (0.0–0.25) | Mid (0.35–0.65) | High (0.75–1.0) |
|-------|----------------|-----------------|-----------------|
| `curiosity` | **Contented** — won't explore, predictable but dull | **Curious** | **Obsessive** — burns through novelty, can't settle |
| `activity` | **Lethargic** — rarely initiates play | **Active** | **Frantic** — burns out fast, hard to calm |
| `sociability` | **Reclusive** — tolerates isolation without distress | **Friendly** | **Clingy** — distressed when alone |
| `boldness` | **Timid** — scared easily, slow to rebuild confidence | **Steady** | **Reckless** — confidence barely drops, takes risks |

**Label resolution:** 0.0–0.25 = low label, 0.35–0.65 = mid label, 0.75–1.0 = high label.

**Where labels appear:**
- Debug overlay: each trait bar shows low label on left, high label on right
- Myte profile tooltip: 1–2 most extreme labels as personality tags (e.g. "Reckless · Clingy")

### Layer 2b — Confidence

A medium-term stat (0–1). No passive drain. Changes via `applyConfidenceDelta()`. Visible meter in debug UI. Starting value declared per species.

**Low confidence:** avoids actions with `risk > confidence * 5`. Stays near safe area. Prefers familiar objects.

**High confidence:** all candidates available. Explores far. Takes risky actions.

`boldness` scales the magnitude of all confidence changes — bold Mytes gain and lose confidence faster; timid Mytes change slowly.

### Layer 3 — Derived Drives

Computed each AI tick. Never stored — always recalculated from needs + traits + context.

| Drive | Formula | Generated actions |
|-------|---------|-------------------|
| `restDrive` | `energyDeficit` | sleep, simple_sleep, lie_down, sit, rest |
| `eatDrive` | `hungerDeficit` | eat_element, harvest, drink_fountain |
| `playDrive` | `funDeficit * max(0.15, curiosity * activity) * energyModifier` | run_laps, circle, zigzag, jump, dance, nudge_ball, play_tag, play_fetch |
| `socialDrive` | `(socialDeficit * (0.5 + sociability)) + (0.08 * sociability)` | greet, show_affection, watch, talk, play_tag |
| `exploreDrive` | `curiosity * max(curiosity * 0.2, noveltyHunger) * confidence * energyModifier` | inspect, deep_inspect, wander, dropped items |
| `comfortDrive` | `comfortDeficit` | beds, flowers, fountains, calming objects |
| `safetyDrive` | `(1 - confidence) * normalizedDistanceFromSafeArea * exhaustionModifier` | safe return |

**Definitions:**
- `xDeficit` = `1 - (current / max)` → 0.0 = full, 1.0 = empty
- `energyModifier` = `clamp(energy / maxEnergy, 0, 1)` — suppresses playDrive and exploreDrive when tired
- `noveltyHunger` = ratio of unvisited objects in range; floor = `curiosity * 0.2` when no objects present
- `normalizedDistanceFromSafeArea` = `clamp(distanceFromHome / safeAreaRadius, 0, 1)`
- `exhaustionModifier` = `1.0` normally; `2.0` when `isExhausted === true`

**`socialDrive` note:** `0.08 * sociability` adds a small baseline even when social is full. Reclusive Mytes (`sociability: 0.1`) generate 0.6× the drive of a deficit. Clingy Mytes (`sociability: 0.9`) generate 1.4× plus the baseline.

**`playDrive` note:** `max(0.15, curiosity * activity)` prevents extreme trait combinations collapsing the drive to near-zero.

**`exploreDrive` note:** Curiosity floor on `noveltyHunger` ensures curious Mytes always have some pull toward unexplored space.

### Mood/Buff Naming Convention

`getDerivedMood()` returns mood labels (`cozy`, `playful`, `lonely`, etc.) used by animation and UI. Buff IDs must not match these labels. Use: `well_settled` not `cozy`, `energized` not `playful`, `socially_depleted` not `lonely`.

---

### Preserved Systems

- Candidate scoring engine and `minCandidateScore` floor
- Affordance system (object availability, slot management)
- `objectMemories` Map (novelty/recency tracking, pruning)
- Repeat penalty system
- Emergency safe return behavior
- Action queue (priority, interrupt, sequence, ActionSync)
- Autonomy modes
- `noteBehavior()` call sites (standardized in Phase 1 but not removed)
- `BuffRegistry`, `MyteBuffController` (extended, not replaced)

---

## Action Tag Vocabulary

| Tag | Meaning | Replaces |
|-----|---------|---------|
| `stimulating` | Engages curiosity/novelty; raises fun | `isStimulating` array |
| `playful` | Physical or expressive play; raises fun | `isPlayful` array |
| `social` | Involves another Myte; raises social | `isSocial` array |
| `restful` | Lowers energy drain; raises energy | — |
| `comfort_giving` | Directly raises comfort | — |
| `soothing` | Calming; gently raises comfort | — |
| `purposeful_movement` | Directed movement; neutral fun impact | `isPurposefulMovement` array |
| `risky` | High confidence requirement | — |
| `food` | Restores hunger; small energy bonus | — |
| `creative` | Expressive; mild fun + comfort boost | — |

---

## Phase Dependencies

```
Phase 1 (Action Metadata)
    ├──→ Phase 2 (Needs + Drives)
    │         ├──→ Phase 3 (Confidence)
    │         │         └──→ Phase 4 (Object + Zone Metadata)
    │         └──→ Phase 6 (Debug Snapshots + Mood)
    └──→ Phase 5 (Buff System)  [also needs Phase 2 for stat names]
Phase 1 + 2 + 3 → Phase 7 (Candidate Scoring)
All above       → Phase 8 (Config Audit)
Phase 2 + 3     → Phase 9 (Species Defaults)
All above       → Phase 10 (Cleanup)
```

---

## Phase 1 — Action Metadata + Result Standardization

**Depends on:** nothing (implement first)

**Goal:** Every action declares its behavioral semantics. Replace hardcoded category arrays with metadata-driven lookups. Standardize how action completions and interruptions apply stat effects.

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

Add these fields to every action entry. All required; use `0` or `[]` for none.

```json
"tags": [],
"effects": {
  "fun": 0,
  "social": 0,
  "comfort": 0,
  "energy": 0,
  "hunger": 0
},
"exertion": 0,
"novelty": 0,
"risk": 0,
"soothingValue": 0,
"repeatMode": "diminishing"
```

**`repeatMode` values:**
- `"free"` — no repeat penalty; navigation, reactive, rest, social-receive actions
- `"diminishing"` — increasing penalty, reduced when the relevant drive is high

Apply these values per action:

| actionId | tags | effects (fun/social/comfort/energy/hunger) | exertion | novelty | risk | soothingValue | repeatMode |
|----------|------|--------------------------------------------|----------|---------|------|---------------|------------|
| `inspect` | `["stimulating"]` | 4/0/0/-1/0 | 1 | 6 | 1 | 0 | `"diminishing"` |
| `deep_inspect` | `["stimulating","risky"]` | 6/0/0/-2/0 | 1 | 8 | 2 | 0 | `"diminishing"` |
| `smell_flower` | `["stimulating","soothing","comfort_giving"]` | 5/0/4/-1/0 | 0 | 3 | 0 | 6 | `"diminishing"` |
| `drink_fountain` | `["soothing","food"]` | 3/0/2/3/5 | 0 | 2 | 0 | 4 | `"diminishing"` |
| `water_plant` | `["stimulating","creative"]` | 3/0/2/-1/0 | 1 | 2 | 0 | 1 | `"diminishing"` |
| `harvest` | `["stimulating","food"]` | 5/0/0/-1/10 | 1 | 3 | 0 | 0 | `"diminishing"` |
| `interact_object` | `["stimulating"]` | 4/0/0/-1/0 | 1 | 4 | 0 | 0 | `"diminishing"` |
| `open_chest` | `["stimulating","risky"]` | 10/0/0/-2/0 | 1 | 10 | 3 | 0 | `"diminishing"` |
| `eat_element` | `["food"]` | 2/0/0/5/20 | 0 | 2 | 0 | 2 | `"diminishing"` |
| `run_laps` | `["playful"]` | 8/0/-1/-5/0 | 5 | 2 | 0 | 0 | `"diminishing"` |
| `circle` | `["playful"]` | 6/0/0/-3/0 | 3 | 2 | 0 | 0 | `"diminishing"` |
| `zigzag` | `["playful"]` | 7/0/0/-4/0 | 4 | 3 | 0 | 0 | `"diminishing"` |
| `jump` | `["playful"]` | 5/0/0/-3/0 | 3 | 2 | 0 | 0 | `"diminishing"` |
| `dance` | `["playful","creative"]` | 8/2/0/-3/0 | 3 | 3 | 0 | 1 | `"diminishing"` |
| `play_tag` | `["playful","social"]` | 10/6/0/-5/0 | 5 | 4 | 0 | 0 | `"diminishing"` |
| `play_fetch` | `["playful","social"]` | 8/4/0/-4/0 | 4 | 3 | 0 | 0 | `"diminishing"` |
| `nudge_ball` | `["playful"]` | 6/0/0/-3/0 | 3 | 3 | 0 | 0 | `"diminishing"` |
| `show_affection` | `["social","comfort_giving","soothing"]` | 3/8/5/0/0 | 0 | 1 | 0 | 5 | `"diminishing"` |
| `greet` | `["social"]` | 2/6/0/0/0 | 0 | 2 | 1 | 0 | `"diminishing"` |
| `greet_receive` | `["social"]` | 1/4/0/0/0 | 0 | 1 | 0 | 0 | `"free"` |
| `watch` | `["social","stimulating"]` | 2/3/0/0/0 | 0 | 3 | 0 | 1 | `"diminishing"` |
| `talk` | `["social"]` | 3/7/1/0/0 | 0 | 2 | 1 | 0 | `"diminishing"` |
| `kiss` | `["social","comfort_giving"]` | 4/8/6/0/0 | 0 | 2 | 0 | 4 | `"diminishing"` |
| `go_to_object` | `["purposeful_movement"]` | -1/0/0/-2/0 | 2 | 0 | 0 | 0 | `"free"` |
| `astar-move` | `["purposeful_movement"]` | 0/0/0/-1/0 | 1 | 0 | 0 | 0 | `"free"` |
| `move` | `["purposeful_movement"]` | 0/0/0/-1/0 | 1 | 0 | 0 | 0 | `"free"` |
| `follow_object` | `["purposeful_movement","social"]` | 0/1/0/-2/0 | 2 | 0 | 0 | 0 | `"free"` |
| `sleep` | `["restful"]` | -2/0/8/30/0 | 0 | 0 | 0 | 8 | `"free"` |
| `simple_sleep` | `["restful"]` | 0/0/4/15/0 | 0 | 0 | 0 | 6 | `"free"` |
| `stretch` | `["restful","soothing"]` | 0/0/3/2/0 | 0 | 0 | 0 | 3 | `"free"` |
| `yawn` | `["restful"]` | 0/0/1/0/0 | 0 | 0 | 0 | 2 | `"free"` |
| `run_away` | `["purposeful_movement"]` | 0/0/-4/-5/0 | 5 | 0 | 0 | 0 | `"free"` |
| `hide` | `["restful","soothing"]` | 0/0/2/-1/0 | 0 | 0 | 0 | 2 | `"free"` |
| `carry_pickup` | `["social"]` | 0/0/-1/0/0 | 0 | 2 | 0 | 0 | `"free"` |
| `carry` | `["social"]` | 0/0/-2/0/0 | 0 | 1 | 0 | 0 | `"free"` |
| `being_carried` | `["social","comfort_giving"]` | 0/3/3/0/0 | 0 | 2 | 0 | 3 | `"free"` |
| `carry_putdown` | `["social"]` | 0/0/1/0/0 | 0 | 0 | 0 | 1 | `"free"` |
| `rest` | `["restful","comfort_giving"]` | 0/0/8/15/0 | 0 | 0 | 0 | 6 | `"free"` |
| `lie_down` | `["restful","soothing"]` | 0/0/5/5/0 | 0 | 0 | 0 | 5 | `"free"` |
| `sit` | `["restful"]` | 0/0/3/3/0 | 0 | 0 | 0 | 3 | `"free"` |
| `wander` | `["purposeful_movement"]` | 1/0/0/-1/0 | 1 | 2 | 0 | 0 | `"diminishing"` |

#### `js/Myte/MyteStats.js`

1. Delete these four arrays entirely:
   ```js
   const isStimulating = [...].includes(actionId);
   const isPlayful = [...].includes(actionId);
   const isSocial = [...].includes(actionId);
   const isPurposefulMovement = [...].includes(actionId);
   ```

2. In `applyActionCompletionEffects(actionId)`, replace category-based switch/if logic:
   ```js
   const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
   if (!def) return;
   const { effects = {}, tags = [] } = def;
   // apply effects using existing normalizeStatEffects / applyStatEffects
   ```

3. Replace inline category checks with tag lookups:
   ```js
   const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
   const tags = def?.tags ?? [];
   const isStimulating       = tags.includes('stimulating');
   const isPlayful           = tags.includes('playful');
   const isSocial            = tags.includes('social');
   const isPurposefulMovement = tags.includes('purposeful_movement');
   const isRestful           = tags.includes('restful');
   ```

4. Import `ActionDefinitionRegistry` at the top if not already present.

#### `js/Myte/Queue/Actions/BaseActions.js`

Add `buildActionResult(overrides = {})` to `MyteAction`:

```js
buildActionResult(overrides = {}) {
    const def = ActionDefinitionRegistry.getDefinitionSync(this.id);
    const base = def?.effects ?? {};
    return {
        funDelta:      base.fun     ?? 0,
        socialDelta:   base.social  ?? 0,
        comfortDelta:  base.comfort ?? 0,
        energyDelta:   base.energy  ?? 0,
        hungerDelta:   base.hunger  ?? 0,
        novelty:       def?.novelty      ?? 0,
        soothingValue: def?.soothingValue ?? 0,
        exertion:      def?.exertion     ?? 0,
        accomplishment: 0,
        scary:        false,
        safeOutcome:  true,
        failedOutcome: false,
        ...overrides
    };
}
```

In `MyteAction.complete()`: call `this.myte.stats.applyActionResult(this.buildActionResult())`. Subclasses override `buildActionResult(overrides)` for per-instance deltas.

In `MyteAction.interrupt()`: call `this.myte.stats.applyActionResult(this.buildActionResult({ safeOutcome: false, failedOutcome: true }))` if the action was meaningfully in-progress.

#### `js/Myte/MyteStats.js` — `applyActionResult()`

Add `applyActionResult(result)`:

```js
applyActionResult(result) {
    const scale = this.noteBehaviorScale ?? 0.55;

    if (result.funDelta)     this.updateFun(result.funDelta * scale);
    if (result.socialDelta)  this.updateSocial(result.socialDelta * scale);
    if (result.comfortDelta) this.updateComfort(result.comfortDelta * scale);
    if (result.energyDelta)  this.updateEnergy(result.energyDelta * scale);
    if (result.hungerDelta)  this.updateHunger(result.hungerDelta * scale);

    // Confidence change based on outcome
    if (result.failedOutcome) {
        this.applyConfidenceDelta(-0.04);
    } else if (result.safeOutcome) {
        this.applyConfidenceDelta(result.novelty > 3 ? 0.04 : 0.02);
    }

    this.myte.buffs?.checkStatusTriggers?.();
}
```

Update `noteBehavior()` to call `applyActionResult()` internally — do not break existing callers.

#### All action `complete()` methods

Replace ad-hoc stat delta calls with `this.buildActionResult({ ... })` overrides where the action has instance-specific deltas beyond what metadata provides.

### Verify
- Launch game in autonomous mode. Confirm behavior is unchanged after 2 minutes.
- No console errors from missing `ActionDefinitionRegistry` lookups.
- Grep for `isStimulating`, `isPlayful`, `isSocial`, `isPurposefulMovement` as array declarations — none exist.
- Each action type completes; stats change correctly.
- Failing an action reduces confidence slightly.

---

## Phase 2 — Needs + Drives Restructuring

**Depends on:** Phase 1

**Goal:** `MyteStats` holds 5 persistent needs and 4 traits. `MyteAI` computes drives separately. Remove `home` meter, `lightNeed`, `musicNeed`, `boredom`, `environment`. Add `hunger`.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `data/mytes/myte.json`

### Changes

#### `js/Myte/MyteStats.js`

**Add `hunger`:**
```js
this.maxHunger = statConfig.maxHunger ?? 100;
this.minHunger = 0;
this.hunger = statConfig.hunger ?? this.maxHunger;
this.hungerDecayRate = statConfig.hungerDecayRate ?? SiteConfig.stats.hungerDecayRate;
```

Add `getHungerRatio()`: `return this.hunger / this.maxHunger;`

In update loop: `this.hunger = Math.max(0, this.hunger - this.hungerDecayRate * deltaTime);`

**Remove:**
- `this.home` / `this.homeNeed` (emotional meter only — keep `getHomePosition()` and safe return behavior)
- `this.lightNeed`, `this.musicNeed`
- `this.environment`, `this.environmentDecayRate`, `getEnvironmentRatio()`
- `this.boredom`, `this.boredomDecayRate` (`fun` replaces it)
- `this.enrichment` if separate from `fun`

Rename `homeRadius` → `safeAreaRadius` everywhere in `MyteStats` and `MyteAI`.

**Traits — 4 traits, no sensitivity:**
```js
this.traits = {
    curiosity:   this.resolveTraitValue(traitConfig.curiosity),
    activity:    this.resolveTraitValue(traitConfig.activity),
    sociability: this.resolveTraitValue(traitConfig.sociability ?? 0.5),
    boldness:    this.resolveTraitValue(traitConfig.boldness    ?? 0.5)
};
```

Remove `sensitivity` and `neediness` entirely.

**Confidence as standalone stat:**
```js
this.confidence    = statConfig.confidence ?? 0.5;
this.maxConfidence = 1;
```

Add `applyConfidenceDelta(delta)`:
```js
applyConfidenceDelta(delta) {
    const scaled = delta * (0.5 + this.traits.boldness * 0.5);
    this.confidence = Math.max(0, Math.min(1, this.confidence + scaled));
}
```

`boldness` scales the rate: `boldness: 0.9` → 95% magnitude; `boldness: 0.1` → 55% magnitude. This is the only place `boldness` enters the math.

Add `getConfidenceRatio()`: `return this.confidence;`

**`resolveTraitValue(config)`:**
```js
resolveTraitValue(config) {
    if (typeof config === 'number') return Math.max(0, Math.min(1, config));
    if (typeof config === 'object' && config !== null)
        return Math.max(config.min ?? 0, Math.min(config.max ?? 1, config.default ?? 0.5));
    return 0.5;
}
```

**Backward-compat shim (remove in Phase 10):**
```js
getBoredomRatio() { return 1 - this.getFunRatio(); }
```

#### `js/Myte/MyteAI.js` — `buildContext()`

Split into two methods:

```js
_buildNeedsSnapshot(myte) {
    const s = myte.stats;
    return {
        energyRatio:  s.getEnergyRatio(),
        hungerRatio:  s.getHungerRatio(),
        funRatio:     s.getFunRatio(),
        socialRatio:  s.getSocialRatio(),
        comfortRatio: s.getComfortRatio(),
        confidence:   s.confidence,
        traits: {
            curiosity:   s.traits.curiosity,
            activity:    s.traits.activity,
            sociability: s.traits.sociability,
            boldness:    s.traits.boldness
        }
    };
}

_computeDrives(needs, spatialContext) {
    const { energyRatio, hungerRatio, funRatio, socialRatio, comfortRatio, confidence, traits } = needs;
    const { normalizedDistanceFromSafeArea, isExhausted, noveltyHunger } = spatialContext;

    const energyDeficit  = 1 - energyRatio;
    const hungerDeficit  = 1 - hungerRatio;
    const funDeficit     = 1 - funRatio;
    const socialDeficit  = 1 - socialRatio;
    const comfortDeficit = 1 - comfortRatio;
    const energyModifier     = Math.max(0, energyRatio);
    const exhaustionModifier = isExhausted ? 2.0 : 1.0;
    const effectiveNoveltyHunger = Math.max(traits.curiosity * 0.2, noveltyHunger);

    const drives = {
        restDrive:    energyDeficit,
        eatDrive:     hungerDeficit,
        playDrive:    funDeficit * Math.max(0.15, traits.curiosity * traits.activity) * energyModifier,
        socialDrive:  (socialDeficit * (0.5 + traits.sociability)) + (0.08 * traits.sociability),
        exploreDrive: traits.curiosity * effectiveNoveltyHunger * confidence * energyModifier,
        comfortDrive: comfortDeficit,
        safetyDrive:  (1 - confidence) * normalizedDistanceFromSafeArea * exhaustionModifier
    };

    const weights = this.config?.driveWeights ?? {};
    for (const key of Object.keys(drives)) drives[key] *= (weights[key] ?? 1.0);

    return drives;
}
```

Call both from `buildContext()`. Attach result to `context.needs` and `context.drives`. All candidate builders read from `context.drives.xDrive`.

#### `data/mytes/myte.json`

Add to `ai`:
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

Add to `stats`:
```json
"maxHunger": 100,
"hunger": 100,
"hungerDecayRate": 0.003
```

Replace `neediness` and `sensitivity` in traits config with `sociability` and `boldness`.

### Verify
- `MyteStats` has no `lightNeed`, `musicNeed`, `boredom`, `home` meter, `enrichment`, `environment`
- `hunger` drains over time; Myte eventually seeks food
- `confidence` accessible as `myte.stats.confidence` (not inside `traits`)
- `context.drives` has all 7 values
- No regressions in emergency return, rest, or social behavior

---

## Phase 3 — Confidence

**Depends on:** Phase 2

**Goal:** Confidence gates risky candidates and changes from experiences.

### Files
- `js/Myte/MyteAI.js`

### Changes

`applyConfidenceDelta(delta)` is already added in Phase 2. No new stat methods needed.

#### `js/Myte/MyteAI.js`

**Risk gate in every candidate builder:**
```js
const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
const risk = def?.risk ?? 0;
if (risk > context.needs.confidence * 5) return null;
```

At `confidence: 0.5`, actions with `risk > 2` are skipped. At `confidence: 0.8`, `risk > 4` are skipped.

**Wander radius scales with confidence:**
```js
const wanderRadius = safeAreaRadius * (0.3 + context.needs.confidence * 0.7);
```

No tier lookup. Low confidence (0.0) = 30% radius. High confidence (1.0) = 100% radius.

**Social gating:**
- Unknown Myte (not in `objectMemories`): skip if `confidence < 0.5`
- Known Myte: always allowed

**Scary object detection:**

During context building, if any nearby object has `scaryStrength > 0` and is within interaction range:
```js
this._scaryObjectDetectedThisTick = true;
this.myte.stats.applyConfidenceDelta(-0.05);
```

`_scaryObjectDetectedThisTick` resets to `false` at the start of each tick. Fire confidence delta at most once per tick regardless of how many scary objects are nearby.

**Confidence changes from action outcomes** are already wired in Phase 1's `applyActionResult()`:
- Normal success: `+0.02` (scaled by boldness)
- High-novelty success (novelty > 3): `+0.04`
- Failure/interrupt: `-0.04`

No additional confidence hooks needed.

### Verify
- Myte with `confidence: 0.2` does not generate `open_chest` or far-explore candidates
- Myte with `confidence: 0.2` wanders only ~30% of safe area radius
- Unknown Mytes avoided when confidence < 0.5
- Completing actions slowly increases confidence; scary objects reduce it
- Bold Mytes change confidence faster than timid ones (same event, different magnitude)

---

## Phase 4 — Object Metadata + Zone Need Effects

**Depends on:** Phase 2

**Goal:** Map objects declare their behavioral effects. Zones apply simple per-tick need adjustments read from a data file. Neither system feeds back into AI drive scoring.

### Files
- `js/Map/MapObjects/BaseMapObject.js` (or equivalent base class)
- `js/Map/GameZone.js`
- `data/metadata/zones.json` (new file)

### Changes

#### `js/Map/MapObjects/BaseMapObject.js`

Add these optional fields to the object definition structure. All default to `0` or `[]`:

```js
// All optional — defaults if not declared
aiTags:          [],  // string[] — hints for candidate scoring e.g. ['cozy', 'scary']
comfortEffect:   0,   // passive comfort per second when Myte is nearby (positive or negative)
confidenceEffect: 0,  // confidence delta per second when Myte is nearby (negative = scary)
noveltyValue:    0,   // 0–10; higher = more interesting to inspect
scaryStrength:   0,   // 0–10; triggers confidence penalty when Myte is nearby (Phase 3)
```

Add `getAIMetadata()` returning these fields.

In `MyteAI.buildContext()`, iterate nearby objects:
- If any has `scaryStrength > 0` within interaction range → set `_scaryObjectDetectedThisTick = true` and apply confidence delta (Phase 3)
- Accumulate `noveltyValue` contributions to the area novelty estimate for `noveltyHunger`

The `comfortEffect` field is for passive ambient comfort (being near, not interacting). Use sparingly — most comfort comes from action `effects.comfort` on interaction. Reserve non-zero `comfortEffect` for objects with a strong ambient presence (a lit campfire, a cozy lamp).

#### `data/metadata/zones.json` (new file)

Zones declare which needs they affect per millisecond. No drive multipliers, no buff IDs, no AI scoring interaction.

```json
{
  "schemaVersion": 1,
  "zones": [
    {
      "id": "rest",
      "label": "Rest Zone",
      "needEffectsPerMs": { "comfort": 0.0008, "energy": 0.0004 }
    },
    {
      "id": "play",
      "label": "Play Zone",
      "needEffectsPerMs": { "fun": 0.0010 }
    },
    {
      "id": "social",
      "label": "Social Zone",
      "needEffectsPerMs": { "social": 0.0008 }
    },
    {
      "id": "danger",
      "label": "Danger Zone",
      "needEffectsPerMs": { "comfort": -0.0006 }
    },
    {
      "id": "food",
      "label": "Food Zone",
      "needEffectsPerMs": { "hunger": 0.0002 }
    },
    {
      "id": "boost",
      "label": "Boost Zone",
      "needEffectsPerMs": {}
    }
  ]
}
```

Add new zone types here. The code reads whatever is in this file — no code changes required for new zone types.

#### `js/Map/GameZone.js`

Import zone definitions as a plain object — no registry needed:

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

Replace the body of `update(myte, deltaTime)` with:
```js
const zoneDef = this._getZoneDef();
if (!zoneDef?.needEffectsPerMs) return;
myte.stats.applyStatEffectsPerMs(zoneDef.needEffectsPerMs, deltaTime);
```

Remove these methods entirely — their logic is now in data:
- `applyRestZoneEffects()`
- `applyPlayZoneEffects()`
- `applyFoodZoneEffects()`
- `applySocialZoneEffects()`
- `applyDangerZoneEffects()`
- `applyBoostZoneEffects()`

**Zones do not:**
- Boost or multiply AI drives
- Apply buffs
- Affect confidence
- Feed into candidate scoring

Zones are passive environmental effects only. The AI makes decisions from needs and drives; zones nudge needs slowly in the background.

### Verify
- Myte resting in a rest zone has comfort and energy restore slightly faster than outside it
- Myte in danger zone has comfort drain faster
- `applyRestZoneEffects()` etc. no longer exist in `GameZone.js`
- No console errors from missing zone definitions
- Adding a new zone type to `zones.json` works without any code changes
- `getAIMetadata()` returns default values when fields are not declared on an object

---

## Phase 5 — Buff System

**Depends on:** Phase 1, Phase 2

**Goal:** Add hunger buffs. Fix existing triggers broken by Phase 2. Remove mood-related fields. Keep the buff system simple — no exclusive groups, no cancellation graphs, no time or weather buffs.

### Files
- `data/metadata/buffs.json`
- `js/Myte/MyteBuffController.js`
- `js/Engine/BuffRegistry.js`

### Changes

#### `data/metadata/buffs.json` — Add hunger buffs

```json
{
  "id": "hungry",
  "label": "Hungry",
  "kind": "debuff",
  "priority": 65,
  "durationMs": 0,
  "cancellable": false,
  "icon": "HG",
  "description": "Growing hunger makes it harder to focus.",
  "effects": {
    "stats": { "funDecayMultiplier": 1.06 }
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
  "priority": 95,
  "durationMs": 0,
  "cancellable": false,
  "icon": "SV",
  "description": "Severe hunger. Eating becomes the only priority.",
  "effects": {
    "movement": { "speedMultiplier": 0.88 },
    "stats": { "funDecayMultiplier": 1.15 }
  },
  "triggers": {
    "status": {
      "conditions": [{ "stat": "hungerRatio", "lte": 0.05 }]
    }
  }
}
```

#### `data/metadata/buffs.json` — Fix existing buffs

**Fix `restless` trigger** — rename from `boredomRatio` to `funRatio` (inverted):
```json
"triggers": {
  "status": {
    "conditions": [{ "stat": "funRatio", "lte": 0.28 }]
  }
}
```

**Fix `spirited` trigger** — replace `moodRatio` with `funRatio`:
```json
{ "stat": "funRatio", "gte": 0.82 }
```

**Fix `gloomy` trigger** — replace `moodRatio` with `funRatio`:
```json
{ "stat": "funRatio", "lte": 0.25 }
```

**Fix `struggling` trigger** — replace `mood < 8` with needs-based:
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

**Update `light_aura` effects** — remove `environmentPerMs`; apply `comfortPerMs` instead:
```json
"light_aura": {
  "effects": { "stats": { "comfortPerMs": 0.00012 } }
}
```

**Update `music_aura` effects** — remove `environmentPerMs`; apply `funPerMs` and `comfortPerMs`:
```json
"music_aura": {
  "effects": { "stats": { "funPerMs": 0.00012, "comfortPerMs": 0.00006 } }
}
```

**Rename dead mood effect fields in all buff entries:**
- `moodDecayMultiplier` → `funDecayMultiplier`
- `moodPerMs` → `funPerMs`
- `moodBoost` → `funBoost`
- `moodSyncMultiplier` → remove entirely

**Rename buff IDs to avoid conflict with `getDerivedMood()` return values:**

| Old ID | New ID | Reason |
|--------|--------|--------|
| `cozy` | `well_settled` | `cozy` is a mood label |
| `playful` (buff) | `energized` | `playful` is a mood label |
| `lonely` | `socially_depleted` | `lonely` is a mood label |

Update all references in `buffs.json`, `MyteBuffController.js` trigger sites, and Phase 10 cleanup list.

**Do not add:** exclusive groups, cancellation (`cancels` field), time-of-day buffs, weather buffs, zone buffs, or a `far_from_home` buff. These are not part of this refactor.

### Verify
- `hungry` appears when hungerRatio drops below 0.3
- `starving` appears when hungerRatio drops below 0.05
- `restless` appears when funRatio drops below 0.28
- `spirited` triggers at funRatio ≥ 0.82
- No buff ID matches any string returned by `getDerivedMood()`
- `light_aura` applies `comfortPerMs`; `music_aura` applies `funPerMs` + `comfortPerMs`
- No `environmentPerMs` references remain in buff effects

---

## Phase 6 — Debug Snapshots + Derived Mood

**Depends on:** Phase 2

**Goal:** Snapshots clearly separate all layers. Remove the persistent mood meter. Replace with a read-only derived mood label.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `js/Myte/StateMachine.js`
- `js/UI/debug/DebugOverlayUI.js`
- `data/metadata/buffs.json`

### Changes

#### `js/Myte/MyteStats.js`

Replace existing `getNeedsSnapshot()`:
```js
getNeedsSnapshot() {
    return {
        energy:  { value: this.energy,  max: this.maxEnergy,  ratio: this.getEnergyRatio() },
        hunger:  { value: this.hunger,  max: this.maxHunger,  ratio: this.getHungerRatio() },
        fun:     { value: this.fun,     max: this.maxFun,     ratio: this.getFunRatio() },
        social:  { value: this.social,  max: this.maxSocial,  ratio: this.getSocialRatio() },
        comfort: { value: this.comfort, max: this.maxComfort, ratio: this.getComfortRatio() }
    };
}
```

Add `getTraitsSnapshot()`:
```js
getTraitsSnapshot() {
    return {
        curiosity:   this.traits.curiosity,
        activity:    this.traits.activity,
        sociability: this.traits.sociability,
        boldness:    this.traits.boldness,
        confidence:  this.confidence
    };
}
```

**Remove mood meter:**
- `this.mood`, `this.maxMood`, `this.moodDecayRate`
- `this.currentMood`, `this.moodTimeout`
- `this.moodSyncRate`, `this.moodSyncMultiplier`
- `setMood()`, `handleMoodEffects()`, `getMoodRatio()`, `updateMood()`
- `this.moods` config object

**Add `getDerivedMood()`** — pure function, no side effects:
```js
getDerivedMood() {
    const e    = this.getEnergyRatio();
    const f    = this.getFunRatio();
    const s    = this.getSocialRatio();
    const c    = this.getComfortRatio();
    const conf = this.confidence;
    const far  = this._lastDistanceFromHome > (this.safeAreaRadius ?? 200);

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

Store `_lastDistanceFromHome` — update from `MyteAI` context each tick.

Replace all `getMoodRatio()` call sites with the nearest need ratio (`getFunRatio()` or `getComfortRatio()`).

#### `js/Myte/MyteAI.js`

Add `getDrivesSnapshot()`:
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
```

Add `getPressuresSnapshot()`:
```js
getPressuresSnapshot() {
    const home = this.myte.getHomePosition?.();
    const pos  = { x: this.myte.posX, y: this.myte.posY };
    const distanceFromHome = home ? Math.hypot(pos.x - home.x, pos.y - home.y) : 0;
    return {
        safetyPressure:   this.lastContextSnapshot?.drives?.safetyDrive ?? 0,
        distanceFromHome: Math.round(distanceFromHome)
    };
}
```

#### `js/Myte/StateMachine.js`

Replace `currentMood` string checks with `myte.stats.getDerivedMood()`. Animation and expressions key off the derived label.

Move speed multipliers into `getSpeed()` in `MyteStats`:
```js
getSpeed() {
    const base = this.myte.speed ?? 1;
    const buffMultiplier = this.myte.buffs?.getEffectValue('movement.speedMultiplier', 1) ?? 1;
    return base * buffMultiplier * this._getMoodSpeedMultiplier();
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

#### `data/metadata/buffs.json`

Remove these hidden buffs entirely — replaced by `_getMoodSpeedMultiplier()`:
- `mood_happy`, `mood_excited`, `mood_sleepy`, `mood_sad`, `mood_grumpy`

#### `js/UI/debug/DebugOverlayUI.js`

```js
const needs      = myte.stats.getNeedsSnapshot();
const traits     = myte.stats.getTraitsSnapshot();
const drives     = myte.ai.getDrivesSnapshot();
const pressures  = myte.ai.getPressuresSnapshot();
const buffs      = myte.buffs.getActiveBuffs();
const candidates = myte.ai.lastCandidateSnapshot;
```

Render sections: **Needs → Traits + Confidence → Drives → Pressures → Active Buffs → Top Candidates**

Show derived mood as a label in the Traits section: `Mood: ${myte.stats.getDerivedMood()}`. Not a meter or ratio.

Active buffs: render as a plain list of labels. No chip system, no grouping system needed — buff count is naturally bounded in this simplified system.

### Verify
- Debug overlay shows 5 needs (no environment).
- Confidence shows as a numeric value (0–1). No tier label.
- Drives show all 7 values.
- `currentMood` and `getMoodRatio()` no longer exist on `MyteStats`.
- Speed changes with mood: excited = faster, sleepy = slower.
- Hidden `mood_*` buffs gone from debug overlay.
- No console errors from removed mood system.

---

## Phase 7 — Candidate Scoring Audit

**Depends on:** Phase 1, Phase 2, Phase 3

**Goal:** All candidate builders use drive values and action metadata. Legacy terminology removed.

### Files
- `js/Myte/MyteAI.js`

### Changes

**Remove from all builders:**
- Any inline stat ratio calculations → use `context.drives.*`
- Any references to `boredom`, `lightNeed`, `musicNeed`, `homeNeed`, `enrichment`, `environment`
- Any hardcoded action ID comparisons → use metadata tags

**Rename:**
- `buildEmergencyHomeCandidate()` → `buildSafeReturnCandidate()`
- `homeRadius` → `safeAreaRadius`

**Per-builder rules:**

| Builder | Primary drive | Confidence gate | Special rules |
|---------|--------------|-----------------|---------------|
| `buildRestCandidate()` | `restDrive` | none | Keep exhaustion emergency path unchanged |
| `buildEatCandidate()` *(new)* | `eatDrive` | none | Target food-tagged objects |
| `buildSocialCandidate()` | `socialDrive` | conf ≥ 0.5 for strangers | Gate by `objectMemories` |
| `buildPlayCandidate()` | `playDrive` | none | Prefer familiar objects at low confidence |
| `buildExploreCandidate()` | `exploreDrive` | `risk > confidence * 5` skips | — |
| `buildWanderCandidate()` | `exploreDrive` | always | `wanderRadius = safeAreaRadius * (0.3 + confidence * 0.7)` |
| `buildSafeReturnCandidate()` | `safetyDrive` | n/a | Never blocked |
| `buildDroppedItemCandidate()` | `exploreDrive + novelty` | none | Novelty from `objectMemories` |
| `buildIdleCandidate()` | none | none | Always available; lowest score; raised slightly at low confidence |

Remove `buildNeedZoneCandidate()` — zone system is not part of this spec.

### Repeat Penalty System

```js
_getRepeatPenalty(actionId, context) {
    const def = ActionDefinitionRegistry.getDefinitionSync(actionId);
    if (!def || def.repeatMode === 'free') return 1.0;

    const recentCount = this._getRecentRepeatCount(actionId);
    if (recentCount === 0) return 1.0;

    const relevantDrive = this._getRelevantDriveForAction(actionId, context.drives);
    const driveScale  = 1 - (relevantDrive * 0.5);
    const basePenalty = Math.max(0.1, 1.0 - (recentCount * 0.25));
    return Math.max(0.1, basePenalty + (1 - basePenalty) * (1 - driveScale));
}
```

High drive (0.8) reduces penalty by up to 50% — a Myte waters multiple plants naturally at high `exploreDrive`, then diversifies as the drive drops.

Same-target penalty:
```js
_getSameTargetPenalty(actionId, targetId) {
    return (this._getLastTargetForAction(actionId) === targetId) ? 0.2 : 1.0;
}
```

Relevant drive mapping:
```js
_getRelevantDriveForAction(actionId, drives) {
    const tags = ActionDefinitionRegistry.getDefinitionSync(actionId)?.tags ?? [];
    if (tags.includes('food'))                return drives.eatDrive;
    if (tags.includes('playful'))             return drives.playDrive;
    if (tags.includes('social'))              return drives.socialDrive;
    if (tags.includes('stimulating'))         return drives.exploreDrive;
    if (tags.includes('purposeful_movement')) return drives.exploreDrive;
    return 0;
}
```

### Verify
- Myte with high `eatDrive` actively seeks food objects
- Low-confidence Myte wanders only ~30% of safe area radius
- `buildSafeReturnCandidate` works; no reference to home emotional need
- No references to `boredom`, `lightNeed`, `homeNeed` remain in `MyteAI.js`
- Myte watering multiple plants continues naturally when drive is high

---

## Phase 8 — Config/Data-Driven Audit

**Depends on:** All phases above

**Goal:** No magic numbers remain inline. All tuning values live in config.

### Files
- `js/Myte/MyteStats.js`
- `js/Myte/MyteAI.js`
- `data/mytes/myte.json`

### Changes

#### Move from `MyteStats.js` to `data/mytes/myte.json` under `stats`:

| Value | Config key |
|-------|------------|
| Decay rates for energy, hunger, fun, social, comfort | `energyDecayRate`, `hungerDecayRate`, `funDecayRate`, `socialDecayRate`, `comfortDecayRate` |
| Exhaustion threshold | `exhaustionThreshold` |
| Exhaustion recovery threshold | `exhaustionRecoveryThreshold` |
| Comfort blend rate | `comfortBlendRate` |
| Energy crossover from eating | `eatEnergyBonus` |

#### Move from `MyteAI.js` to `data/mytes/myte.json` under `ai`:

| Value | Config key |
|-------|------------|
| `boredomDelta` rates | `funDeltaRates.resting`, `funDeltaRates.stimulating`, `funDeltaRates.movement`, `funDeltaRates.idle`, `funDeltaRates.default`, `funDeltaRates.moving` |
| Think intervals | `baseThinkInterval`, `minThinkInterval`, `maxThinkInterval` |
| `minCandidateScore` | `minCandidateScore` |
| Memory duration | `memoryDuration` |
| Target cooldown | `targetCooldownDuration` |
| Wander radius | `wanderRadius` |
| Social radius | `socialRadius` |
| Object search radius | `objectSearchRadius` |
| Action result scale factor | `noteBehaviorScale` |

All config values read in constructors, stored on `this`. Never read from config mid-loop.

### Verify
- Change a decay rate in `myte.json`; confirm behavior changes accordingly
- Change `noteBehaviorScale`; confirm stat deltas scale proportionally
- Grep for `0.0022`, `0.0034`, `0.0016`, `0.55` in `MyteStats.js` and `MyteAI.js` — none remain as inline constants

---

## Phase 9 — Battery UI + Sound Cooldown Decoupling *(Deferred)*

**Status:** Deferred. Not part of the current refactor scope.

`MyteStats` mixes stat data with battery display state and sound cooldown timers. Tackle in a separate pass after all behavioral phases are stable.

When ready: battery reads `myte.stats.getEnergyRatio()` directly; sound cooldowns live on `Myte.js` or a `MyteSoundController`. `MyteStats` must not reference DOM elements or audio methods.

---

## Phase 10 — Species Personality Defaults

**Depends on:** Phase 2, Phase 3

**Goal:** Each species declares its own trait starting values and confidence.

### Files
- `data/mytes/myte.json`
- `data/mytes/*.json`

### Changes

#### `data/mytes/myte.json` — base traits

```json
"traits": {
    "curiosity":   { "default": 0.5, "min": 0.1, "max": 0.9 },
    "activity":    { "default": 0.5, "min": 0.1, "max": 0.9 },
    "sociability": { "default": 0.5, "min": 0.0, "max": 1.0 },
    "boldness":    { "default": 0.5, "min": 0.0, "max": 1.0 }
},
"stats": {
    "confidence": { "default": 0.5 }
}
```

Remove `neediness` and `sensitivity` from trait config entirely.

#### Each species file (`data/mytes/*.json`)

Override traits and confidence per species. Example archetypes:

```json
// Explorer species
"traits": {
    "curiosity":   { "default": 0.85 },
    "activity":    { "default": 0.6  },
    "sociability": { "default": 0.3  },
    "boldness":    { "default": 0.75 }
},
"stats": { "confidence": { "default": 0.55 } }

// Social butterfly species
"traits": {
    "curiosity":   { "default": 0.4 },
    "activity":    { "default": 0.5 },
    "sociability": { "default": 0.9 },
    "boldness":    { "default": 0.5 }
},
"stats": { "confidence": { "default": 0.6 } }

// Anxious homebody species
"traits": {
    "curiosity":   { "default": 0.25 },
    "activity":    { "default": 0.3  },
    "sociability": { "default": 0.5  },
    "boldness":    { "default": 0.15 }
},
"stats": { "confidence": { "default": 0.25 } }
```

**Boldness note:** `boldness: 0.75` → confidence changes at 87.5% magnitude. `boldness: 0.15` → 57.5%. A timid species with low confidence recovers slowly and crumbles easily. This is intentional and creates distinct observable personality without a confidence-floor system.

#### `js/Myte/MyteStats.js`

`resolveTraitValue()` already handles object configs from Phase 2. For confidence:
```js
const confConfig = statConfig.confidence;
this.confidence = typeof confConfig === 'object' ? confConfig.default ?? 0.5 : confConfig ?? 0.5;
```

### Verify
- Bold species gains confidence noticeably faster after successful actions
- Anxious species stays near home significantly longer before venturing out
- Two species with different traits behave visibly differently in autonomous mode

---

## Phase 11 — Cleanup + Naming Audit

**Depends on:** All phases above complete and stable

**Goal:** Remove all legacy concepts, stale code, naming inconsistencies.

### Grep for and remove all occurrences of:

```
boredom              (as a stat)
getBoredomRatio      (shim from Phase 2)
lightNeed
musicNeed
homeNeed
enrichment           (as standalone stat)
environment          (as a stat, decay rate, or ratio method — not generic comments)
sensitivity          (in trait config, drive formulas, or scoring code)
neediness            (in any config or code)
isStimulating        (array declaration)
isPlayful            (array declaration)
isSocial             (array declaration)
isPurposefulMovement (array declaration)
currentMood          (stored property)
getMoodRatio
setMood
handleMoodEffects
moodDecayRate
moodSyncRate
moodSyncMultiplier
moodTimeout
this.moods           (config object)
mood_happy           (buff ID)
mood_excited
mood_sleepy
mood_sad
mood_grumpy
traits.sensitivity   (in drive or scoring code)
exclusiveGroup       (buff field — was never added in this version)
cancels              (buff field — was never added in this version)
morning_energy / afternoon_slump / night_fatigue   (time buff IDs — not part of this spec)
rainy_day / sunny_day / stormy                     (weather buff IDs — not part of this spec)
applyRestZoneEffects / applyPlayZoneEffects / applyFoodZoneEffects / applySocialZoneEffects / applyDangerZoneEffects / applyBoostZoneEffects  (hardcoded zone methods — replaced by zones.json)
_getConfidenceTier   (method — replaced by direct value comparison)
notifyConfidenceEvent (replaced by applyConfidenceDelta)
environmentPerMs     (buff effect field — no environment need)
environmentDecayRate
environmentRatio
getEnvironmentRatio
```

### Additional cleanup:

- Remove `getBoredomRatio()` shim added in Phase 2
- Remove `applyActivityEffects()` if fully replaced by tag-based logic
- Remove any `TODO`, `LEGACY`, or `DEPRECATED` comments left during earlier phases
- Remove duplicate stat update paths if both `noteBehavior()` and `applyActionResult()` coexist
- Validate all buff `effects` field names — no `moodDecayMultiplier`, `moodSyncMultiplier`, `moodPerMs`, `moodBoost` should remain
- Confirm no buff ID matches any return value of `getDerivedMood()`
- Confirm old buff IDs `cozy`, `lonely`, `playful` (buff) replaced by `well_settled`, `socially_depleted`, `energized`
- Confirm no stale `_batchSessionActive` or `_batchSessionCounts` references
- Update all `objectMemories.get(id)` read sites from raw timestamp to `.lastVisited`: `objectMemories.get(id)?.lastVisited ?? 0`

### Verify
- Global grep for each term above — zero results in `js/Myte/` and `data/`
- Play 5+ minutes in autonomous mode with multiple Mytes
- Debug overlay shows: Needs / Traits + Confidence / Drives / Pressures / Active Buffs / Top Candidates — clearly separate, no mood meter
- No console errors or undefined property accesses
- Emergency return, rest, social, play, and explore behaviors all function correctly
- `objectMemories` entries are objects with `lastVisited` and `visitCount` fields, not raw timestamps
