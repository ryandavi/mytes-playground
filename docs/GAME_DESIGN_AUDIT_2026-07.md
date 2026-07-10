# Game Design Audit — Fun, Feature Gaps & Easy Wins

**Date:** 2026-07-10
**Scope:** Gameplay, not architecture. What systems exist, how they could work together, what's missing for *fun*. Companion to `ARCHITECTURE_AUDIT_2026-07.md` (which covers the plumbing this doc assumes will land: WorldQuery, EntityRelationships, sockets).

---

## 1. Systems Inventory — what the game already has

| System | State | Fun ceiling today |
|---|---|---|
| Myte AI (needs → drives → scored candidates) | Strong | High — but its choices are invisible to the player |
| Stats + 37 buffs + personality (curiosity, sociability, activity, confidence) | Strong | Buffs are rich but mostly unnoticed |
| ~54 actions incl. social (greet, tag, chase, affection, give item, fetch, dance) | Strong | One-shot; nothing accumulates between mytes |
| Gardening: crops, fruit trees, **breeding flowers with genes + mutation**, night blooms | Strong mechanics | **Resets on reload** — the loop can't pay off |
| Ambient creatures: birds, bees, butterflies, hive | Good | Decorative; don't react to mytes |
| Day/night: 18 named time periods, seasons, weekdays, lighting rooms | Very rich | Almost nothing consumes it |
| Furniture + sockets: couch (multi-seat), bed, chest, fountain, lantern, music box, mirror, plushie, ball | Good | Solo use only |
| Items: 24 (9 food, 11 flowers, toy, coin, health orb) | OK | Coins have no sink; flowers have no use |
| Zones: rest/play/social/food/danger/boost | OK | `boost` is empty; invisible to player |
| Toasts, tooltips, HUD (name/mood/battery), myte list, action sidebar | Good | No history — everything is ephemeral |
| Speech synthesis (phoneme babble), dialogue bubbles, footsteps, Tone.js audio | Charming | Underused for myte↔myte moments |
| Persistence: user + roster only | Partial | World state (plants, chests, dropped items) resets |
| `experience` field on MyteStats | **Dead** | Written, serialized, never incremented or read |

**The diagnosis in one line:** the simulation is deep but *silent, amnesiac, and purposeless* — the AI does interesting things nobody sees, relationships and gardens don't persist, and coins/XP/flowers lead nowhere. The biggest fun wins are feedback, memory, and sinks — not new mechanics.

---

## 2. The Event Log — yes, build it

An MMORPG-style log is the single highest leverage feature here, because the content already exists: the AI is constantly making decisions, buffs fire, chests open, flowers cross-pollinate — and the player sees almost none of it. A log converts existing simulation into visible fiction for near-zero content cost.

### Fit with the aesthetic
This is a gift for the Win98–XP theme: a **system event log / IM-style window** ("Mytes Messenger"). Beveled inset panel, `--surface-ui-inset`, timestamped lines, maybe an ICQ-ish blip per entry category. It can live as a collapsible panel in the sidebar or a toggleable window like the debug panels.

### Design

```
[9:42 AM] ★ Mimi found 3 coins in the treasure chest!
[9:44 AM] ♥ Bubbles showed affection to Mimi.
[9:51 AM] ✿ A new flower bloomed: Blue Moon (mutation!)
[9:53 AM] Z Mimi curled up on the couch.
[10:02 AM] ! A slime is chasing Bubbles!
```

- **Foundation:** `EventManager` is nearly unused today (7 event names total). The log is the forcing function to make systems emit — `myte:action_completed`, `item:acquired`, `plant:matured`, `plant:mutated`, `chest:opened`, `buff:gained`, `zone:entered`, `myte:leveled` etc. Each emission becomes free fuel for *future* systems too (achievements, stats page, quest triggers).
- **`GameLog` class:** subscribes to events, formats via a data-driven template table (`data/metadata/log-events.json` — id, template string, category, icon, rarity/color), keeps a ring buffer (~200 entries), persists the last N to localStorage so the log survives reload (instant "the world remembers" feeling even before world persistence lands).
- **Categories + filter chips:** Loot / Social / Garden / Danger / System — reuse the existing chip strip pattern (`CompactChipStripUI`).
- **Toast integration:** rare entries (mutation, chest loot, level-up) *also* fire a `ToastSystem` toast. Log = history, toast = interrupt. One emit, two consumers.
- **Click-to-focus:** log entries that reference an entity pan the camera to it (camera + `objectsById` already exist). This makes the log a *navigation* tool, which is what makes MMO logs sticky.

