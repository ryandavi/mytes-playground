# Sound Philosophy

## Goal

Build a cohesive, tactile, readable, emotionally responsive audio system that stays pleasant over hundreds of hours.

The game should sound stylized and organic, not mathematically random.

Variation should usually be felt, not noticed.

## Core Philosophy

- Start with no variation and add only where needed.
- Consistency matters more than novelty.
- Repetition without variation causes fatigue.
- Too much variation destroys readability.
- Organic does not mean random.
- Audio should communicate state and material.
- Player-control sounds require maximum clarity.
- Ambient audio should support mood, not compete for attention.
- Variation should reinforce world logic.

Small variation feels physical and natural.
Large variation feels magical, unstable, comedic, broken, or synthetic.

Pitch and volume randomness should rarely both be strong at the same time.

UI and player-control sounds should prioritize trust, consistency, and responsiveness.

Environmental and creature sounds can be more organic and state-dependent.

Minecraft is a useful reference point here: tiny reward sounds can feel deeply satisfying when they are short, recognizable, bright, and reliably mixed. The "pickup" family in this game should aim for that same trust and tactile pleasure.

## Variation Rules

These rules should be treated as implementation constraints, not loose suggestions.

1. Pitch is not randomness for chaos.

- Small pitch ranges feel physical.
- Big pitch ranges feel magical, broken, synthetic, or comedic.

2. Most sounds should cluster near `1.0` pitch.

- Centered wobble is better than flat uniform random spread.
- The default feeling should be "same object, slightly different strike," not "new sound every time."

3. UI should use the smallest variation of all categories.

- Players notice UI pitch change immediately.
- UI sounds should feel trustworthy, stable, and repeatable.

4. Repetition still needs treatment.

- Repeated actions, machines, and frequent world interactions should not fire as exact clones forever.
- Use subtle wobble, variant toggles, alternating takes, cooldown windows, or weighted pools.

5. Volume variation should be rare.

- Prefer binary or authored stepped loudness differences over smooth random gain drift.
- Use volume shifts for meaning, weight, or state, not for generic anti-repetition.

6. Never max out both pitch and volume randomness together.

- Usually vary one dimension at a time.
- If pitch is doing the work, volume should stay anchored.
- If volume shifts are important, pitch should stay close to center.

## Direct Answers

### Should Myte movement speed affect walking animation?

Yes, but gently.

Movement speed should influence locomotion animation playback so footsteps, body motion, and travel speed feel physically connected. It should not scale without limits, or the animation will become silly and unreadable.

Recommended rule:

- Idle, jump, land, and emotional animations should keep authored timing.
- Walking and running animations should scale inside a controlled range.
- Example target band: `0.85x` to `1.25x` of authored locomotion speed.
- Sneaking, exhaustion, sleepiness, excitement, and sprint states can bias that range.

The visual goal is not "faster sprite because numbers changed." The goal is that the Myte looks like it is taking believable steps for the distance it is covering.

### Can footsteps trigger on a specific animation frame?

Yes. That is the preferred solution.

Footsteps should trigger on foot-contact frames, not on a simple timer.

Recommended footstep event payload:

- `frameIndex`
- `foot`: `left` or `right`
- `surfaceTag`
- `baseVolume`
- `pitchJitterRange`
- `cooldownMs`

Recommended footstep variation:

- Pitch wobble: about `+/- 2%` to `4%`
- Volume wobble: about `+/- 0.5 dB` to `1.5 dB`
- Do not push both strongly at once

Recommended player settings:

- `Footsteps Enabled`
- `Footsteps Volume`

If category count must stay small at first, footsteps can temporarily live under `Entities`, but the long-term home should be a dedicated `Footsteps` category.

## Current Code Snapshot

The current system has a good handmade feel, but it is still a small set of broad categories and direct triggers rather than a full mix architecture.

Current foundations:

- Central audio engine in `js/Engine/SoundManager.js`
- User-facing sliders for `master`, `ambient`, `music`, `ui`, and `sfx`
- Myte sound triggers through `js/Myte/Myte.js`
- UI sound triggers through `js/UI/core/UserInterface.js` and `js/UI/core/ModalWindow.js`
- Map object sound triggers through `js/Map/MapObjects/MapObject.js` and related subclasses
- Myte animation timing in `js/Myte/StateMachine.js`
- Terrain typing already exists in the map/grid layer, which is useful for future footstep surfaces

## Audit Summary

The current audio system is creative and reusable, but it is not yet consistent enough for long-play comfort.

Main strengths:

- One central sound manager exists.
- Sound triggers are already spread through UI, Mytes, and objects.
- Ambient and music concepts already exist.
- Myte animation is time-based, not frame-looped blindly.
- Terrain data already exists, which makes future surface-based footsteps realistic.

Main problems:

- Loudness is not mixed through a stable bus structure.
- Audio settings are not consistently applied or persisted.
- Ambient, music, UI, object, and Myte sounds are grouped too broadly.
- There is no true footstep system yet.
- There is no object-distance audio behavior.
- Variation is mostly absent or too global.
- There are no sound prioritization rules, caps, ducking rules, or comfort protections.

## Detailed Audit

### 1. Loudness Normalization

Status: weak

Current issues:

- The system relies on per-sound handcrafted levels more than category gain staging.
- Source sounds have inconsistent base levels and synth designs, so perceived loudness varies sharply between object actions and entity reactions.
- There is no compressor, limiter, or transient control stage protecting the player from spikes.
- There is no prioritization or cap system for dense simultaneous events.
- Object and entity sounds do not appear to use distance attenuation, so "near" and "far" are mostly psychological accidents rather than intentional mixing.

Important implementation concern:

- `master` volume is being applied both at `Tone.Destination` and again inside per-sound volume calculations in `SoundManager`. That risks double-scaling and makes balancing less trustworthy.

Recommendation:

- Create explicit buses: `Master`, `Music`, `Ambience`, `UI`, `World`, `Entities`, `Footsteps`, `Machines`, `Notifications`.
- Apply `master` once at the top of the chain.
- Normalize authored sound families around target perceived loudness, not just peak values.
- Add a gentle master safety limiter.
- Add category caps for simultaneous one-shots.
- Add optional ducking where UI confirmations or reward sounds can momentarily sit above ambience without brute-force loudness.

### 2. Sound Category Routing

Status: partial foundation, inconsistent behavior

What exists today:

- Categories in settings: `master`, `ambient`, `music`, `ui`, `sfx`

What is missing:

- Dedicated `Footsteps`
- Dedicated `Entities`
- Dedicated `Environment`
- Dedicated `Machines`
- Dedicated `Notifications`
- Dedicated `Combat` if combat grows later

Important consistency problems:

- User audio preferences exist in `js/User/User.js`, but they are not clearly being pushed into the live sound system during normal startup.
- `js/User/UserSettings.js` exists but does not appear to be wired into the active flow.
- `js/UI/panels/SoundPanel.js` updates the live `SoundManager`, but does not clearly persist those changes back to user preferences.
- Ambient behavior is tied inconsistently to `soundEnabled` and `musicEnabled`, which makes routing and user expectation fuzzy.
- "Sound Effects" as a setting currently behaves more like "everything except music" in some paths.

Recommendation:

- Route every sound through a declared semantic category, not a fallback bucket.
- Make settings authoritative and persistent.
- Separate `ambient` from `music` behavior completely.
- Remove hardcoded ad hoc volume intent from call sites and move it into category and content definitions.

### 3. Footstep and Animation Synchronization

Status: not implemented yet, but very possible

What exists:

- Myte movement speed changes through `js/Myte/MyteStats.js`
- Myte animation timing is handled in `js/Myte/StateMachine.js`
- Current movement animation playback does not appear to scale with movement speed
- Current state sound hooks fire on state transitions, not specific contact frames

What should happen:

- Locomotion animation rate should scale with effective move speed inside a safe band.
- Footsteps should fire on foot-contact frames.
- Surfaces should come from terrain tags first, then object overrides.
- Volume and pitch should respond subtly to state:
  - tired
  - excited
  - sneaking
  - heavy vs light
  - wet or soft surfaces

Recommended architecture:

- Add optional animation events to sprite set definitions or state config.
- Add a `FootstepController` for cooldowns, left/right alternation feel, surface lookup, and subtle variation.
- Keep authored control: events should be data-driven, not guessed only from distance moved.

### 4. Repetition Fatigue

Status: moderate risk

Current issues:

- Many interactions map to a single exact sound.
- Variation pools are not a core system yet.
- The global debounce in `SoundManager` is useful, but it is not the same as a repetition system.
- UI sounds are consistent, which is good, but could become fatiguing if used too often at the same transient and brightness.
- Machine and ambient loops do not yet appear to use slow contextual evolution.

Recommendation:

- Add weighted variant pools for sounds heard constantly.
- Add per-event cooldown windows, not just per-sound debounce.
- Add "recently played" suppression for spam-prone families.
- Use alternating variants for footsteps and pickups.
- Favor microvariation over obvious randomness.

Good candidates for early treatment:

- footsteps
- pickup and inventory handling
- repeated object toggles
- idle creature vocalizations
- reward sounds

