# Myte AI System Refactor Plan

## Context

The Myte AI ecosystem works but has significant concept-blending across MyteAI.js, MyteStats.js, and related files. The goal is a Sims-like autonomous AI that is emotionally readable, debuggable, and extensible — without rewriting everything at once.

Key problems to fix:
- `MyteStats.js` mixes persistent needs, derived drives, traits, battery UI, and sound cooldowns
- `MyteAI.js` has ~10 hardcoded candidate builders with inline stat math
- Hardcoded `isStimulating` / `isPlayful` / `isSocial` / `isPurposefulMovement` arrays in `MyteStats.js`
- `home` competes as an emotional need instead of functioning as safety anchor
- `lightNeed` and `musicNeed` are standalone pseudo-needs that should fold into `environment`
- Action metadata in `actions.json` lacks tags, effects, and behavioral semantics
- No clear separation of needs vs. drives vs. traits in debug output

---

## Architecture Overview

### Three Clearly Separated Layers

**1. Persistent Needs** (long-term, continuously draining)
- `energy`, `hunger`, `fun`, `social`, `comfort`, `environment`
- `home` → **removed** as emotional need; becomes `safetyPressure` in drive layer

Need drain rules (must be enforced clearly to avoid overlap):

| Need | What drains it | What restores it | Does NOT affect |
|------|---------------|-----------------|-----------------|
| `energy` | time + exertion | rest, sleep, food (partial) | hunger |
| `hunger` | time only | eating actions | energy (only partial crossover) |
| `fun` | time, idle/purposeful movement | play, novelty, social, explore | comfort directly |
| `social` | time, isolation | greet, show affection, watch, talk | fun directly |
| `comfort` | time, high exertion, scary events | beds, flowers, being held, warmth, calming objects | environment |
| `environment` | time, scary/noisy/cluttered nearby objects | ambient light, music, cozy decor, calm zones | comfort |

Key rule: `comfort` = direct physical/emotional contact restores it. `environment` = ambient quality of the space around the Myte. A cozy bed raises `comfort`; a well-lit decorated room raises `environment`. Both can be low independently.

Hunger and energy are related but not redundant: eating solves hunger and gives a small energy boost. Resting solves energy but does not reduce hunger.

**2. Traits** (slow-changing temperament — not meters, not draining)
- `curiosity` — scales exploreDrive and novelty-seeking
- `activity` — scales playDrive, energy consumption rate
- `sensitivity` — how strongly needs pull on drives (renamed from `neediness` for clarity; a high-sensitivity Myte reacts quickly to deficits, a low-sensitivity one is chill)

Note: `confidence` is **not** a trait — see below.

**2b. Confidence** (medium-term stat with visible meter — faster-moving than traits)
- Sits between traits (slow) and needs (continuous drain)
- Has no passive drain — only changes through events
- Changed by `notifyConfidenceEvent(type, magnitude)`
- Should be displayed as a visible meter in debug UI
- Low confidence gates candidate generation (see Phase 3)

**3. Derived Drives** (computed each AI tick from needs × traits × context)
- `restDrive`, `playDrive`, `socialDrive`, `exploreDrive`, `comfortDrive`, `safetyDrive`, `eatDrive`
- Candidate builders in `MyteAI.js` consume drive values — not raw need ratios

Drive → candidate action distinction (must generate different actions or drives compete pointlessly):

| Drive | Candidate actions generated |
|-------|-----------------------------|
| `comfortDrive` | seek beds, flowers, fountains, cozy objects, calming zones |
| `safetyDrive` | return to familiar area / home base, avoid far zones, seek safe return point |
| `exploreDrive` | inspect objects, wander to new areas, investigate dropped items |
| `playDrive` | run laps, dance, jump, circle, zigzag, nudge ball |

`exploreDrive` and `playDrive` will sometimes compete for the same Myte attention — that's fine, the candidate scorer resolves it. Curious-but-lazy Mytes (high curiosity, low activity) should favor `exploreDrive`; active-but-incurious ones favor `playDrive`.

---

## Phases

### Phase 1 — Action Metadata Foundation *(lowest risk, highest leverage)*

**Goal:** Single source of truth for what each action means behaviorally.

