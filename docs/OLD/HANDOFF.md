# Neko Project — Handoff Document

**Last updated:** 2026-05-21  
**Stack:** Vanilla JS, no build tools, XAMPP/PHP backend  
**Guiding principles:** Single sources of truth, reuse over duplication, forward-thinking, no framework dependencies.

---

## What has already been done (Phases 1–8)

### Phase 1 — Dead code / quick wins ✅
- Fixed `index.html` script tag: `GameMapGridAstar.js` → `GameMapGridAStar.js` (case-sensitive servers)
- Removed `MoveAction.canPerform()` — was permanently `return false`
- Removed `ContainerManager.getVisibleElements()` — unused, had inverted logic (collected off-screen elements)
- Fixed `GameMapGrid.createGridCellElements()` — now uses viewport-clamped `cols`/`rows` instead of full grid dimensions
- Added `dispose()` to `ViewMenu`; converted all `addEventListener` to `onclick` assignments
- Fixed `MapObject.remove()` to call `this.removeAllEffects?.()` before other cleanup
- Fixed `UI.dispose()` to include `viewMenu?.dispose?.()` cleanup

### Phase 2 — Game clock ✅
- `GameTime.update(deltaTime)` now accumulates `deltaTime / 1000` (was `+= 1` per frame — FPS-dependent)
- Removed spurious `/60` from `getCurrentGameMinutes()`
- Fixed `setDateTime()` — replaced a magic `* 2.5` factor with `_getGameMinuteToRealSecondsRatio()`
- `NightBloomMapObject.updateDayNightState()` now reads from `gameMap.parent.timeManager.getCurrentHour()` instead of `new Date().getHours()`
- `GameTime` initialized once in `Core` constructor; containers read `GameTime.instance`

**Math contract:** At any FPS — 5 real minutes = 1440 game minutes = 1 game day. `_getGameMinuteToRealSecondsRatio() = dayDurationInMinutes / 24`.

### Phase 3 — Input deduplication ✅
- `EventManager` stripped of all raw DOM listeners (`mousemove/mousedown/mouseup/scroll`). It is now a pure domain event bus (`on/emit/off`) with no DOM involvement.
- `CursorManager` (in `UI.js`) replaced three `document.addEventListener` calls with `InputSystem.on()` subscriptions stored in `this._inputUnsubs[]`. `destroy()` calls `.unsubscribe()` on each.
- `ContainerInputManager` removed `this.lastActiveTime` — was a stale shadow of `InputSystem.state.lastActivityTime`.

**Net result:** Every `mousemove` now fires exactly one DOM listener (InputSystem), not three. Inactivity has one source of truth.

### Phase 4 — Pathfinding single source of truth ✅
- Replaced `initPathfinder()`, `updatePathfinder()`, `invalidatePathfinderCache()` on `Entity` with a single getter:
  ```js
  get pathfinder() {
      return this.parent?.gameMap?.gridSystem?.pathfinder ?? null;
  }
  ```
- Removed per-entity `pathfinder = null` assignments from `Myte.js` and `NpcMapObject.js`
- Removed `myte.updatePathfinder(newGridSystem)` loop from `MapTransitionManager.js`
- `GameMapGrid.invalidatePathfinderCaches()` now just clears `this.pathfinder.validationCache`
- Removed broken 6-arg `findPath(posX, posY, x, y, w, h)` call from `MoveAction.start()` (old API)

**Net result:** One `AStarPathfinder` per map, on `gridSystem`. All entities share it transparently via getter.

### Phase 5 — Action timing (frame → ms) ✅
- `MyteQueue.update()` → `MyteQueue.update(deltaTime)`, passes `deltaTime` to each action
- `Myte.js`: `doMovementLogic()` → `doMovementLogic(deltaTime)`, all 5 `queue.update()` → `queue.update(deltaTime)`
- `IdleAction`: `defaultDuration` changed from `200` frames → `3000` ms; `update(deltaTime)` now subtracts real ms
- `ExpressionAction`: `defaultDuration` changed from `50` frames → `800` ms; same ms countdown logic with repeat