**Timestamps use `GameTime`** (in-game clock, "9:42 AM, Spring, Day 3") not wall clock — it makes the rich time system visible for free.

### How to build it

The event plumbing already exists and is trivially extensible: `Core.eventManager` (`js/Engine/EventManager.js`) is a plain `on/emit` map, instantiated at `Core.js:20`. The work is **instrumentation points + one consumer**, in this order:

1. **Instrument the choke points, not the 54 actions.** Almost everything funnels through a handful of methods:
   - `MyteAction.complete()` (`BaseActions.js:103`) — one emit here (`myte:action_completed`, payload `{ myte, actionId, target }`) covers every action in the game. The action definition (via `ActionDefinitionRegistry`) tells the log which completions are worth a line.
   - `MyteBuffController` apply/expire → `myte:buff_gained` / `myte:buff_expired`.
   - `TreasureChestMapObject.spawnItems()` (`TreasureChestMapObject.js:334`) → `chest:opened` with the resolved item list.
   - `BreedingFlowerMapObject` pollination success / mutation roll → `plant:pollinated`, `plant:mutated`.
   - `GrowingPlantMapObject` stage transitions → `plant:matured`.
   - `User.addCurrency` (`User.js:256`) → `user:currency_changed`.
   - `ZoneManager` enter/exit (lands properly with the architecture audit's region-membership events; until then, skip zone lines).
2. **`GameLog` manager** — new file `js/UI/Container/GameLogManager.js`, extending `UIComponent` like the other managers, constructed by `UserInterface`. It subscribes to the events above and does nothing else; systems never call the log directly.
3. **Templates in `data/metadata/log-events.json`** — matches the existing metadata pattern (loaded like `buffs.json` via a small registry or plain `ResourceManager` fetch):
   ```json
   { "id": "chest:opened", "category": "loot", "icon": "★", "rarity": "notable",
     "template": "{myte} found {items} in the treasure chest!" }
   ```
   `{myte}` renders as the myte's name and carries a `data-entity-id` for click-to-pan. Events with no entry are simply not logged — instrumentation can outpace content safely.
4. **Rendering:** ring buffer (~200 entries) + a `<ul>` appended per entry; no per-frame work. Persist the last ~50 rendered entries (plain strings + game-time stamps) to localStorage under a `gamelog` key, restored on boot. Entries with `rarity: "notable"` also call `Core.toastManager.info(...)` (`ToastSystem.js:307`).
5. **Click-to-pan:** on entry click, resolve `data-entity-id` via `gameMap.objectsById` / roster lookup and call the existing camera focus used by `OffscreenMyteIndicatorManager`.
6. **Registration:** new JS files must go through `node scripts/build-manifest.js` (script tags are manifest-generated). SCSS for the panel goes in a new partial under `css/`, compiled with the standard sass command.

Sizing: instrumentation ~1 line per site; `GameLogManager` + JSON + SCSS is the real work. Ship categories incrementally — Loot + Garden first (rarest, most exciting), Social once bonds (§3.1) exist.

---

## 3. Myte ↔ Myte Interactions — from one-shots to relationships

Today every social action is stateless: greet, play tag, walk away, forget. The architecture audit's `EntityRelationships` registry handles *mechanical* pairs (carrying, occupying). The fun layer on top is **social memory**:

### 3.1 Friendship / bond score (the keystone)
- Per-pair value stored on the roster (`bonds: { otherMyteId: number }`), incremented by completed social actions (weights per action: affection > tag > greet), decayed very slowly.
- **AI integration is cheap:** `MyteAI` already scores social candidates — add a bond multiplier so friends seek each other out. Emergent cliques appear with ~10 lines of scoring code.
- **Visible payoffs:** bond tier shown in myte tooltip/list ("Best Friends ♥♥♥"); log entries ("Mimi and Bubbles are now friends!"); the existing `companionship_aura` buff scales with bond tier.

**How:**
- **Storage:** add `bonds: { [otherMyteId]: number }` to the roster entry in `MyteRosterSchema.serialize/applyToMyte` (`MyteRosterSchema.js:75-140` — follow the `traits` pattern: plain object, spread-merged on load). Runtime home: `MyteStats` or a tiny `MyteBonds` helper on the myte; keep values 0–1.
- **Earning:** hook the same `MyteAction.complete()` emit from §2 — a `BondSystem` listener maps social action ids → bond delta (data: add `bondReward` to the social entries in `actions.json`, read via `ActionDefinitionRegistry`). Both participants gain; decay applies a tiny per-game-day drain (tick it from `GameTime` day-change, not per frame).
- **AI bias:** in `MyteAI`'s social candidate builders, multiply the candidate score by `1 + bond * SiteConfig.ai.scoring.bondWeight` when scoring a specific partner. The shortlist-with-random-roll selection (`MyteAI.js:176-193`) already softens it so friends are *preferred*, not exclusive.
- **Tiers:** thresholds in `SiteConfig` (acquaintance/friend/best friend); crossing a threshold emits `myte:bond_tier` → log + toast. No UI beyond tooltip text until it's proven fun.

### 3.2 Conversations (biggest charm-per-effort ratio)
`MyteSpeech` (phoneme babble) + `MyteDialogue` (bubbles) + `ActionSync` (two-party choreography, proven by Greet) already exist. A `ChatAction`: two mytes face each other and *alternate babble* with reaction expressions — one listens while the other "talks," swap, 2–3 rounds. Pure recombination of existing pieces, and it's exactly the kind of thing players screenshot.

**How:** copy the `GreetAction`/`GreetReceiveAction` pair in `SocialActions.js` verbatim as the skeleton — initiator queues `chat_receive` on the target with a shared `ActionSync`, both signal when positioned and faced (`_faceTarget` already exists there). Replace the single wave expression with a turn loop: initiator babbles (`MyteSpeech` a short random syllable string + `MyteDialogue.showMessage` with a nonsense glyph string) while the receiver plays a listening expression, then swap on a shared turn counter. Add `chat` + `chat_receive` entries to `actions.json` (traits: `social`, `soothing: 3`, `novelty: 2`) so the AI picks it up through the existing social candidate builder, weighted by bond (§3.1). Durations in ms via the action definition, not frame counts.

### 3.3 Shared furniture moments
Multi-seat couch occupancy already works (`ActionSlotLedger`, 2 seats). Add: when a myte picks a couch, bias toward one that a friend is already sitting on (bond score × occupancy check). Sitting adjacent grants a small shared buff and occasional synchronized expressions. "Two friends watching TV together" energy with no new mechanics — just AI scoring + a buff.

**How:** in the AI's surface-slot candidate scoring, query the target's `ActionSlotLedger` occupants and add `bond(occupant) * weight` to the score. The shared buff is a new `buffs.json` entry applied by `SurfaceSlotAction`'s rest phase when another occupant is present (it already applies buffs on settle). Do this *after* the architecture roadmap's socket refactor if it's imminent — otherwise the occupant query is still fine against the current ledger.

### 3.4 Gift preferences
`GiveItemAction` exists; items have categories. Give each myte 1–2 favorite item categories derived from its personality seed (curious → toys, sociable → flowers). Favorite gift → bigger bond bump + `heart` expression + log entry; disliked → comical `disgust`. Makes the 11 currently-useless flowers *matter* and gives the player a reason to garden.

**How:** derive favorites deterministically from existing personality traits (no new saved state): a pure function `getFavoriteCategories(stats.traits)` with the mapping in `SiteConfig`. In `GiveItemAction.complete()` (`SocialActions.js:280`), look up the item's `category` in `ItemRegistry`, compare, and branch expression + bond delta. Reveal favorites in the myte tooltip only after the first successful gift (stored as a small `discovered` set on the roster entry) — discovery is the fun part.

### 3.5 Asymmetric / spicy interactions (later)
Personality already varies per myte — use it for friction, not just harmony: a low-sociability myte occasionally *snubs* a greeting (initiator gets `disturbed` buff, log entry, small bond dip); a high-activity myte steals the ball mid-fetch and triggers a chase. Comedy comes from things going slightly wrong. All composable from existing actions + interrupts.

**Ordering:** 3.1 first (everything else multiplies off it), then 3.2, 3.3, 3.4.

---

## 4. Ambient Creatures

Rules that made birds/bees good: cheap (velocity wander, no pathfinding), interact with *one* existing system (perching, pollination), and sell the world as alive. Candidates in that mold, each hooked to a system that already exists:

| Creature | Hooks into | Behavior |
|---|---|---|
| **Firefly** ★ | Night periods + lighting + NightBloom | Spawns only at `dusk`→`late_night`, drifts near night blooms, emits a small light source. Makes the entire (currently underused) night cycle worth watching. |
| **Frog** | Water zones (`water_lake/river`) | Sits at water's edge, hops occasionally, croak audio at dusk. Mytes can `inspect` it; it hops away — free novelty target for the AI. |
| **Moth** | Lanterns + night | Nocturnal pollinator variant orbiting lit lanterns — reuses `PollinatorCreatureMapObject` nearly verbatim, rewards the player for lighting lamps. |
| **Ladybug** | Crops/plants | Crawls (not flies) on mature plants; tiny growth-speed aura on the plant it occupies — first creature with a gameplay effect. |
| **Dust bunny** ★ (virus theme) | Indoor rooms | Drifts in house corners; a myte that inspects it "pops" it (sneeze expression + particle). On-theme mischief: the OS is dusty inside. |
| **Glitch sprite** (virus theme, later) | Rare/night | Flickering pixel-artifact critter; chasing it down gives coins/XP. A rare-spawn "shiny" that gives the log something exciting to announce. |

★ = do first. Also cheap: **make existing creatures react to mytes** — birds flush when a myte runs close (grid query + flee vector), butterflies get chased (AI already has `chase`; let butterflies be valid targets). Creatures that *respond* read as 10× more alive than new creatures that don't.

(Weather creatures — worms after rain — wait until weather actually exists.)

### How to add a creature (the recipe)

Every creature above is a subclass + a data entry — the pattern is fully established:

1. **Data:** add a type entry to `data/map-objects/types.json` (copy BIRD or BUTTERFLY as the template — sprite sheet, `physics`, movement speeds, spawn config). Sprite goes in `images/`.
2. **Class:** extend `AmbientCreatureMapObject` (wanderers: firefly, dust bunny) or `PollinatorCreatureMapObject` (target-seekers: moth, ladybug — override `findTarget()` with a grid query for lit lanterns / mature crops, exactly as `BirdMapObject.findTarget` queries perch objects). Register in `MapObjectFactory` + run `node scripts/build-manifest.js`.
3. **Time gating (fireflies, moths):** check `GameTime` period in the spawn condition and fade out (despawn) outside the window — `NightBloomMapObject` already demonstrates period-gated behavior to copy from.
4. **Light emission (firefly):** reuse the lantern's lighting config (`lighting` block in types.json) at low radius/intensity.
5. **Reactions (flushing birds):** in the creature's `tickUpdate`, a cheap radius check for fast-moving mytes → set flee velocity. Note mytes are not in the grid index yet (architecture audit C1) — until that lands, read `containerManager.mytes` directly like `NpcMapObject._detectTargets` does; swap to `WorldQuery` when available.
6. **Chaseable butterflies:** add butterflies to the AI's novelty candidate builder as valid `chase` targets (`canPerform` in `ChaseAction` currently requires `Myte` — widen it to accept ambient creatures) and give the creature a "flee from chaser" response. The comedy is the myte never catching it.

---

## 5. Easy Wins

### UX (feedback layer — days, not weeks)
1. **Need bubbles.** When the AI commits to a need-driven action, show a small thought bubble over the myte (🍎 / 💤 / ♥). This single feature makes the AI legible and is probably the best hour-for-hour improvement in the game.
   *How:* `MyteAI` already plays expressions for a few decision types (`MyteAI.js:995-999` — sleep/thought/surprise). Generalize: give each candidate builder a `driveIcon`, and after `chosen.execute()` (`MyteAI.js:168`) show it via the expression system or a `MyteDialogue.showMessage` variant styled as an icon bubble. Data-drive the icon map in `SiteConfig.ai`.
2. **Clock/season in the HUD.** `GameTime` has 18 named periods, seasons, weekdays — show a tiny Win98 taskbar-corner clock. Zero new simulation.
   *How:* follow `HUDManager`'s exact pattern (250ms throttle + `lastRenderedState` diffing, `HUDManager.js:28-45`); read `GameTime` getters; markup next to `#hud-active-pet` in `index.php`/`index.html` (both files).
3. **Stat/buff change feedback.** Floating `+comfort` motes on significant stat gains; buff tooltips already exist in the overlay — add gain/loss toast for the rare ones only.
   *How:* consume the §2 `myte:buff_gained` event; motes via `ParticleSystem` or a short-lived absolutely-positioned span (the drop-shadow token aesthetic, not smooth fades).
4. **Coin counter in HUD.** Currency exists and is earnable (chest) but is displayed nowhere.
   *How:* emit `user:currency_changed` from `User.addCurrency/spendCurrency` (`User.js:256-266`); HUD listens. Ten lines.
5. **Zone visibility on hover.** Zones affect stats invisibly; a subtle tint + label when hovering/toggling (the debug renderer already draws them — promote a prettier version of `Zone.createVisualElement`).
6. **Click log entry → camera pans to subject** (see §2).

### Gameplay (weeks)
7. **Wire up `experience`.** The field exists and persists (`MyteStats.js:16`, saved via `MyteRosterSchema.js:89`), but nothing increments it. Increment on completed actions, show level in the myte list, level → small stat-cap or personality drift. Instant progression skeleton.
   *How:* in the §2 `myte:action_completed` listener, award XP = f(action traits) — `novelty`/`exertion` weights are already in `actions.json`, so no per-action data needed. Level thresholds + reward curve in `SiteConfig.stats`. Emit `myte:leveled` → log + toast.
8. **Coin sink: a tiny shop.** Even 5 purchasables (seeds, ball colors, a plushie, couch variant) closes the loop: chest → coins → shop → item → gift/garden → bond/log.
   *How:* `data/metadata/shop.json` (id, price, grants: item id or map-object spawn), a `ModalWindow`-based panel (pattern: `SettingsPanel`), `User.spendCurrency` already handles the transaction. Mostly data + one panel.
9. **World persistence for the garden.** Serialize plant growth stages + chest state + dropped items into the save. The breeding-flower system (genes! mutations!) is the game's most distinctive mechanic and currently amnesiac. This is the difference between a toy and a tamagotchi.
   *How:* per-map `worldState` keyed by map id in localStorage: each persistent object contributes `{ id, growthStage, genes, state }` via a `serialize()` on the classes that need it (GrowingPlant tree, chest, dropped items as `{ variant, x, y }`). Rehydrate in `GameMapLoader` after object creation by id match; unmatched ids are dropped silently (maps evolve). **Design this against the architecture audit's persistence notes** (attachments serialize by id) so the schemas converge — this is the one easy-win with real cross-system risk.
10. **Music box dance party.** Music box + `dance` action + `music_aura` all exist: when the music box is playing, a radius query biases nearby mytes toward `dance` (aura buff or AI candidate bonus). Multi-myte emergent moment, ~zero new assets.
11. **Fill the `boost` zone** (currently `effects: []` in `zones.json`) or delete it.
12. **Chest loot variety.** Chest spawns only coin/health-orb (`TreasureChestMapObject.js:170`); pull from a loot table over the item catalog (flowers, seeds, rare toy) so opening it stays exciting — and log the result.
    *How:* the chest already resolves `items` config through `normalizeItems` → `ItemRegistry`; move the hardcoded variant pick into a weighted `lootTable` block on the TREASURE_CHEST entry in `types.json`. Pure data + ~20 lines.

---

## 6. How it composes — one flywheel

```
        Garden (persisted §5.9)              Ambient life (§4)
   seeds → crops → flowers/food                fireflies, frogs
          │        │                                │
          │        ▼                                ▼
 shop ◄─ coins   gifts (§3.4) ──► bonds (§3.1) ──► social moments (§3.2, §3.3)
 (§5.8)   ▲                                         │
          │                                         ▼
        chests ◄──────────── EVENT LOG (§2) + need bubbles (§5.1)
                        makes every arrow above VISIBLE
```

The log and the need bubbles are the multiplier: every other feature becomes more fun because the player can finally *see it happen and remember it happened*.

### Suggested order
1. **Need bubbles + HUD clock + coin counter** (§5.1, 5.2, 5.4) — feedback first, all tiny. — ✅ *Need bubbles shipped 2026-07-10 (Fable); clock + coin counter dispatched as D8 in `CODEX_GOALS.md`.*
2. **Event log** (§2) — needs the event emissions; do it before new features so they emit from day one. — ✅ *Shipped 2026-07-10 (Fable): `GameLogManager` + `log-events.json` (19 templates) + 3 emit sites, browser-verified (log lines, toast on notable, filters, click-to-pan, localStorage restore). Remaining emit sites in D8.*
3. **Bond score + AI bias** (§3.1), then **conversations** (§3.2).
4. **Garden persistence** (§5.9) + **chest loot table** (§5.12).
5. **Fireflies + dust bunnies + creature reactions** (§4).
6. **XP + shop** (§5.7, 5.8) — progression once there's something to progress toward.

Items 3+ benefit from the architecture roadmap's `WorldQuery`/`EntityRelationships` phases — bonds and social targeting should be built *on* the relationship registry, not beside it.

---

## 7. Execution Plan — what Fable tackles, what gets delegated

Split by the same rule as the architecture roadmap: **Fable takes work whose cost is judgment** (cross-system contracts, feel/tuning, schema design that other features will build on); **delegate work whose cost is typing** (isolated, pattern-following, verifiable against a written spec).

### Fable should tackle directly

| Work | Why it's Fable-shaped |
|---|---|
| **Event instrumentation + `GameLog` architecture** (§2) — ✅ **shipped 2026-07-10** | The event taxonomy is a *contract* — every future system (achievements, quests, stats page) consumes it. Choosing payload shapes and choke points wrong is expensive to unwind. Fable designs and lands the skeleton + 2–3 instrumented sites; remaining emit sites become delegable one-liners. *Landed: `myte:action_completed` (BaseActions), `chest:opened` (chest), `user:currency_changed` (User); `GameLogManager` ModalWindow with filters/toasts/click-to-pan/persistence; need bubbles (`MyteAI.showNeedBubble` + `SiteConfig.ai.needBubbles`). Remaining emits → D8.* |
| **Bond system + AI scoring integration** (§3.1) | Touches `MyteAI` scoring feel — the July stats audit already found tuning is fragile. Needs judgment about weights, decay, and interaction with the shortlist roll, plus the roster schema change. |
| **World persistence schema** (§5.9) | Save-format decisions are one-way doors, and it must converge with the architecture audit's attachment/relationship serialization. Highest cross-system risk on the list. |
| **`ChatAction` choreography** (§3.2) | `ActionSync` two-party interrupts are subtle (the June action-system work shows the edge cases: partner carried, despawned, interrupted mid-turn). Also the flagship charm feature — worth first-party polish. |
| **Need bubbles** (§5.1) | Small, but it lives inside the AI think loop and sets the visual language for AI legibility; get it right once, then icon additions are data. |

### Delegate (Codex /goal-style, one goal each, spec in hand)

| Work | Spec anchor |
|---|---|
| HUD clock/season + coin counter (§5.2, §5.4) | `HUDManager` pattern; emit from `User.addCurrency` |
| Chest loot table (§5.12) | `types.json` `lootTable` block + `normalizeItems` |
| `boost` zone fill-or-delete (§5.11) | `zones.json` |
| Remaining event emit sites after the log skeleton lands (§2.1) | Payload shapes fixed by Fable's contract |
| New creatures: firefly, moth, dust bunny, ladybug (§4) | The 6-step recipe above; one goal per creature |
| Creature reactions: flushing birds, chaseable butterflies (§4.5–6) | After WorldQuery, or via the `NpcMapObject._detectTargets` interim pattern |
| Gift preferences (§3.4) | Pure function + `GiveItemAction.complete()` branch |
| XP wiring (§5.7) | Listener over the §2 event + `SiteConfig` curve (Fable reviews the curve) |
| Shop panel (§5.8) | `shop.json` + `ModalWindow`/`SettingsPanel` pattern — later, once there's something worth buying |
| Music box dance bias, zone hover tint (§5.10, §5.5) | Isolated; existing pieces named above |

### Sequencing note

The dependency spine is: **event contract (Fable) → log + feedback UX (mixed) → bonds (Fable) → everything social (delegable)**. Nothing in §4 or the delegable §5 items blocks on any of it — creatures and loot tables can run in parallel from day one. Don't start the shop or XP until the log exists to announce them; progression nobody sees is just arithmetic.