**Changes to `data/metadata/actions.json`:**
Add to each action entry:
```js
tags: ['social', 'playful', 'stimulating'],   // replaces hardcoded category arrays
effects: {
  fun: 8,
  comfort: 2,
  social: 4,
  environment: 0,
  energy: -3,
  confidence: 1
},
exertion: 2,      // physical effort (affects energy drain)
novelty: 4,       // how novel/interesting this is
risk: 1,          // confidence gating threshold
soothingValue: 0  // calming effect
```

**Changes to `js/Myte/MyteStats.js`:**
- Delete the `isStimulating`, `isPlayful`, `isSocial`, `isPurposefulMovement` arrays
- `applyActionCompletionEffects(actionId)` → reads `ActionDefinitionRegistry.getDefinitionSync(actionId).effects` and `tags`
- `applyActivityEffects()` → same pattern; tags replace category switch logic

**Changes to `js/Myte/MyteAI.js`:**
- Candidate scoring for play/social/explore/rest uses `metadata.effects` and `metadata.tags` from action definitions
- No more hardcoded per-action stat math in candidate builders

---

### Phase 2 — Needs + Drives Restructuring

**Goal:** Clearly separate what persists (needs) from what is computed (drives).

**Changes to `js/Myte/MyteStats.js`:**
- Rename/reorganize need properties into a clean `needs` group: `energy`, `hunger`, `fun`, `social`, `comfort`, `environment`
- Remove `home` as emotional stat — just delete the meter; keep `emergencySafeReturn` behavior
- Fold `lightNeed` + `musicNeed` into `environment` (they influence environment quality, not standalone meters)
- Rename `neediness` trait → `sensitivity`
- Move `confidence` out of traits group into its own clearly labeled stat with its own get/set methods
- Enforce need drain rules from Architecture Overview — comfort and environment must have distinct drain/restore sources

**Changes to `js/Myte/MyteAI.js` — `buildContext()`:**
Split into two steps:
1. `_buildNeedsSnapshot()` — raw need ratios
2. `_computeDrives(needs, traits, environment)` — returns drive object:
```js
{
  restDrive, playDrive, socialDrive,
  exploreDrive, comfortDrive, safetyDrive, eatDrive
}
```

Drive formulas (example):
```js
playDrive    = funDeficit * traits.curiosity * energyModifier * traits.activity;
eatDrive     = hungerDeficit * traits.sensitivity;
restDrive    = energyDeficit * traits.sensitivity;
socialDrive  = socialDeficit * traits.sensitivity;
comfortDrive = comfortDeficit * traits.sensitivity;
safetyDrive  = (1 - confidence) * distanceFromSafeArea * exhaustionModifier;
exploreDrive = traits.curiosity * noveltyHunger * confidence * energyModifier;
```

Note: `sensitivity` replaces `neediness` everywhere. `confidence` is read directly as a stat, not via traits.

Candidate builders receive `context.drives.playDrive` instead of computing inline.

**Config:** Move drive weight constants into `data/mytes/myte.json` under an `ai.driveWeights` key.

---

### Phase 3 — Confidence as Behavioral Gate

**Goal:** Confidence is a visible medium-term stat that meaningfully gates what actions are generated.

Confidence is NOT a trait — it changes through events, has a visible meter in the debug UI, and is a first-class stat on `MyteStats` with its own get/set/clamp methods.

**Changes to `js/Myte/MyteStats.js`:**
- Add `confidence` as a standalone stat (0–1, no passive drain)
- Add `notifyConfidenceEvent(type, magnitude)` — applies delta, clamps to 0–1
- Confidence event types and default magnitudes (tunable in config):

| Event type | Direction | Notes |
|------------|-----------|-------|
| `successfulExploration` | + | Completed explore/inspect action |
| `positiveInteraction` | + | Social action completed well |
| `safeOutcome` | + | Action completed without incident |
| `scaryObjectNearby` | − | Object has high `scaryStrength` |
| `failedInteraction` | − | Action interrupted/failed |
| `overstimulated` | − | Buff applied |
| `exhausted` | − | Energy hits exhaustion threshold |
| `negativeOutcome` | − | Generic failure |

**Changes to `js/Myte/MyteAI.js`:**
- Read `myte.stats.confidence` directly (not via traits)
- Define confidence tiers from config (e.g., low < 0.35, high > 0.70)
- In candidate builders, gate by tier:
  - **Low**: skip portal, chest-open, far-explore, stranger-social candidates; prefer comfort/rest/familiar objects
  - **Medium**: allow local inspect, nearby social, mild novelty
  - **High**: generate all candidates including portal, deep explore, risky interactions, unfamiliar objects
