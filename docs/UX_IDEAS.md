# UX & Feature Meaning Ideas

The core principle: **every system should create a feedback loop the player can feel.**
If a feature exists but doesn't change what the player does or how they feel about their myte, it's invisible noise.

---

## Systems That Exist But Currently Have No Meaning

These are the highest-priority items — the infrastructure is already there, it just isn't connected to anything the player cares about.

### Level & Experience (`MyteStats.level`, `MyteStats.experience`)
Right now `level` and `experience` are stored but never change and nothing reacts to them.

**Ideas to give them meaning:**
- XP accumulates from actions (playing, interacting with objects, social actions, discoveries). Level up at thresholds.
- Level unlocks new AI behaviors: a level 1 myte only wanders; level 3 can greet other mytes; level 5 can harvest and water plants autonomously.
- Level expands the myte's wander/object search radius — higher level = more curious, more confident exploring.
- A level-up moment: myte does the `celebrate` animation, speech bubble says something personal, small particle burst. The player sees the growth.
- Show level on the myte list thumbnail so players can compare their mytes at a glance.

### Traits (`neediness`, `activity`, `curiosity`)
Traits already bias behavior (speed, AI choices) but the player never knows what their myte's traits are or that they matter.

**Ideas to give them meaning:**
- Show traits on the myte info panel as a simple 3-bar display or personality label (e.g. "Energetic & Curious").
- Make traits *discoverable* — the player notices their myte acting differently before they see the number. The UI reveals what they've already felt.
- Traits shift slightly over time based on what the myte does: a myte that plays a lot becomes more active; one that's ignored becomes needier. Now caregiving has long-term consequences.
- Traits affect which items a myte prefers. A high-curiosity myte gets extra mood from inspecting objects; a low-activity myte gets more from resting in a cozy bed than from play fetch.

### Comfort & Confidence (behavioral drives)
These are calculated every frame but the player has no mental model of them and no reason to care.

**Ideas to give them meaning:**
- **Comfort** determines how far from home a myte will wander autonomously and how quickly they recover from being scared. Low comfort = myte sticks close and seems nervous. Show this through behavior, not just a number.
- **Confidence** determines which actions a myte will attempt on its own. A low-confidence myte won't greet other mytes, won't open chests, won't explore far. A high-confidence myte does all of these freely. The player builds confidence by interacting positively and placing mytes in enriched environments.
- Surface these states with behavioral tells (hiding near home slot, reluctance to move, shorter idle range) before showing numbers.

### Time System (day/night, seasons, moon phases)
The game has 20 time-of-day periods, 4 seasons, 8 moon phases, and growth multipliers — but nothing gameplay-relevant changes with them.

**Ideas to give them meaning:**
- **Night blooms** (`blue_moon`, `evening_star`, `night_whisper`) only open at night. Mytes can only smell/interact with them then. Creates a reason to check in after dark.
- **Seasonal crop availability**: tomatoes only grow in summer, berries in spring. Harvests give different items by season. Now the time system is the resource system.
- **Moon phase affects breeding flowers**: full moon = faster growth, faster color spread. New moon = dormant. Players who understand the cycle get more flowers.
- **Myte mood is time-sensitive**: mytes get sleepy at night (energy decay faster after midnight), more playful at dawn. Matches the biological feel.

### Chests & Loot
Chests exist and can be opened by mytes, but what's inside isn't visible or varied.

**Ideas to give them meaning:**
- Golden chests give significantly better loot than wooden ones — the visual difference needs to mean something.
- Mytes remember where chests are (`objectMemories` already exists) and autonomously return to ones they liked. The player sees their myte being strategic.

### Portals & Map Transitions
Portals exist and work but each map feels like an isolated pocket.

**Ideas to give them meaning:**
- Each map has a purpose/identity: outside map is for foraging (crops, wild food), house map is for rest and comfort recovery, a third map could be a social/interaction zone.
- Items only obtainable in certain maps. Reason to travel.
- Mytes can portal autonomously when confident enough (high confidence stat) and their AI drives push them toward what's on the other side.
- Show a preview of the destination map on the portal object when hovered.

---

## Features That Need a Feedback Loop

These exist and work, but the player doesn't feel the consequence.

### Health
Health can be reduced (`applyDamage`) and there's a `faint` expression — but nothing currently deals damage and health has no visible effect until it hits 0.

