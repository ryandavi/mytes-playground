Audit and refactor the MyteAI need/drive system in the attached MyteAI class and all related systems.

The current implementation works, but several concepts overlap or are conflated, especially needs, derived drives, environmental pressures, long-term personality traits, debug values, and candidate scoring.

Goal:
Create a Sims-like but simpler and more emotionally readable autonomous AI system that feels alive, fun to watch, and easy to extend later.

Important:
This should not be a MyteAI-only refactor if related systems also need changes. Update every related system necessary so there is no legacy code, stale naming, duplicate behavior, or old need/drive logic left behind.

Related systems may include, but are not limited to:

* MyteAI
* Myte stats
* behavior/stat update systems
* SiteConfig AI config
* action definitions
* affordance definitions
* map object config
* zone config
* debug snapshots
* debug UI
* tooltips/labels
* save/load defaults
* object interaction metadata
* any systems that currently reference old need names, drive names, confidence, comfort, enrichment, play, home, lightNeed, musicNeed, or boredom

Do not leave behind old concepts unless they are intentionally preserved and renamed clearly.

Preserve where possible:

* candidate scoring architecture
* novelty/memory systems
* affordance-based interactions
* debug snapshots
* repeat penalties
* emergency safe return behavior
* existing autonomy modes
* existing action queue behavior

Current concerns:

* `home` behaves more like a safety/familiarity/fallback pressure than a true emotional need.
* `enrichment` and `play` overlap heavily with fun/boredom.
* `comfort` exists as both a need and a derived behavioral motivation.
* `lightNeed` and `musicNeed` may belong under a broader environment system instead of being standalone pseudo-needs.
* Confidence exists, but should have stronger behavioral impact.
* Some future mechanics are not fully implemented yet, but the foundation should exist now so future code can naturally hook into it.

Desired core needs:

* energy
* hunger/fuel
* fun
* social
* comfort
* environment

Long-term stats/personality:

* confidence
* curiosity
* activity
* neediness

Derived drives, computed dynamically from needs, traits, environment, and context:

* restDrive
* eatDrive
* playDrive
* socialDrive
* exploreDrive
* comfortDrive
* safetyDrive

Needs vs drives:

* Needs are persistent state values.
* Drives are temporary motivations calculated from needs, traits, context, affordances, and environment.
* Actions should be selected based on drives.
* Debug output should clearly distinguish needs, drives, vitals, traits, and pressures.

Energy:

* Low energy should heavily influence rest behavior.
* Exhaustion should still trigger emergency safe return behavior.
* Energy should affect willingness to play, explore, socialize, and interact.

Hunger/fuel:

* Add or prepare a hunger/fuel need if not fully implemented yet.
* Food-related dropped items and edible affordances should be able to satisfy it.
* If the full gameplay loop is not ready yet, create safe defaults and TODO comments so future systems know where to hook in.

Fun:

* Replace most current enrichment/play overlap with a clearer fun system.
* Fun should be affected by boredom.
* Toys, social play, music, running, novelty, inspecting, and discovery can restore fun in different amounts.
* Enrichment can exist as an environmental/action tag, but should not be a duplicate need unless there is a clear reason.

Environment:

* Environment should represent overall environmental satisfaction.
* It may be affected by:

  * lighting
  * music
  * coziness
  * decoration density
  * stimulation
  * clutter/crowding
  * scary objects
  * calming objects
  * environmental quality
  * active zones
* Existing `lightNeed` and `musicNeed` should be folded into environment scoring or renamed as environment subpressures.
* Future map objects should be able to declare environmental effects, such as:

  * scary
  * cozy
  * noisy
  * calming
  * bright
  * dark
  * musical
  * cluttered
  * social
  * playful
* If I later add a scary map object, the AI/stat systems should already have a clear place for that object to reduce comfort, environment, or confidence.
* If I later add a cozy object, the system should already have a clear place for that object to improve comfort/environment.
* This does not mean every object needs new behavior now, but the foundation and naming should be ready.

Comfort:

* Comfort should represent physical/emotional ease.
* Beds, cozy areas, flowers, fountains, warmth, soft objects, and calming environments can restore comfort.
* Comfort-seeking should be a derived drive, not a second separate need.
* Separate comfort from home/safety pressure.

Confidence:

* Confidence should strongly gate autonomous behaviors.
* Confidence is not just another need that fills and drains rapidly.
* Treat confidence as a long-term stat or temperament-like state.

Low confidence mytes:

* stay closer to familiar/safe areas
* avoid strangers
* avoid portals
* avoid opening chests
* avoid wandering far
* avoid risky/unknown interactions
* prefer familiar objects
* prefer comfort/rest/safe behaviors

Medium confidence mytes:

* greet nearby mytes
* inspect objects
* use toys
* explore nearby
* try mildly novel interactions

High confidence mytes:

* use portals autonomously
* open chests
* initiate social/play
* explore farther from home/safe areas
* investigate novel objects more aggressively
* tolerate scary/unknown objects better

Confidence growth foundations:

* positive player interaction
* successful exploration
* successful social interactions
* enriched/cozy environments
* repeated safe outcomes
* completing autonomous actions successfully
* discovering new objects without negative outcome

Confidence loss foundations:

* exhaustion
* failed interactions
* scary objects
* unsafe/scary environments
* neglect
* overstimulation
* negative social outcomes
* being forced into uncomfortable situations

Even if some of these triggers are not fully used in the game yet, set up the architecture so future actions, objects, zones, and events can call into the confidence system cleanly.

Home:

* Remove `home` as a true emotional need.
* Keep home as:

  * safe fallback
  * recovery location
  * familiar territory
  * low-confidence anchor point
* Rename internal pressure concepts if needed:

  * homePressure
  * safeReturnPressure
  * familiarityPressure
  * distanceFromSafeAreaPressure
* Do not remove emergency home/safe return behavior.
* Debug output may still show home/safety pressure, but it should not be grouped with true emotional needs unless intentionally justified.

Scary/cozy/environment object foundation:
Add or prepare a clean object metadata pattern so map objects can influence AI and stats.

For example, objects should eventually be able to declare things like:

* aiTags
* environmentEffects
* comfortEffect
* confidenceEffect
* funEffect
* scaryStrength
* cozyStrength
* noiseLevel
* lightLevel
* musicLevel
* noveltyValue
* riskLevel
* familiarityValue

Use whatever names fit the existing project style, but make the system consistent and extensible.

The AI should be able to read these effects when:

* building context
* scoring candidates
* completing actions
* updating needs/stats
* applying confidence changes
* building debug snapshots

Zone foundation:
Audit whether zones should also expose similar environmental/need effects.
For example:

* play zone increases playDrive/fun recovery
* rest zone increases comfort/restDrive
* social zone increases socialDrive
* scary zone lowers comfort/environment/confidence
* cozy zone improves comfort/environment
* dark zone affects environment depending on preference/personality

Do not overbuild, but create a consistent extension path.

Action/behavior result foundation:
Actions should be able to report effects in a consistent way.
For example:

* funDelta
* comfortDelta
* socialDelta
* environmentDelta
* confidenceDelta
* energyDelta
* hungerDelta
* novelty
* soothing
* accomplishment
* exertion
* scary
* safeOutcome
* failedOutcome

The existing `noteBehavior` system may already cover some of this. Audit it and either extend it or rename/reshape it so it fits the new model.

Candidate scoring:
Audit all candidate builders:

* rest
* home/safe return
* social
* play
* dropped item
* interaction
* need zone
* wander
* idle

Update them to use the new needs/drives terminology.

Examples:

* `buildPlayCandidate` should probably use `drives.play` or `drives.fun`.
* exploration/inspection should use `exploreDrive`.
* social behavior should use `socialDrive` and confidence gates.
* rest behavior should use `restDrive` and safetyDrive.
* home comfort behavior should become safe return, recovery, or familiarity behavior.
* object interactions should use object tags/effects and confidence/risk gating.

Debugging:
Keep and improve debug snapshots.
Debug output should clearly show:

* needs
* drives
* traits
* pressures
* environment details
* confidence
* last decision
* top candidates

If `getNeedsSnapshot` is only for debugging or UI inspection, keep it useful, but avoid using it as proof that something is a player-facing need. Rename or reorganize it only if that makes the debug output clearer.

No legacy code:
After the refactor, search the codebase for old names and remove or migrate them:

* enrichment as a need
* home as a need
* lightNeed as standalone need
* musicNeed as standalone need
* old comfort/home overlap
* old play/enrichment overlap
* any stale debug labels
* any stale config keys
* any stale comments

If backward compatibility is needed for saves/configs, add a clear migration layer or fallback mapping, but do not leave two competing systems active.

Config:
Move tuning values into config where practical:

* need weights
* drive weights
* confidence thresholds
* risk thresholds
* environment effect weights
* object tag effects
* zone effect weights
* distance/familiarity pressure values
* scoring thresholds
* emergency thresholds

Avoid hardcoded magic numbers where possible.

Deliverables:

1. Explain the revised architecture.
2. List every related system/file that should be updated.
3. Provide updated terminology.
4. Provide suggested config structure.
5. Provide concrete code changes.
6. Provide rewritten sections or full class updates where appropriate.
7. Provide migration notes for old names.
8. Provide TODO hooks for future mechanics that are not implemented yet.
9. Ensure no legacy code paths or duplicate concepts remain.
10. Make sure future code AI can clearly understand and reuse the new system.

The goal is not only to make the current AI work better, but to create a foundation that future mechanics can naturally plug into.