- Hook `notifyConfidenceEvent()` from: action complete callbacks, object proximity checks, zone enter/exit, exhaustion state change

**Config in `data/mytes/myte.json`:**
```js
ai: {
  confidenceThresholds: { low: 0.35, high: 0.70 },
  confidenceEventMagnitudes: {
    successfulExploration: 0.04,
    positiveInteraction: 0.03,
    safeOutcome: 0.02,
    scaryObjectNearby: -0.05,
    failedInteraction: -0.04,
    overstimulated: -0.06,
    exhausted: -0.08,
    negativeOutcome: -0.03
  }
}
```

---

### Phase 4 — Object + Zone Metadata Foundation

**Goal:** Map objects and zones declare their behavioral effects — AI reads them, not hardcodes them.

**Map Objects — `js/Map/MapObjects/BaseMapObject.js` (or equivalent base):**
Add optional schema:
```js
environmentEffects: { comfort: 5, coziness: 3, noise: -2, stimulation: 6 }
confidenceEffect: -1   // e.g., scary objects
comfortEffect: 3
noveltyValue: 2
```
AI reads these during candidate scoring, context building, and post-action stat updates.

**Zone System — `js/Map/GameZone.js`:**
- Remove hardcoded `applyRestZoneEffects()`, `applyPlayZoneEffects()`, etc. switch methods
- Zones declare effects in metadata/config: `driveBoosts`, `needEffects`, `buffsToApply`
- `GameZone.update()` reads zone definition instead of switching on type
- Zone types defined in `data/metadata/zones.json` (new file, small)

---

### Phase 5 — Buff/Debuff Expansion + Time/Weather Foundation

**Goal:** Surface WHY behavior is changing. Buffs are the primary way the player understands their Myte.

The buff system is already well-developed (`tired`, `exhausted`, `cozy`, `confident`, `anxious`, `restless`, aura/zone buffs, action-complete buffs). This phase extends and fixes it.

---

**New buffs to add to `data/metadata/buffs.json`:**

*Hunger (mirrors existing tired/exhausted pattern):*
- `hungry` (debuff, status trigger: `hungerRatio ≤ 0.3`) — mild mood decay, amplifies `eatDrive`
- `starving` (debuff, status trigger: `hungerRatio ≤ 0.05`) — stronger; forces `eatDrive` priority

*Time-of-day (context buffs — applied/removed by a time manager, not stat conditions):*
- `night_fatigue` (debuff, active 10pm–6am) — energy drains faster, `restDrive` amplified, speed slightly reduced. Player sees this and understands why their Myte is heading to bed.
- `morning_energy` (buff, active 6am–10am) — energy decays slower, mild `exploreDrive` boost
- `afternoon_slump` (debuff, active 2pm–4pm) — mild `restDrive` nudge

*Far-from-home (replaces hardcoded inline math in `updateBehaviorDrives`):*
- `far_from_home` (debuff) — applied by AI when `distanceFromHome > safeAreaRadius * 1.8 && energy < 40`. Drains comfort slowly. Currently this is hidden math; making it a buff surfaces it.

*Weather (scaffold now, wire when weather system exists):*
- `rainy_day` (debuff) — reduces `exploreDrive`, boosts `comfortDrive`, slight speed reduction
- `sunny_day` (buff) — boosts `playDrive` and `exploreDrive`, mild mood lift
- `stormy` (debuff) — strong `safetyDrive` boost, confidence loss over time

---

**Existing buffs that need fixing after earlier phases:**

| Buff | Problem | Fix |
|------|---------|-----|
| `restless` | Triggers on `boredomRatio` | Update trigger stat to `funRatio` (inverted) after Phase 2 renames boredom → fun |
| `struggling` | `anyConditions: mood < 8` | After Phase 9 removes mood meter, replace mood condition with needs-based check (`fun < 8 OR social < 8`) |
| `mood_happy/excited/sleepy/sad/grumpy` | Hidden buffs wired to `currentMood` string | Phase out in Phase 9 when mood becomes a derived label, not a stat |

---

