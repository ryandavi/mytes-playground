# Room Quality & Feng Shui System

Expand the existing **Room Analysis** system with an environmental quality system that evaluates how pleasant, functional, and well-designed each detected room is.

This should primarily be a **hidden simulation system**. Players should experience its effects through Myte behavior rather than optimizing visible numerical scores. Detailed values should be available in debug/development tools and optionally while building.

## 1. Room Analysis

Continue using the existing room detection/type system as the foundation.

Each detected room should know:

* Room type
* Room perimeter / occupied tiles
* Doors
* Windows
* Objects contained within the room
* Expected objects for its room type
* Missing expected objects
* Object positions/orientations
* Available/open floor space

Room type analysis answers:

> "Is this a valid bedroom/kitchen/bathroom/etc.?"

Environmental analysis separately answers:

> "How pleasant is this room to actually live in?"

---

## 2. Room Quality

Each room should calculate environmental scores from `0–100`.

Suggested categories:

### Function

How well the room fulfills its recognized purpose.

Examples:

* Expected furniture exists
* Required objects are usable
* Door exists
* Window exists where appropriate
* Important objects are accessible

### Comfort

Contribution from comfortable furniture and amenities.

Examples:

* Beds
* Sofas
* Chairs
* Rugs
* Lamps
* Other comfort-tagged objects

### Decoration

Contribution from decorative objects.

Examples:

* Paintings
* Sculptures
* Plants
* Rugs
* Decorative furniture
* Other décor

Use **diminishing returns** so filling a room with paintings does not infinitely increase its score.

Too much decoration can eventually contribute to clutter.

### Lighting

Evaluate the room's available light.

Consider:

* Windows / natural light
* Lamps
* Ceiling lights
* Dark/unlit areas

### Cleanliness

Dynamic score based on mess.

Possible penalties:

* Trash
* Dirty dishes
* Puddles
* Dirt
* Other dirty-state objects

### Condition

Evaluate the physical condition of objects.

Penalties could include:

* Broken objects
* Damaged objects
* Poorly maintained objects
* Worn objects

### Space

Evaluate usable/open floor area relative to room size.

A room should not automatically improve simply because more objects are added.

### Clutter

Evaluate object density.

There should be a comfortable range between:

`too empty → comfortably furnished → cluttered → extremely cluttered`

### Layout

Evaluate whether furniture is arranged sensibly and whether the room has good circulation.

### Nature

Optional environmental component.

Examples:

* Windows
* Plants
* Exterior views
* Natural/environmental objects

---

## 3. Feng Shui / Layout Analysis

Add a hidden placement-based analysis separate from object value.

This should evaluate **how objects are arranged**, rather than how expensive or attractive they are.

Possible factors:

* Clear paths from doors into the room
* Important objects aren't obstructed
* Doors aren't blocked
* Windows aren't unnecessarily blocked
* Adequate interaction space around furniture
* Large furniture is proportionate to room size
* Furniture creates sensible activity zones
* Furniture orientation makes sense
* Excessive empty space
* Excessive object density
* Overall spatial balance

This does not need to represent literal real-world feng shui. "Feng Shui" can simply be an internal/debug name for spatial harmony.

---

## 4. Object Relationships

Allow object definitions/tags to describe positive and negative spatial relationships.

Examples of positive relationships:

```text
bed          → nightstand
bed          → lamp
sofa         → coffee_table
sofa         → television
chair        → table
chair        → lamp
desk         → chair
dining_chair → dining_table
plant        → window
```

Examples of negative relationships:

```text
door         → obstructed
window       → obstructed
chair        → facing_wall
television   → blocked
bed          → toilet
stove        → bed
```

Relationships should consider:

* Distance
* Orientation
* Accessibility
* Whether objects are in the same room

Avoid hardcoding relationships into the room-analysis code where possible. Prefer tags/data-driven definitions so new objects can participate automatically.

---

## 5. Environmental Traits

Rooms can also derive environmental characteristics from their contents and layout.

Possible traits:

### Light

Windows, lamps, bright/open spaces.

### Nature

Plants, natural materials, outdoor views.

### Warmth

Soft furniture, rugs, comfortable furnishings.

### Order

Clear floor space, organized furniture, low clutter.

### Stimulus

