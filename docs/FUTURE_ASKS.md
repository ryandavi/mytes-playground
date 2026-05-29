# Myte AI System Refactor Audit

## Overview

Audit and refactor the Myte AI ecosystem holistically, not just `MyteAI.js`.

The current implementation mostly works, but several concepts overlap or are conflated across AI, stats, drives, buffs/debuffs, environment systems, candidate scoring, and debug tooling.

The goal is to create a Sims-like but simpler autonomous AI system that is:

* emotionally readable
* easy to debug
* fun to watch
* extensible for future mechanics
* data-driven/config-driven
* free of duplicated concepts and legacy naming

The current architecture already has good foundations:

* candidate scoring
* affordance systems
* novelty/memory systems
* autonomy modes
* repeat penalties
* action queue behavior
* debug snapshots
* emergency safe return behavior

Preserve those systems where possible.

---

# High-Level Refactor Goals

The current AI mixes together:

* persistent needs
* temporary drives
* emotional state
* environmental pressure
* personality traits
* confidence
* buffs/debuffs
* candidate scoring inputs
* debug-only representations

These should become clearly separated systems.

The architecture should support:

* future map objects
* future zones
* future interactions
* future buffs/debuffs
* future environmental simulation
* future emotional systems
* future confidence/risk systems

without requiring another major rewrite later.

Do not overengineer, but establish a clean foundation now.

---

# Core Model

## 1. Persistent Needs

Needs are long-term continuously changing state values.

Desired core needs:

* energy
* hunger (or fuel)
* fun
* social
* comfort
* environment

Rules:

* Needs are persistent.
* Needs are not candidate scores.
* Needs are not temporary motivations.
* Needs should be readable and emotionally intuitive.

Examples:

* low energy → sleepy/exhausted behavior
* low fun → boredom/play-seeking
* low comfort → comfort-seeking/restlessness
* low environment → dissatisfaction with surroundings

---

## 2. Personality / Long-Term Traits

These are slow-changing temperament values.

Desired traits:

* confidence
* curiosity
* activity
* neediness

Traits influence:

* candidate weighting
* tolerance
* exploration
* risk acceptance
* social initiation
* distance from safe areas
* novelty seeking

Traits should not behave like fast-draining needs.

Confidence especially should become a major behavioral gate.

---

## 3. Derived Drives

Drives are temporary motivations calculated dynamically from:

* needs
* traits
* environment
* recent history
* novelty
* affordances
* buffs/debuffs
* context
* nearby objects
* zones
* memory
* safety pressure

Desired drives:

* restDrive
* eatDrive
* playDrive
* socialDrive
* exploreDrive
* comfortDrive
* safetyDrive

Rules:

* Actions are selected from drives.
* Drives are derived.
* Drives should never become duplicate needs.
* Drives should be recomputed consistently.

Example:

```js
playDrive =
	funDeficit *
	curiosity *
	environmentStimulus *
	energyModifier *
	confidenceModifier;
```

---

# Home / Safety Refactor

`home` should NOT remain a core emotional need.

Home should instead become:

* safe fallback
* recovery anchor
* familiarity zone
* low-confidence comfort area
* emergency return target

Possible replacement concepts:

* safetyPressure
* familiarityPressure
* distanceFromSafeAreaPressure
* safeReturnPressure

Keep:

* emergency safe return behavior
* exhaustion return behavior
* fallback recovery logic

Remove:

* home as emotional “meter”
* home competing against actual emotional needs

---

# Environment Refactor

`lightNeed` and `musicNeed` should not remain standalone pseudo-needs.

Instead:

* fold them into a broader environment system
* or convert them into environmental subpressures

Environment should represent:

* stimulation
* coziness
* ambiance
* clutter
* environmental quality
* sensory satisfaction

Environment may be influenced by:

* lighting
* music
* decoration density
* cozy objects
* scary objects
* clutter
* calming objects
* active zones
* noise
* crowding
* novelty