**Trigger wiring for new action-tag-based buffs:**
- Add `triggers.actionComplete.tags` support to `BuffRegistry.matchesActionCompleteTrigger()` so buffs can fire based on action tags (Phase 1) rather than hardcoded action ID lists
- Example: `curious_glow` currently hardcodes `["inspect", "deep_inspect"]` — after Phase 1 these carry the `stimulating` tag, so the trigger can match by tag instead

---

**Buff Conflict System — Cancellation + Exclusive Groups**

Many buffs should not coexist. Add two new fields to the `buffs.json` schema and implement them in `MyteBuffController.applyBuff()`:

```js
"cancels": ["buff_id_a", "buff_id_b"],   // remove these buffs when this one is applied
"exclusiveGroup": "group_name"            // only one buff per group can be active at a time
```

**Exclusive groups** (only one member active per Myte at once):

| Group | Members |
|-------|---------|
| `energy_tier` | `well_rested`, `charged_up`, `tired`, `exhausted` |
| `hunger_tier` | `nourished`, `hungry`, `starving` |
| `mood_polarity` | `spirited`, `gloomy` |
| `confidence_polarity` | `confident`, `anxious` |
| `time_of_day` | `night_fatigue`, `morning_energy`, `afternoon_slump` |
| `weather` | `rainy_day`, `sunny_day`, `stormy` |
| `zone` | `zone_rest`, `zone_play`, `zone_social`, `zone_danger` |

**Explicit cancellations** (directionality matters):

| When applied | Cancels |
|-------------|---------|
| `exhausted` | `tired`, `well_rested`, `charged_up` |
| `starving` | `hungry`, `nourished` |
| `nourished` | `hungry`, `starving` |
| `disturbed` | `well_rested` |
| `well_rested` | `tired` |
| `playful` | `restless` |
| `charged_up` | `tired` |
| `stormy` | `rainy_day`, `sunny_day` |

**Interesting tensions — intentionally allowed to coexist:**

| Combo | Why |
|-------|-----|
| `playful` + `night_fatigue` | Myte wants to play but fighting fatigue — visible internal conflict |
| `thrilled` + `anxious` | Found something exciting despite low confidence — brief override, feels earned |
| `overstimulated` + `cozy` | Overfussed but physically comfortable — nuanced |
| `far_from_home` + `zone_play` | In a play zone but far from safety — competing pressures |
| `nourished` + `morning_energy` | Stacks naturally, feels rewarding |

**Implementation in `MyteBuffController.applyBuff()`:**
1. Check `exclusiveGroup` — remove any currently active buff from the same group before applying
2. Apply `cancels` list — remove named buffs unconditionally
3. Then apply the new buff as normal

---

### Phase 6 — Debug Snapshot Reorganization

**Goal:** Debug UI and snapshots clearly separate all layers.

**Changes to `js/Myte/MyteStats.js` / `js/Myte/MyteAI.js`:**
- `getNeedsSnapshot()` → only actual persistent needs
- Add `getDrivesSnapshot()` → computed drives
- Add `getTraitsSnapshot()` → confidence, curiosity, activity, neediness
- Add `getPressuresSnapshot()` → safetyPressure, familiarityPressure
- Existing `getBuffsSnapshot()` / candidate snapshot stays

**Debug UI** (`js/UI/debug/DebugOverlayUI.js`) consumes these separate snapshots for clear sections.

---

### Phase 7 — Action Result Standardization

**Goal:** Actions report their effects consistently so stat/drive systems can consume them without custom per-action logic.

Currently `noteBehavior()` is called ad-hoc with inconsistent fields. Standardize it.

**Proposed action result shape:**
```js
{
  funDelta: 8,
  comfortDelta: 2,
  socialDelta: 4,
  environmentDelta: 0,
  energyDelta: -3,
  hungerDelta: 0,
  confidenceDelta: 1,
  novelty: 4,
  soothing: 0,
  exertion: 2,
  accomplishment: 1,
  scary: false,
  safeOutcome: true,
  failedOutcome: false
}
```

**Changes:**
- All action `complete()` methods return or emit this standard result object
- `MyteStats.applyActionCompletionEffects()` reads these fields — no per-action switch logic
- `MyteAI.noteBehavior()` extended or replaced with this shape
- Action metadata `effects` (Phase 1) feeds defaults; actions can override per-instance

---

### Phase 8 — Candidate Scoring Audit

**Goal:** All candidate builders use updated terminology, drive values, and consistent scoring.

Audit every builder in `MyteAI.js`:

| Builder | Drive to use | Confidence gate | Notes |
|---------|-------------|-----------------|-------|
| Rest / Sleep | `restDrive` | none | Keep exhaustion emergency path |
| Eat / Food | `eatDrive` | none | New — wire to hunger need |
| Social | `socialDrive` | medium+ | Stranger gating at low confidence |
| Play | `playDrive` | low+ | Low confidence prefers familiar play |
| Explore / Inspect | `exploreDrive` | medium+ | High novelty objects require high confidence |
| Wander | `exploreDrive` | low+ | Radius scales with confidence |
| Safe Return / Home | `safetyDrive` | n/a | Remove "home" naming; becomes safetyPressure |
| Dropped Item | `exploreDrive` + novelty | low+ | |
| Idle | n/a | n/a | Last resort, always available |
| Need Zone | drive matching zone type | varies | |

**Changes:**
- Rename `buildEmergencyHomeCandidate` → `buildSafeReturnCandidate`
- Rename `homeRadius` → `safeAreaRadius` or keep as-is if used for spatial math
- All scoring inputs reference `context.drives.*` not inline stat ratios
- Remove any remaining old need terminology (`boredom`, `lightNeed`, etc.) from builder logic

---

### Phase 9 — Mood as Derived State

**Goal:** Mood is emotionally readable and derived from needs — not a competing separate meter.

Currently `mood` / `currentMood` is a parallel system with its own decay rate that competes with actual needs. It's hard to read and often redundant.

**Proposed:**
- Remove the persistent `mood` meter from `MyteStats`
- Replace with `getDerivedMood()` — a read-only computed string/value from needs state:
  ```js
  // examples
  low energy + low fun → 'exhausted'
  low social + low comfort → 'lonely'
  high fun + high energy → 'playful'
  low fun only → 'bored'
  high comfort + low activity → 'cozy'
  low confidence + far from home → 'anxious'
  ```
- Mood expressions/animations key off this derived state
- Debug overlay shows derived mood as a label, not a meter
- Mood-based buff triggers (`setMood`, `handleMoodEffects`) simplified or removed

This makes emotional state readable without a hidden extra system.

---

### Phase 10 — Config/Data-Driven Audit

**Goal:** No magic numbers anywhere in AI, stats, or scoring code.

Audit and move to `data/mytes/myte.json` or species definitions:

**Stats tuning:**
- Need decay rates (energy, hunger, fun, social, comfort, environment)
- Need drain modifiers per activity level
- Confidence gain/loss magnitudes per event type
- Exhaustion threshold, emergency return threshold

**AI tuning:**
- Drive weight multipliers (`ai.driveWeights`)
- Confidence tier thresholds (`ai.confidenceThresholds`)
- Think intervals (min, max, base)
- Candidate score floor (`minCandidateScore`)
- Memory duration, target cooldown duration
- Wander radius, social radius, object search radius, safe area radius

**Buff/debuff tuning:**
- Stimulation count threshold before `overstimulated` triggers
- Cozy duration, exhausted duration

**Zone tuning:**
- All per-zone effect magnitudes → `data/metadata/zones.json`

---

### Phase 11 — Battery UI + Sound Cooldown Decoupling

**Goal:** Remove UI and audio concerns from `MyteStats.js`.

**Battery display** (`batteryLevel`, `batteryVisible`, `batteryThresholds`) is purely visual — it should read from `energy` need, not be stored in stats.
- Move battery logic to a UI component or `DebugOverlayUI`
- `MyteStats` only exposes `energy` as a 0–1 ratio

**Sound/signal cooldowns** (`lastNeedSignalTimes`, `soundCooldown`, `lastInteractionTime`) are infrastructure concerns, not stat data.
- Move to a `MyteSoundController` or keep in `Myte.js` directly
- `MyteStats` should not know about sounds

---

### Phase 12 — Species Personality Defaults

**Goal:** Species definitions can declare trait starting points, giving each species distinct personality out of the box.

**Changes to `data/mytes/*.json` species files:**
```js
traits: {
  curiosity: { default: 0.8 },
  activity: { default: 0.6 },
  sensitivity: { default: 0.5 }   // renamed from neediness
},
stats: {
  confidence: { default: 0.4 }    // separate from traits — starting confidence level
}
```