### Phase 6 — State / persistence ✅ (partial — see Remaining Work below)
- Added `_scheduleSave()` debounce (2000ms) to `User.js`; replaced direct `saveUserData()` calls in `addMyte`, `removeMyte`, `addCurrency`, `spendCurrency`, `setPreference`, `unlockAchievement`
- `SettingsMenu.applyGraphicsSettings()` body replaced — was calling a nonexistent `this.parent.renderer.setQuality()` path

### Phase 7 — AI performance ✅
- Added `_sortByDistance(items)` Schwartzian transform helper to `MyteAI`:
  ```js
  _sortByDistance(items) {
      return items
          .map(item => ({ item, d: this.myte.getDistanceTo(item) }))
          .sort((a, b) => a.d - b.d)
          .map(entry => entry.item);
  }
  ```
- `getNearbyMytes()`, `getNearbyObjects()`, `getNearbyDroppedItems()` now cache results keyed to `this._tickTime`
- `this._tickTime = 0` initialized in constructor; `this._tickTime++` at top of `tickUpdate()`

### Phase 8 — Lifecycle audit ✅
- All anonymous listeners are properly cleaned up (verified `ModalWindow`, `MapObject`, `GameMapGrid`, `BaseInputHandler`, `MyteDialogue`, `MyteStats`, `Myte.dispose()`)
- `destroy()` vs `dispose()` naming is inconsistent (see Naming Consistency section below) but all call sites use the correct method name — no silent failures

---

## Remaining Work

### Phase 6 — Incomplete items