Toys, art, electronics, colorful/interactive objects.

### Calm

Open space, comfortable furniture, low clutter, low stimulus.

These should be continuous values rather than simple booleans.

---

## 6. Myte Preferences

Keep objective room analysis separate from individual Myte preferences.

For example:

```text
Room:
Calm       82
Stimulus   31
Nature     68
Comfort    76
Clutter    12
```

A particular Myte can then weight those properties differently.

Example:

```text
Myte A:
likes Calm
likes Nature
dislikes Clutter

Myte B:
likes Stimulus
neutral toward Nature
tolerates Clutter
```

This prevents there from being one objectively perfect room design.

---

## 7. Effects on Mytes

Do not expose Room Quality as a normal player-facing numerical meter.

Instead, room quality should subtly influence Myte simulation and AI.

Potential effects:

* Mood gain/loss while occupying the room
* Preferred idle locations
* Room selection when multiple appropriate rooms exist
* Likelihood of remaining in a room
* Relaxation behavior
* Sleep quality
* Activity duration
* Positive/negative expressions
* Autonomous interactions

Example:

A Myte that likes calm environments may naturally spend more time in a comfortable, uncluttered bedroom than in a crowded, highly stimulating room.

Effects should generally be subtle enough that players can decorate creatively without being forced into a single optimal layout.

---

## 8. Diminishing Returns

Avoid simple additive scoring such as:

```text
painting = +5
20 paintings = +100
```

Use diminishing returns within categories.

Conceptually:

```text
first relevant object   = strong contribution
second                  = moderate contribution
third                   = smaller contribution
additional duplicates   = minimal contribution
excessive quantity      = possible clutter penalty
```

Object variety can optionally receive a small bonus compared with repeating the same object.

---

## 9. Overall Room Quality

Calculate an internal aggregate Room Quality score.

Conceptually:

```text
Room Quality =
    Function
    Comfort
    Decoration
    Lighting
    Cleanliness
    Condition
    Space
    Layout
    Nature
    - Clutter Penalties
```

Do **not** simply average these values unless appropriate.

Room type should influence weighting.

For example:

```text
Bedroom:
Comfort     high importance
Layout      high importance
Lighting    medium importance
Decoration  medium importance
Nature      low/medium importance

Kitchen:
Function    very high importance
Layout      high importance
Cleanliness high importance
Comfort     low importance
```

Room-type weights should be data-driven where possible.

---

## 10. Debug / Build Analysis

Extend the existing room-analysis/debug tooling so selecting a room can expose the underlying calculations.

Example:

```text
BEDROOM — Room #12

Recognition       ✓ Bedroom

Function          94
Comfort           81
Decoration        67
Cleanliness       100
Condition         92
Lighting          73
Space             58
Layout            76
Nature            64
────────────────────
Room Quality      80

Positive Factors
+ Bed accessible
+ Natural light
+ Plant near window
+ Bedside lighting
+ Clear entrance

Negative Factors
- High object density
- Dresser restricts circulation
- Repetitive wall decoration
```

Where useful, extend the room overlay with optional visualization modes for:

* Room type
* Room boundaries
* Accessibility
* Object density / clutter
* Lighting
* Decoration influence
* Environmental quality
* Layout problems
* Positive/negative object relationships

---

## 11. Architecture

Keep the systems separated conceptually:

```text
Room Detection
      ↓
Room Type Analysis
      ↓
Environmental Analysis
      ↓
Room Environmental Profile
      ↓
Myte Preference Evaluation
      ↓
Myte Mood / AI / Behavior
```

Do not bake Myte-specific preferences directly into room scoring.

The room should describe **what the environment is**.

The Myte should determine **how it feels about that environment**.

---

## Implementation Goal

Build this as an extension of the existing room-analysis architecture rather than a parallel room system.

Prioritize:

1. Data-driven object/environment tags
2. Room-level environmental metrics
3. Diminishing returns
4. Spatial/layout analysis
5. Debug visibility into exactly why a room received its scores
6. Clean separation between objective room properties and subjective Myte preferences

The initial implementation does not need every proposed metric or behavioral effect. Establish the architecture so additional environmental properties, object relationships, room-type weights, and Myte preferences can be added without rewriting the core room-analysis system.