A bold species starts with high confidence and explores immediately; a timid species starts low and must earn confidence through safe interactions. Traits are fixed personality; confidence starts at the species default and evolves from there.

---

### Phase 13 — Cleanup + Naming Audit

After all above phases are stable:
- Search and remove: `enrichment` as separate need, `home` emotional meter, `lightNeed` standalone, `musicNeed` standalone, duplicated comfort logic, old `mood` meter
- Remove stale comments, stale config keys, stale debug labels
- Validate naming consistency across all files
- Run a full grep for old terminology: `boredom`, `lightNeed`, `musicNeed`, `homeNeed`, `enrichment`, `isStimulating`, `isPlayful`, `isSocial`

---

## Suggestions / Future Considerations

These are not part of the current refactor but have clean extension hooks in the new architecture:

**Memory-aware scoring**
- `objectMemories` already tracks recency. Extend to track *emotional context* per object: did this object scare me? Did it boost confidence? Future scoring can weight these.

**Hunger system depth**
- Hunger is added as a need in Phase 2. Future: food spoilage, food preferences per species, hunger-driven foraging paths.

**Familiarity zones**
- Objects and areas visited frequently become "familiar" — they reduce safetyDrive and can be preferred by low-confidence Mytes. Ties into `familiarityPressure`.

**Crowding / noise pressure**
- `environment` need already absorbs this. Future objects can declare `noiseLevel` and `crowdingEffect`, reducing environment quality in busy areas.

**Relationship system**
- `socialDrive` currently triggers generic social actions. Future: Mytes track individual relationships (familiarity, affection, rivalry), which gates which social actions are generated with which targets.

**Seasonal / time-of-day modifiers**
- Drive weights can have time-of-day multipliers (e.g., `restDrive` amplified at night). The existing date/time awareness in flowers shows this is already possible in the engine.

**Interaction history per object type**
- "I've interacted with 3 flowers today" → reduced novelty for additional flowers. Already partially addressed by repeat penalty system; extend it to object *types* not just instances.

---

## Files Affected

| File | Change Type | Phase |
|------|-------------|-------|
| `data/metadata/actions.json` | Add tags, effects, exertion, novelty, risk, soothingValue | 1 |
| `js/Myte/MyteStats.js` | Remove hardcoded lists; restructure needs; remove mood meter; decouple battery/sounds | 1, 2, 9, 11 |
| `js/Myte/MyteAI.js` | Extract drives; update all candidate builders; confidence gate + events | 2, 3, 8 |
| `data/mytes/myte.json` | Add `ai.driveWeights`, `ai.confidenceThresholds`, all tuning config | 2, 10 |
| `data/mytes/*.json` (species) | Add trait defaults per species | 12 |
| `js/Map/GameZone.js` | Remove switch-per-type; read zone metadata | 4 |
| `js/Map/MapObjects/BaseMapObject.js` | Add environmentEffects/confidenceEffect schema | 4 |
| `data/metadata/zones.json` | New file: zone type metadata with effects + buffs | 4 |
| `data/metadata/buffs.json` | Add hungry, starving, night_fatigue, morning_energy, afternoon_slump, far_from_home, rainy_day, sunny_day, stormy; fix restless/struggling triggers after Phase 2/9 | 5 |
| `js/Engine/TimeBuffManager.js` | New: applies/removes time-of-day context buffs each game tick based on SimClock | 5 |
| `js/Myte/MyteBuffController.js` | Add `exclusiveGroup` + `cancels` logic to `applyBuff()` | 5 |
| `js/UI/debug/DebugOverlayUI.js` | Consume separated snapshot methods; derived mood label | 6, 9 |
| `js/Myte/Queue/Actions/*.js` | Standardize complete() result shape | 7 |

---

## Approach Notes

- **Phase 1 first** — action metadata expansion is safe, additive, and unblocks everything else
- Each phase is independently shippable and testable
- Preserve all existing behavior during restructuring; change data flow, not gameplay
- No new abstractions beyond what the refactor requires
- Existing systems (affordance scoring, novelty/memory, repeat penalties, emergency return) are preserved as-is

---

## Verification

After each phase:
1. Run the game, watch a Myte in autonomous mode for 2-3 minutes
2. Open the debug overlay — confirm needs/drives/traits display correctly
3. Confirm no regressions in: emergency return, social interactions, rest/sleep, zone effects
4. Check browser console for errors or undefined metadata lookups