#### 1. `User.js` — Dual inventory state
**File:** `js/User/User.js`  
`User` has both `this.inventory` (reference to `ContainerManager`'s `Inventory` instance) and `this.items` (its own plain-object array). They are kept in sync manually via `syncInventoryFromItems()`. This is fragile and duplicates data.

**The pattern:**
- `serializeUserData()` (line 56): reads from `this.inventory.items` if set, otherwise from `this.items`
- `applyUserData()` (line 116): writes to `this.items`, then calls `syncInventoryFromItems()` to push into `this.inventory`
- `syncInventoryFromItems()` (line 123): clears and rebuilds `this.inventory` from `this.items`

**Fix:** Choose one source. The simplest approach: remove `this.items` entirely, read/write directly via `this.inventory`. `syncInventoryFromItems()` and the `this.items` fallback path in `serializeUserData()` can both be deleted. `setInventory()` must be called before `applyUserData()` (which it already is in practice via `Core.js` init order — verify this before removing the fallback).

#### 2. `SoundMenu.js` — Direct soundManager mutation
**File:** `js/UI/SoundMenu.js`  
`SoundMenu` reads and writes directly to the global `soundManager` (e.g. `soundManager.soundEnabled = !wasEnabled`). Sound preferences are never persisted to `User.preferences` — toggling sound survives only as long as the `soundManager` instance lives.

**Fix:** Route `soundEnabled`, `musicEnabled`, and volume levels through `User.preferences`, then apply from there on load. `SoundMenu` should call `user.setPreference('soundEnabled', value)` which triggers `_scheduleSave()`. On startup, `SoundManager` reads initial state from `user.preferences`.

---

### Phase 9 — Domain split (long-term, deferred)

`ContainerManager` (`js/Container/ContainerManager.js`) does too many things: manages Mytes, the camera, the UI, the map, inventory, input, and transitions. This should eventually be split into domain-specific managers. No urgent bugs — defer until 1–8 are clean and stable.

---

## Naming Consistency — `destroy()` vs `dispose()`

The codebase uses two different method names for the same concept. No functional bugs result because every call site already uses the correct name for each class, but it is confusing.

### Classes that use `destroy()`
| Class | File |
|---|---|
| `InputComponent` (base) | `js/Input/InputComponent.js` |
| `ClickComponent` | `js/Input/ClickComponent.js` |
| `DragComponent` | `js/Input/DragComponent.js` |
| `RubbingComponent` | `js/Input/RubbingComponent.js` |
| `InputSystem` | `js/Input/InputSystem.js` |
| `CursorManager` | `js/UI/UI.js` |
| `ToolManager` | `js/UI/UI.js` |
| `ScreenManager` | `js/UI/UI.js` |
| `MyteDialogue` | `js/Myte/MyteDialogue.js` |
| `MyteStats` | `js/Myte/MyteStats.js` |

### Classes that use `dispose()`
Everything else — `Myte`, `MapObject`, `ContainerManager`, `GameMap`, `GameMapGrid`, `Camera`, `ModalWindow`, `ViewMenu`, `QueueUI`, `DebugUI`, `ToastSystem`, `EventManager`, `SoundManager`, `Inventory`, `ParticleSystem`, all Myte input handlers, etc.

### Recommended fix
Standardise on `dispose()`. For the `InputComponent` family, add `dispose() { this.destroy(); }` aliases (or just rename `destroy` to `dispose` and update `MapObject.remove()` line 1203 which calls `c.destroy()` and `UserInterface.dispose()` which calls `cursorManager?.destroy?.()`).

The safest mechanical steps:
1. In `InputComponent.js`: rename `destroy()` → `dispose()`; update `ClickComponent`, `DragComponent`, `RubbingComponent` to call `super.dispose()`
2. In `InputSystem.js`: rename `destroy()` → `dispose()`
3. In `UI.js` (`CursorManager`, `ToolManager`, `ScreenManager`): rename `destroy()` → `dispose()`
4. In `MyteDialogue.js` and `MyteStats.js`: rename `destroy()` → `dispose()`
5. Update call sites:
   - `MapObject.js:1203` — `c.destroy()` → `c.dispose()`
   - `UserInterface.dispose()` — `cursorManager?.destroy?.()`, `toolManager?.destroy?.()`, `screenManager?.destroy?.()` → `?.dispose?.()`
   - `Myte.dispose()` — `dialogue?.destroy?.()`, `stats?.destroy?.()` → `?.dispose?.()`

---

## Key architectural facts (don't re-derive)

- **`GameTime`** — singleton pattern. Created once in `Core` as `this.gameTime = new GameTime()`. Containers read `GameTime.instance`. `totalElapsedSeconds` is real seconds. `_getGameMinuteToRealSecondsRatio() = dayDurationInMinutes / 24`.
- **`InputSystem`** — owns all raw DOM events. Single source of truth for mouse position, button state, and `lastActivityTime`. Everything else subscribes via `InputSystem.on()`.
- **`EventManager`** — pure domain event bus (`on/emit/off`). Zero DOM listeners. Do not add DOM listeners here.
- **`get pathfinder()` on Entity** — returns `this.parent?.gameMap?.gridSystem?.pathfinder ?? null`. No per-entity `AStarPathfinder` instances exist. One pathfinder per map on `gridSystem`.
- **Action system files:** `BaseActions.js` | `MoveActions.js` | `ObjectInteractions.js` | `SocialActions.js` | `StateActions.js` | `CarryActions.js` | `ReactiveActions.js`. New two-Myte interactions share `ActionSync`. New sequences use `MyteQueue.addSequence()`.
- **MapObject hierarchy:** canonical map object JSON -> `MapObject.js` -> `MapObjectBases.js` -> `AnimatedMapObject` -> `MovingMapObject`. To add a new object type: edit `data/map-objects/base.json` / `data/map-objects/types.json`, write the class if needed, and register it in the factory.
- **`MyteAI._tickTime`** — incremented at the start of every `tickUpdate()`. Used as a cache key for `getNearbyMytes/Objects/DroppedItems`. Per-tick caching avoids redundant spatial scans within the same tick.
- **`User._scheduleSave()`** — debounced 2s write to localStorage. Use this for all frequent mutations. `saveUserData()` directly is only for flush-on-exit (called in `logout()` and `saveUserData()`).

