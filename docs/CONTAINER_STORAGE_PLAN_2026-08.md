# Container Storage Plan — 2026-08

> **Status: partially shipped 2026-08-15.** The drag-in half landed (see
> "What shipped" below). The full container system described from "The full
> recommendation" onward is **not built** — this document is the plan for it.

---

## What shipped

Dragging an inventory item onto a closed chest puts it inside. That is the whole
feature: there is no way to look in a chest, and no way to take something back
out except the way that already existed — a Myte pries it open and the contents
spill onto the floor.

It reuses what chests already had rather than adding a system:

| Piece | Where |
|---|---|
| Contents storage | `TreasureChestMapObject.items` — the authored-loot list, already there |
| Persistence | `serializeState()` / `restoreState()` — already round-trips `items` |
| Getting things out | `spawnItems()` on open — already there |
| Deposit | `TreasureChestMapObject.depositItem()` — new, ~40 lines |
| Drop target | `Inventory._findChestTarget` / `_depositIntoChest` — new, ~50 lines |

Deposits are normalised through the same `normalizeItemDefinition` authored loot
uses, so a deposited apple and an authored apple are the same shape. A deposit is
recorded with `probability: 1` and merges only with other certainties — folding
it into an authored 30% roll would turn the player's own item into a coin flip.

Three deliberate limits:

- **Closed chests only.** An open chest has already spilled; a deposit into one
  would either vanish or need a second spill. `getDepositRefusal()` says so.
- **Storable furniture is not deposited.** Dragging a lantern onto a chest means
  "put the lantern down there", not "post the lantern into the chest", so
  `_findChestTarget` excludes anything whose item form is `world.mode ===
  'map_object'`.
- **Packing a chest away empties it.** `getStorageResetWarning()` warns, and
  Build mode's existing confirm shows it.

### Known rough edges

- **Contents are invisible.** The sidebar says "Has Loot" or "Empty" and nothing
  more. A player who deposits something has no way to confirm it landed except
  the toast, and no way to audit a chest later.
- **Retrieval needs a Myte.** You cannot take your own item back directly; you
  have to send a Myte to open the chest and then pick the spill off the floor.
- **Quantity is always one.** A drag deposits a single item from the stack. There
  is no "deposit all" and no way to say how many.
- **No capacity.** A chest will take an unbounded number of distinct entries.

---

## The full recommendation

If chests are going to be storage rather than loot piñatas, the missing half is a
**container inventory** — a real, viewable, two-way store. The recommendation is
to build it as a shared capability rather than as chest-specific code, because
the same shape wants to serve wardrobes, shelves, barrels and the player's own
stash later.

### 1. A `ContainerStore` capability, not a chest feature

Today `lootContainer: true` in `data/map-objects/types.json` means "spills items
when opened". Add a second, orthogonal capability:

```json
"capabilities": {
  "lootContainer": true,
  "itemStorage": { "slots": 12, "stackLimit": 99 }
}
```

Back it with a `ContainerStore` class (suggested home:
`js/Map/MapObjects/Interactive/ContainerStore.js`) owning:

- `slots` — an array of `{ variant, quantity }`, sparse, indexed by slot.
- `add(item, quantity)` / `remove(slotIndex, quantity)` / `moveTo(store, from, to)`
- `canAccept(item)` — capacity, stack limits, and any per-container filter
  (a wardrobe takes clothing; a fruit basket takes food).
- `serialize()` / `restore(data)`

Mix it into `MapObject` the way `withItemDrops` already is, so any object type can
declare storage without inheriting from a container class. Objects that hold
things are not all going to be chests.

**Keep `items` and the store separate.** `items` is the authored loot table — a
drop specification with probabilities and quantity ranges, consumed once. The
store is realised inventory. Conflating them is what makes the shipped drag-in
feel like a hack: it writes realised items into a table that was designed to be
rolled. Migration is one-way and easy: on first open, roll `items` into the store
instead of onto the floor.

### 2. One inventory-grid component, two owners

The player's inventory grid in `js/User/Inventory.js` already does slot rendering,
drag sources, drop targets, stack badges and tooltips. Extracting the grid into a
`js/UI/Core/ItemGrid.js` that takes a store and renders it would let the container
panel be genuinely the same UI rather than a lookalike — which is the difference
between two grids that agree and two grids that drift.

This is the largest single piece of work and the one most worth doing properly.
`Inventory` currently mixes three jobs: the player's item model, the grid's DOM,
and the world drag-and-drop rules. Only the middle one should move.

### 3. A container panel

A `ModalWindow` (not a `PanelSection` — it is not an Options tab) showing the
container's grid beside the player's, with drag both ways. Follows the existing
window chrome; nothing new in the aesthetic.

Open it from:
- Double-clicking a container in Build mode (Play mode keeps the Myte-opens-it
  behaviour, which is the charm).
- The sidebar's object actions, next to the existing Store / Rotate.

Close it on mode change, map change, and when the object is stored or removed —
`GameModeManager.leaveBuild` already has the list of panels to close.

### 4. Rules go in `BuildRules`

`canStoreObject` already refuses a chest that is in use. Add:

- `canStoreContainer(object)` — a container with contents cannot be packed away
  without emptying it, or it silently eats the contents. Either refuse, or spill
  to the floor on store and say so. **Recommendation: refuse.** Silent loss is
  the worst outcome and a spill is surprising.
- `canDepositInto(container, item)` — delegates to `store.canAccept`, returns the
  usual `{ allowed, reason }`.

Keeping these in `BuildRules` means the drag preview, the panel, and the sidebar
all get the same answer and the same player-facing copy.

### 5. Persistence

`serializeState()` already carries chest state through `WorldState`. A store
serialises into the same blob:

```js
serializeState() {
    return { state: this.state, items: deepClone(this.items), store: this.store?.serialize() };
}
```

No new persistence path, no save-version bump for existing chests (a missing
`store` key restores as empty). Bump `USER_DATA_VERSION` only if the loot-table
→ store migration in §1 needs to run once at load.

### 6. Myte interaction

Worth deciding before building, because it changes the store's API:

- **Mytes taking things out** is the interesting version — a Myte that raids the
  fruit basket is the kind of thing this game is about. Needs `store.takeAny(filter)`
  and an AI affordance keyed on container contents.
- **Mytes putting things away** is the tidying behaviour, and needs the reverse.

Both are gated on the store existing, so neither blocks the panel work.

### Effort

Roughly, in dependency order:

| Step | Size |
|---|---|
| `ContainerStore` + capability + serialisation | half a day |
| Extract `ItemGrid` from `Inventory` | one day — the risky one, touches working code |
| Container panel | half a day |
| `BuildRules` entries + sidebar action | a few hours |
| Loot-table → store migration | a few hours |
| Myte affordances | half a day, optional |

The `ItemGrid` extraction is the piece to be careful with: it is a refactor of
code that currently works, in service of code that does not exist yet. If it
looks like it is going badly, building the container panel with its own grid
first and extracting afterwards is the safer order — at the cost of a period
where two grids can disagree.