### 5. Environmental Responsiveness

Status: minimal

What exists:

- Time-of-day based music and ambient selection

What is missing:

- biome response
- indoors vs outdoors
- room tone
- weather response
- local machine density
- crowd density
- slow ambient evolution across context changes

Recommendation:

- Split ambience into global bed plus local emitters.
- Use slow crossfades, not hard swaps.
- Let map, biome, weather, and time each contribute small layers rather than one giant mode switch.
- Keep ambience low-information so it supports mood instead of stealing focus.

### 6. Entity Audio Design

Status: early stage

What exists:

- Mytes have jump, land, battery, happy/sad, eat, pickup, and putdown sounds
- Speech synthesis system exists for vocal texture

What is missing:

- stateful idle vocalization logic
- fatigue effort sounds
- hunger or sickness timbre shifts
- distance-aware filtering
- emotional readability through controlled vocal families

Recommendation:

- Treat entity sound as behavior communication, not decoration.
- Build state-based layers:
  - locomotion effort
  - idle murmurs
  - social reaction
  - reward/comfort sounds
  - distress signals
- Keep creature unpredictability slow and bounded.

### 7. Machine and Device Audio

Status: underdeveloped

Current issues:

- Objects have good one-shot identity starts, but not enough living loop behavior.
- Some ambient-style object presets exist but do not appear fully integrated into world playback.
- Machine sound identity should come from repeatable pattern and condition, not raw randomness.

Recommendation:

- Give machines a stable loop core plus state-based modifiers.
- Variation should come from:
  - timing drift
  - wear
  - load
  - phase offset
  - intermittent mechanical detail
- A music box, fountain, lantern, or portal should each have a clear "signature rhythm of life."

### 8. Performance and Scalability

Status: acceptable at small scale, risky at larger scale

Current concerns:

- No robust event-priority or voice-cap system
- No clear max simultaneous one-shot policy per family
- No spatial culling for irrelevant world sounds
- No dedicated audio pooling layer for many positional variants
- Runtime randomness is content-local rather than system-managed

Recommendation:

- Add per-category and per-family voice limits.
- Add event priority rules:
  - player feedback first
  - nearby gameplay-critical world sounds second
  - decorative world sounds last
- Add positional eligibility checks before playing world sounds.
- Cache reusable event descriptors instead of recomputing every time.

## Player Psychology Notes

- The player should trust UI and movement sounds immediately.
- Reward sounds should feel crisp, brief, and satisfying.
- Frequent sounds should lean soft and rounded in the upper mids to reduce fatigue.
- Sudden loudness jumps from normal play break comfort faster than occasional repetition does.
- Consistency creates attachment. A Myte's sound language should become familiar, not surprising for its own sake.

## Highest-Priority Problems To Fix First

1. Make settings authoritative and persistent.
2. Fix category routing so ambient, music, UI, entities, and world sounds have clear ownership.
3. Remove master-volume double-scaling and establish stable gain staging.
4. Add a footstep architecture based on animation events plus surface tags.
5. Add simultaneous sound caps and priority rules.
6. Add subtle variation pools to the most repeated sounds.

## Recommended Architecture Direction

### Audio buses

- `Master`
- `Music`
- `Ambience`
- `UI`
- `World`
- `Entities`
- `Footsteps`
- `Machines`
- `Notifications`

### Sound event definition shape

Each sound event should eventually define:

- `id`
- `category`
- `baseGain`
- `variants`
- `pitchJitter`
- `gainJitter`
- `cooldownMs`
- `priority`
- `maxSimultaneous`
- `duckingProfile`
- `surfaceTags`
- `stateTags`
- `spatialProfile`

### Footstep system shape

- Animation event authored per locomotion state
- Surface resolver from tile terrain or object override
- Variant pool per material
- Very subtle pitch wobble
- Slight gain difference between left and right, if desired
- Movement-speed-aware interval only as backup, not primary trigger

## Best-Practice Rules For This Project

- Favor clarity over spectacle.
- Reward audio can be sweeter and brighter than normal world audio.
- Player-owned actions should never feel delayed, weak, or uncertain.
- Creature sounds should feel emotionally legible before they feel clever.
- Randomness should support identity, not replace it.
- Every new sound should declare a category and intended loudness role before it is added.

## Final Direction

The sound system should feel like a living craft layer over the simulation: soft where the player lives for a long time, clear where the player needs trust, and delightfully tactile where the game rewards attention.

The best version of this game's audio is not "more sounds."

It is:

- better hierarchy
- better state communication
- better comfort
- better timing
- better restraint