Future map objects should already have a clean place to declare environmental effects.

Examples:

```js
environmentEffects: {
	comfort: 5,
	coziness: 3,
	noise: -2,
	scary: 4,
	stimulation: 6
}
```

Do not necessarily implement every mechanic now, but establish the architecture.

---

# Comfort Refactor

Comfort should represent:

* physical ease
* emotional ease
* relaxation
* calmness

Comfort restoration examples:

* beds
* flowers
* fountains
* cozy rooms
* warmth
* calming objects

Comfort-seeking behavior should become:

* comfortDrive
* safetyDrive

Avoid:

* duplicated comfort systems
* comfort behaving as both need and drive simultaneously

---

# Confidence Refactor

Confidence should become a major behavioral modifier.

Low confidence mytes:

* stay near familiar areas
* avoid portals
* avoid strangers
* avoid risky interactions
* avoid unknown objects
* prefer comfort/rest
* prefer familiar objects

Medium confidence mytes:

* inspect objects
* socialize nearby
* explore locally
* try mild novelty

High confidence mytes:

* autonomously use portals
* open chests
* explore farther
* investigate unknown objects
* initiate play/social behavior
* tolerate scary environments

Confidence gain foundations:

* successful exploration
* positive interactions
* safe outcomes
* enriched environments
* successful autonomous actions

Confidence loss foundations:

* scary objects
* failed interactions
* overstimulation
* exhaustion
* neglect
* unsafe environments
* negative social outcomes

Even if some triggers are not fully implemented yet:

* establish clean hooks now
* make future integrations obvious

---

# Buff/Debuff Audit

Audit `MyteStats.js` alongside AI.

Question:
Should some temporary emotional or environmental effects become buffs/debuffs instead of hidden stat math?

Potential candidates:

* overstimulated
* cozy
* inspired
* lonely
* bored
* exhausted
* socially fulfilled
* restless
* scared
* soothed
* energized
* cramped
* homesick/familiarity deprived
* curious
* playful

Goal:
Surface WHY behavior/stat changes are happening.

Buffs/debuffs should:

* explain state changes
* expose temporary modifiers
* improve debug readability
* allow future mechanics to hook in cleanly

Do not create meaningless status effect spam.

Use them where they improve clarity.

---

# Remove Hardcoded Action Groupings

Current code in `MyteStats.js`:

```js
const isStimulating = [
	'inspect',
	'deep_inspect',
	'smell_flower',
	'drink_fountain',
	'water_plant',
	'harvest',
	'interact_object',
	'open_chest',
	'eat_element'
].includes(actionId);

const isPlayful = [
	'run_laps',
	'circle',
	'zigzag',
	'jump',
	'dance',
	'play_tag',
	'play_fetch',
	'nudge_ball'
].includes(actionId);

const isSocial = [
	'show_affection',
	'greet',
	'greet_receive',
	'watch',
	'play_tag'
].includes(actionId);

const isPurposefulMovement = [
	'go_to_object',
	'astar-move',
	'move',
	'follow_object'
].includes(actionId);
```

Audit this system completely.

Questions:

* Should these categories exist in action metadata instead?
* Should actions expose tags/effects directly?
* Which actions are missing?
* Are some categories overlapping/redundant?
* Should actions define:

  * tags
  * emotional effects
  * exertion
  * stimulation
  * social value
  * novelty
  * confidence impact
  * environmental impact
  * comfort impact
  * risk level
  * soothing value

Preferred direction:
Move this into action metadata/config instead of hardcoded lists.

Example:

```js
metadata: {
	tags: ['social', 'playful', 'stimulating'],
	effects: {
		fun: 8,
		confidence: 1,
		energy: -3
	},
	exertion: 2,
	novelty: 4,
	risk: 1
}
```

The AI/stat systems should consume metadata-driven information instead of giant hardcoded switch logic.

Goal:

* single source of truth
* reusable action semantics
* cleaner candidate scoring
* cleaner stat updates
* future-proofing