- What depletes health? Add at least one source: being exhausted for too long, falling from too high (physics already exists), failing a comfort check.
- What does low health feel like? Myte moves slower, expressions are sad more often, AI avoids play actions.
- What restores it? Medicine items (already in inventory system). Now medicine has a purpose.

### Boredom
Boredom accumulates and the myte says "bored..." but the player has no toolkit to address it directly.

- Map objects should be labelled by what need they address. A ball reduces boredom; a bed restores energy; a fountain is soothing (comfort). One visual indicator per object type is enough.
- When boredom is high, mytes start doing increasingly erratic things on their own (spinning, panicking, chasing butterflies obsessively). Boredom has behavioral consequences the player can see.
- Placing an enriching object in the world is the direct solution. This makes decoration purposeful.

### Feeding
Food items exist and improve mood, but eating has no ritual or feeling.

- Show a small "+mood" pop or a heart expression when a myte finishes eating — something that validates the player's action.
- Favorite foods: each myte definition has a `preferredFood` (or this could be derived from traits). Feeding a favorite gives a big mood boost and a special expression. Feeding a disliked food gives almost nothing.
- Hunger as a visible state: myte sniffs the ground, circles food sources, or does the `smell` animation near dropped food when mood is low.

### Myte Social Actions (greet, show affection, watch, play tag)
Social actions happen autonomously but feel random. There's no relationship state being built.

- Track time two mytes spend near each other as a "bond" score. After enough positive interactions, they're "friends."
- Friends greet each other faster, choose to be near each other more often, recover comfort faster when together.
- Show a small relationship indicator on the myte list when two mytes are bonded.
- Rivalries: if two mytes frequently interact negatively (runaway, panic near each other), they develop an avoidance bond instead. Adds personality to multi-myte setups.

---

## New Features Worth Adding

These don't exist yet but fit naturally into what's here.

### Myte Memory Journal
The AI already has `objectMemories` (remembers objects it's interacted with) and `recentHistory`. Surface this to the player.

- Small log on the myte's info panel: "Visited the fountain 3 times today. Opened a chest at midnight. Greeted Myte #2."
- This makes the player feel like they're watching a character live a life, not a widget running scripts.

### World-Space Need Indicators
The HUD shows stats but the player is usually looking at the world, not the HUD.

- Small floating icon above the myte when a need is critical (energy, boredom, comfort, mood). Disappears once addressed.
- Not permanent — only appears when a stat crosses a danger threshold, not as a constant overlay.
- This already partially exists via dialogue ("sleepy...", "bored...") but a visual icon reinforces it faster.

### Plant-to-Item Loop (Growing → Harvesting → Using)
The breeding flower and crop systems are some of the most complex in the game but currently produce nothing the player can use.

- Harvested crops go to inventory as items (tomato, carrot, berry, wheat).
- Those items can be fed to mytes as food with trait-specific bonuses (e.g. berries boost curiosity temporarily).
- Now the full loop is: plant seed → water it → wait for season → harvest → feed myte → myte gets a mood boost. Every step has meaning.

### Myte Nicknames / Personalization
Players name and keep mytes long-term. Give them ways to express that bond.

- Rename mytes (already likely stored in user data).
- Favorite myte marker: pin one myte to always show first in the list, camera follows it by default.
- Myte colors/appearance variants unlocked by level or playtime. Cosmetic but deeply motivating in this genre.


### Simple Achievement Popups
The game already has an event system that fires on every meaningful action.

- Lightweight toast-based achievements: "First harvest," "First chest opened at night," "First myte friendship."
- These are discovery prompts more than rewards — they tell the player "this is a thing you can do" in the moment they do it.
- No points or menus needed. Just a toast that says something happened.

---

## UX Clarity Improvements

Small things that make existing features easier to understand.

- **Drag-and-drop tooltip**: when dragging an item over a myte, show "+mood" or "not interested" before dropping. Players don't currently know if a drop will work.
- **Object purpose label**: hovering over a world object shows its primary benefit (e.g. "Fountain — soothes comfort"). One line. Makes the decoration → need system legible.
- **Myte mode labels**: the current modes (Follow, Free Roam, Queue Only, etc.) could use a one-sentence description in the UI. New players don't know what "Queue Only" does.
- **Trait reveals on interaction**: first time a myte shows a quirk ("Your myte is very curious — it inspects everything it finds"), show a small one-time label. Teaches through behavior.
- **Sleep indicator on myte list**: if a myte is in the home slot and charging, show a small sleeping icon on their thumbnail. Players know not to bother them.