---

# Object Metadata Foundation

Audit whether map objects already support metadata patterns.

Objects should eventually support things like:

```js
aiTags
environmentEffects
comfortEffect
confidenceEffect
funEffect
scaryStrength
cozyStrength
noiseLevel
lightLevel
musicLevel
noveltyValue
riskLevel
familiarityValue
```

Use naming that matches project conventions.

The AI should be able to read these values during:

* candidate scoring
* context building
* environmental evaluation
* action completion
* confidence updates
* stat updates
* debug snapshots

Do not overbuild behavior now.
Create a clean extensible architecture.

---

# Zone Foundation

Audit zones similarly.

Zones may eventually influence:

* playDrive
* socialDrive
* comfortDrive
* safetyDrive
* environment
* confidence

Examples:

* play zones
* cozy zones
* social zones
* scary zones
* dark zones
* calming zones

Create a clean extension path.

---

# Action Result Standardization

Audit action result handling and `noteBehavior`.

Actions should ideally report effects consistently.

Potential standardized fields:

```js
funDelta
comfortDelta
socialDelta
environmentDelta
confidenceDelta
energyDelta
hungerDelta
novelty
soothing
accomplishment
exertion
scary
safeOutcome
failedOutcome
```

Either:

* extend `noteBehavior`
* or redesign it cleanly

Avoid duplicate systems.

---

# Candidate Scoring Audit

Audit all candidate builders:

* rest
* safe return/home
* social
* play
* interaction
* dropped item
* need zone
* wander
* idle
* inspect/explore

Update all terminology and scoring inputs.

Examples:

* play candidates should use `playDrive`
* exploration should use `exploreDrive`
* safety behavior should use `safetyDrive`
* confidence/risk gating should affect candidate generation
* object risk/novelty should influence exploration

Avoid:

* stale naming
* old need terminology
* duplicated calculations
* conflicting concepts

---

# Debugging Improvements

Keep and improve debug snapshots.

Debug output should clearly separate:

* needs
* drives
* traits
* pressures
* environment state
* buffs/debuffs
* confidence
* candidate scores
* chosen action
* top rejected candidates

Important:
If `getNeedsSnapshot()` is primarily debugging/UI:

* do not treat it as proof that all values are actual needs
* reorganize if needed
* rename if clarity improves

---

# Config/Data-Driven Audit

Move tuning values into config wherever practical.

Examples:

* need weights
* drive weights
* confidence thresholds
* risk thresholds
* environment weights
* novelty weights
* safety pressure tuning
* familiarity pressure tuning
* object effect weights
* zone effect weights
* scoring thresholds
* emergency thresholds

Avoid magic numbers.

Prefer:

* metadata-driven systems
* reusable tags
* centralized config
* single source of truth

---

# No Legacy Systems

After refactor:

* search codebase for old terminology
* remove stale concepts
* remove duplicated logic
* migrate naming cleanly

Specifically audit/remove:

* enrichment as separate need
* home as emotional need
* lightNeed standalone
* musicNeed standalone
* duplicated comfort logic
* duplicated play/enrichment logic
* stale debug labels
* stale config keys
* stale comments
* hardcoded action grouping logic

If backward compatibility is required:

* add migration layer
* add fallback mapping
* do not leave competing systems active

---

# Deliverables

1. Explain revised architecture.
2. List every affected system/file.
3. Provide updated terminology.
4. Provide suggested config structure.
5. Provide concrete code changes.
6. Rewrite sections/full classes where appropriate.
7. Provide migration notes.
8. Add TODO hooks for future systems.
9. Eliminate duplicate/legacy concepts.
10. Ensure future AI/code tools can clearly understand and extend the system.

Note: Everything detailed here is not set in stone. We should do what works best for our game and creates a fun gameplay loop. Name conventions should be consistent, we should reuse code as much as possible, be datadriven or use config vars, and use best practices overall.