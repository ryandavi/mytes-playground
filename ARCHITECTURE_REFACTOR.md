# Architecture Refactor Handoff — Mytes Browser Game

**Date:** 2026-05-23  
**Audited by:** Claude Code  
**Status:** Ready for implementation

---

## Context

This document captures all actionable findings from a deep architectural audit of the Mytes codebase. It is intended as a handoff document for ongoing refactoring work. Items are ordered by priority (highest impact / lowest risk first).

**What is NOT in scope:**
- ES Modules / bundling — the project intentionally uses `<script>` tags and global scope. This is a known tradeoff and is not being addressed right now. All file splits described below should continue using the same global-class pattern.

**What the audit confirmed is solid and should not change:**
- Fixed-rate tick loop with accumulator (`Core.js`)
- Batched DOM rendering via `renderState` dirty flag (`MapRenderer.js`)
- Action/queue system architecture
- Event bus (`EventManager.js`)
- Audio unlock hygiene (deferred until user interaction)
- Input component abstraction (`InputComponent`, `ClickComponent`, etc.)
- The existing subsystem split for Myte (Physics, Renderer, Queue, AI, Stats)

---

## Priority 1 — Critical Fixes

### 1.1 XSS Risk in `ActionSidebarManager`

**File:** `js/UI/UI.js`  
**Lines:** ~1143, ~1427

**Problem:** Two places use `innerHTML` with unsanitized label/value strings:

```js
// Line ~1143
info.innerHTML = `${label}: ${value}`;

// Line ~1427
el.innerHTML = `${row.label}: <span></span>`;
```

`label` and `value` come from `getSidebarStatusRows()`, `getSidebarDetailRows()`, `getSelectionDebugInfo()`, and map object configs. If any map object name or config value contains HTML markup, it executes in the browser.

**Fix:** Replace with DOM creation:
```js
// Instead of innerHTML:
const el = document.createElement('div');
el.classList.add('state-info');
const labelSpan = document.createElement('span');
labelSpan.textContent = label;
const valueSpan = document.createElement('span');
valueSpan.textContent = value;
el.append(labelSpan, ': ', valueSpan);
```

The `renderOtherInfo` method already does this correctly for meter and chip rows — apply the same pattern to the generic row fallback (`else` branch, ~line 1422).

---

### 1.2 `GameTime` Is Updated Twice Per Loop

**File:** `js/Container/ContainerManager.js`  
**Lines:** ~695 (variable-rate), ~721 (fixed-rate)

**Problem:** `GameTime` receives both a variable-rate `update(deltaTime)` and a fixed-rate `tickUpdate(tickDelta)` call every loop. All simulation state driven by `GameTime` (mood decay, energy, plant growth, day/night) should be deterministic — updating it at variable rate means behavior changes depending on frame rate.

**Fix:** Remove the variable-rate call:
```js
// In ContainerManager.update() — REMOVE this line:
this.timeManager.update(deltaTime);
```

Keep only the fixed-rate call in `tickUpdate`. Verify `GameTime.update()` vs `GameTime.tickUpdate()` do not have overlapping responsibilities that need to be merged first.

---

### 1.3 `getCanvasRect()` Triggers Layout Reflow Every Frame

**File:** `js/Container/ContainerManager.js`  
**Lines:** ~401–438

**Problem:** The fallback block reads `scrollWidth`, `clientWidth`, `scrollHeight`, `clientHeight` on the canvas and all its children every frame:

```js
const fallbackWidth = Math.max(
    this.canvas.scrollWidth || 0,
    this.canvas.clientWidth || 0,
    ...Array.from(this.canvas.children || []).map(child =>
        Math.max(child.scrollWidth || 0, child.offsetWidth || 0)
    )
);
```

This forces a layout reflow. `getCanvasRect()` is called from `isMouseInContainer()`, which is called from `ContainerManager.update()` — so this fires at 60fps.

**Fix:** Cache the result after map load. Expose an `invalidateCanvasRect()` method and call it only on window resize or map transition:

```js
// In ContainerManager:
_cachedCanvasRect = null;

getCanvasRect() {
    if (this._cachedCanvasRect) return this._cachedCanvasRect;
    // ... existing calculation ...
    this._cachedCanvasRect = result;
    return result;
}

invalidateCanvasRect() {
    this._cachedCanvasRect = null;
}
```

Call `invalidateCanvasRect()` in the window `resize` listener and at the end of map transitions.

---

### 1.4 `getOffset()` Walks the DOM and Forces Layout

**File:** `js/Container/ContainerManager.js`  
**Lines:** ~359–380

**Problem:** This method walks `offsetParent` chain, reading `offsetLeft`/`offsetTop` on each node — a classic forced reflow loop. It's called in `Myte.init()`, `getHomeSlotRect()`, and anywhere home position is computed.

```js
while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
    _x += el.offsetLeft - el.scrollLeft;
    _y += el.offsetTop - el.scrollTop;
    el = el.offsetParent;
}
```

**Fix:** Replace with `getBoundingClientRect()` minus the container's `getBoundingClientRect()`:

```js
getLocalOffset(el) {
    const elRect = el.getBoundingClientRect();
    const containerRect = this.element.getBoundingClientRect();
    const x = elRect.left - containerRect.left + window.scrollX;
    const y = elRect.top - containerRect.top + window.scrollY;
    return {
        x, y, left: x, top: y,
        right: x + elRect.width,
        bottom: y + elRect.height,
        width: elRect.width,
        height: elRect.height
    };
}
```

Also replace the `getOffset()` method with the same pattern. `getBoundingClientRect()` is still a layout read but is far cheaper than walking `offsetParent`.

---

## Priority 2 — File Splits

These are structural changes with no logic changes required. Each class should be moved to its own file with no behavior modification.

### 2.1 Split `UI.js` (2291 lines → ~10 files)

**File:** `js/UI/UI.js`

This file contains 10 distinct classes. Each should become its own file under `js/UI/`:

| New File | Class |
|----------|-------|
| `js/UI/UIComponent.js` | `UIComponent` (base class) |
| `js/UI/CursorManager.js` | `CursorManager` |
| `js/UI/ToolManager.js` | `ToolManager` |
| `js/UI/SelectionManager.js` | `SelectionManager` |
| `js/UI/QueueTargetManager.js` | `QueueTargetManager` |
| `js/UI/ActionSidebarManager.js` | `ActionSidebarManager` |
| `js/UI/MyteListManager.js` | `MyteListManager` |
| `js/UI/HUDManager.js` | `HUDManager` |
| `js/UI/OffscreenMyteIndicatorManager.js` | `OffscreenMyteIndicatorManager` |
| `js/UI/ScreenManager.js` | `ScreenManager` |
| `js/UI/UserInterface.js` | `UserInterface` |

`ActionSidebarManager` should additionally have its info-panel rendering extracted into a `SelectionInfoPanel` class (`js/UI/SelectionInfoPanel.js`) — the `_buildOtherInfoRows` and `renderOtherInfo` methods are self-contained and long enough to justify this.

**Script tag order in `index.html`:** Add each new file in dependency order before `UserInterface.js`. `UIComponent.js` must come first.

---

### 2.2 Extract `MyteMovementController` from `Myte.js`

**File:** `js/Myte/Myte.js` (1560 lines)

The movement/follow/go-home/gravity logic (roughly lines 355–1315) is a self-contained system that can be extracted to `js/Myte/MyteMovementController.js`, parallel to how `MytePhysics` was already extracted.

Methods to move:
- `setMode()`, `handleModeTransition()`
- `setFollowMode()`, `setAutonomyMode()`
- `updateTargetToFollowMouse()`
- `doCircleFollow()`, `doLeashFollow()`, `doRunAway()`
- `doMovementLogic()`
- `watchCursor()`
- `beginGoHomeJourney()`, `resetGoHomeState()`
- `enterInactivityFreeRoam()`, `restoreFromInactivityFreeRoam()`, `cancelInactivityFreeRoam()`
- `holdInHomeSlotUntilPointerLeaves()`, `shouldHoldInHomeSlot()`, `clearHomeSlotHold()`

`Myte` keeps `posX`, `posY`, `targetX`, `targetY`, `goal`, `followGoal`, `autonomyGoal` as owned properties. `MyteMovementController` takes `this` (the Myte) as its host, same pattern as `MytePhysics`.

---

### 2.3 Extract Geometry Utilities from `ContainerManager`

**File:** `js/Container/ContainerManager.js`

The following methods are pure geometry helpers with no dependency on game state. Extract to `js/Utility/RectUtils.js` (or add to the existing `Utility` class if one exists):

- `getEntityBoundsAt(entity, x, y)`
- `clampEntityPosition(entity, x, y)`
- `getColliderBounds(entity)`
- `checkBoxCollision(entityA, entityB)`

These are currently called as `this.container.getEntityBoundsAt(...)` from multiple places. After extraction, call them as `RectUtils.getEntityBoundsAt(...)` or `Utility.getEntityBoundsAt(...)`.

---

## Priority 3 — Logic Consolidation

### 3.1 Consolidate Duplicate Collision Bounds Calculations

**Problem:** Three separate implementations of the same `posX + collider.offsetX` bounds calculation:

1. `ContainerManager.getColliderBounds(entity)` (~line 588)
2. `ContainerManager.getEntityBoundsAt(entity, x, y)` (~line 452)
3. `MapObject` computing its own bounds inline

**Fix:** A single `getEntityColliderBounds(entity, x?, y?)` function used everywhere. `x` and `y` default to `entity.posX`/`entity.posY` if not provided.

---

### 3.2 Consolidate Duplicate Distance Calculations

**Problem:** Distance calculation appears 5+ times in `Myte.js` alone:

- `getDistanceTo(target)` — uses `Math.hypot`
- `getDistanceToPoint(x, y)` — uses `Math.hypot`
- `getDistanceFromMouse()` — uses `Math.sqrt(dx*dx + dy*dy)`
- `isMoving()` — inline `Math.sqrt(dx*dx + dy*dy)`
- `isAtTarget()` — inline `Math.sqrt(dx*dx + dy*dy)`
- Also appears in `Entity.js` and `ContainerManager`

**Fix:** All call sites should use `getDistanceToPoint(x, y)`. The `isMoving()` and `isAtTarget()` methods can use it directly. Remove the redundant implementations.

---

### 3.3 Unify `dispose()` / `destroy()` Naming

**Problem:** Cleanup method is named inconsistently across the codebase:

| Class | Method Name |
|-------|-------------|
| `CursorManager` | `destroy()` |
| `ToolManager` | `destroy()` |
| `ScreenManager` | `destroy()` |
| `QueueTargetManager` | `dispose()` |
| `OffscreenMyteIndicatorManager` | `dispose()` |
| `SelectionManager` | *(none)* |
| `HUDManager` | *(none)* |
| `ActionSidebarManager` | *(none)* |

**Fix:** Standardize everything to `dispose()`. Add a `UIComponent.dispose()` base method that subclasses override. Audit `UserInterface.dispose()` — it currently skips `myteListManager`, `hudManager`, `actionSidebarManager`, and `selectionManager`, all of which hold DOM references.

Checklist for `UserInterface.dispose()`:
- [ ] `selectionManager.dispose()` — holds `selectedObject` DOM ref
- [ ] `hudManager.dispose()` — holds `hudElement`, `currentMoodEffect` refs
- [ ] `actionSidebarManager.dispose()` — holds `actionControls`, row map
- [ ] `myteListManager.dispose()` — holds `myteListContainer` ref

---

### 3.4 Fix `doFreeRoamLogic` — Delete or Replace

**File:** `js/Myte/Myte.js`  
**Lines:** ~1131–1180

**Problem:** This method is either dead code or an unfinished legacy behavior. It has:
- Commented-out `addIdle` calls
- A reference to `this.queue.addMoveToElement(e)` which may not exist in the current `MyteQueue` API
- A reference to `this.queue.addRunLaps(e)` / `addMoveToElement(e)` — also likely legacy
- Uses `Math.random()` in the render loop (should be in `tickUpdate`)

The AI system (`MyteAI`) now handles autonomous behavior. If `doFreeRoamLogic` is still being called anywhere, replace those call sites with the AI system. If it's unreachable, delete it.

**Action:** Search for all call sites of `doFreeRoamLogic` and trace whether it's reachable. If not → delete. If it is → port to an AI action or remove the call.

---

### 3.5 Unify Action Registration Source of Truth

**Problem:** Actions are defined in `data/metadata/actions.json` (metadata only) but registered imperatively in `ActionManager.js` via `registerActions([...])`. The two systems are not connected — you can add to one without the other and nothing warns you.

**Options (pick one):**
- Drive all registration from JSON — `ActionManager` reads `actions.json` and auto-registers
- Remove JSON metadata and keep everything in JS class `metadata` statics — cleaner since the JS classes already carry their own metadata

The second option is lower risk. Deprecate `actions.json` and put everything in each Action class's static `metadata` block.

---

## Priority 4 — Architecture Improvements

### 4.1 `ActionSidebarManager.updateActionList` — Cache to Avoid Full DOM Rebuild

**File:** `js/UI/UI.js`  
**Lines:** ~1538

**Problem:** Every call runs `actionGroups.innerHTML = ''` then rebuilds all buttons. The `_buildAvailableActionsKey` mechanism already detects when nothing changed — use it to skip the rebuild entirely:

```js
updateActionList(selectedObject) {
    const key = this._buildAvailableActionsKey(selectedObject, this.parent.getActiveMyte());
    if (key === this._lastAvailableActionsKey) return; // already up to date
    this._lastAvailableActionsKey = key;
    // ... rebuild ...
}
```

This already happens for `renderOtherInfo` — apply the same short-circuit here.

---

### 4.2 `OffscreenMyteIndicatorManager` — Throttle to 15fps

**File:** `js/UI/UI.js` → (after split) `js/UI/OffscreenMyteIndicatorManager.js`

**Problem:** `update()` runs every frame at 60fps, doing camera-to-viewport projection math for every myte. The on-screen indicator arrows don't need sub-frame precision.

**Fix:**
```js
update() {
    this._elapsed = (this._elapsed || 0) + 1;
    if (this._elapsed % 4 !== 0) return; // ~15fps
    // ... existing logic ...
}
```

---

### 4.3 `setupMytes` — Drive from Data, Not DOM

**File:** `js/Container/ContainerManager.js`  
**Lines:** ~516–538

**Problem:** Myte identity (id, species, name) is read from DOM `data-` attributes at runtime. Game state is partially defined in HTML. If the HTML changes, mytes silently change identity.

```js
const speciesId = interactiveElement?.dataset?.myteSpecies || wrapper.dataset?.myteSpecies || 'snail';
```

**Fix:** Move myte configuration to `data/user/Ryan.json` (which already exists). `setupMytes` reads the config array, creates Myte instances from data, and the HTML slots are anonymous containers identified only by position. The `data-myte-species` attributes become generated from data, not read as source of truth.

---

### 4.4 `localStorage` — Add Version + Validation

**File:** `js/Core.js` → `js/User/User.js`

**Problem:** User data is loaded from `localStorage` without schema version or validation. Corrupted or outdated JSON silently produces partial objects.

**Fix:**
1. Add `"data_version": 1` to the saved user object
2. On load, check version before applying data
3. If version mismatch, run a migration function (even if it's just "reset to defaults" for now)
4. Wrap `JSON.parse` in try/catch with explicit reset and console warning

```js
const CURRENT_DATA_VERSION = 1;

function migrateUserData(data) {
    const version = data.data_version ?? 0;
    if (version === CURRENT_DATA_VERSION) return data;
    // future: add per-version migration steps here
    console.warn(`User data version ${version} is outdated, resetting.`);
    return null; // caller treats null as "no valid save"
}
```

---

### 4.5 Stop the RAF Loop When Tab Is Hidden

**File:** `js/Core.js`  
**Lines:** ~280–308

**Problem:** `handleVisibilityChange` resets the accumulator when the tab becomes visible, but the RAF loop keeps running while hidden. Browsers throttle it, but the cleaner pattern is to stop it entirely.

**Fix:**
```js
handleVisibilityChange() {
    if (document.hidden) {
        this._rafPaused = true;
    } else {
        this._rafPaused = false;
        this.tickAccumulator = 0;
        this.lastFrameTime = performance.now();
        requestAnimationFrame(this._updateFrame);
    }
}

// Inside the RAF loop:
const updateFrame = (timestamp) => {
    if (this._rafPaused || !this.isInitialized) return; // don't re-schedule
    // ... rest of loop ...
    requestAnimationFrame(updateFrame);
};
```

---

### 4.6 Remove Double-Init Guards That Do Nothing

**File:** `js/Container/ContainerManager.js`  
**Lines:** ~82–85, ~119–122

Both `inputHandler` and `transitionManager` are set in the constructor and will never be null when `init()` runs. The guards create false confidence:

```js
// These are dead branches — remove them:
if (!this.inputHandler) {
    this.inputHandler = new ContainerInputManager(this);
}
if (!this.transitionManager) {
    this.transitionManager = new MapTransitionManager(this);
}
```

---

## Priority 5 — CSS / SCSS Architecture

### 5.1 Move Fixed Sizes into Tokens

**File:** `css/layout/_app-shell.scss`, `css/core/_tokens.scss`

The shell width (`635px`) and stage height (`500px`) are hardcoded in the layout file. Add them as tokens so changing one value updates everywhere:

```css
/* In _tokens.scss: */
--size-shell-width: 635px;
--size-stage-height: 500px;
--size-sidebar-width: 250px; /* if not already there */
```

---

### 5.2 Move Visual State Out of Inline JS Styles

**Files:** `js/UI/UI.js` (`CursorManager`), `js/Myte/MyteRenderer.js`, `js/Map/Camera.js`

`CursorManager.setupCursorElement()` sets `element.style.position`, `element.style.willChange`, `element.style.opacity`, `element.style.zIndex` directly in JS. These bypass the CSS architecture.

**Approach:**
- Structural styles (`position: fixed`, `pointer-events: none`, `will-change: transform`) → move to `_ui.scss` under `.custom-cursor`
- State styles (visible/hidden) → toggle a class or data attribute: `cursor.classList.toggle('is-hidden', !visible)` → CSS handles `opacity: 0`

This keeps the design system as the single source of truth for all visual properties.

---

### 5.3 Prepare Token Structure for Dark Mode

**File:** `css/core/_tokens.scss`

The token file has no `prefers-color-scheme` block. Adding one now (even if empty) establishes the pattern before there are 50+ hardcoded colors:

```css
@media (prefers-color-scheme: dark) {
    :root {
        /* dark mode overrides go here */
    }
}
```

No dark mode values need to exist yet — this is just scaffolding.

---

## Appendix: Quick Reference Checklist

### Immediate (no logic changes, highest impact)
- [ ] Fix XSS in `appendInfoRow` and generic row fallback in `renderOtherInfo`
- [ ] Remove `this.timeManager.update(deltaTime)` from `ContainerManager.update()`
- [ ] Add caching to `getCanvasRect()` with `invalidateCanvasRect()` on resize/transition
- [ ] Replace `getOffset()` with `getBoundingClientRect()`-based version
- [ ] Add missing `dispose()` to `SelectionManager`, `HUDManager`, `ActionSidebarManager`, `MyteListManager`
- [ ] Standardize all `destroy()` → `dispose()`
- [ ] Remove the two dead double-init guards in `ContainerManager.init()`
- [ ] Add `data_version` field to localStorage save format

### File splits (copy/paste, update `index.html` script tags)
- [ ] Split `UI.js` into 10+ files (see table in §2.1)
- [ ] Extract geometry helpers from `ContainerManager` into `RectUtils`

### Logic refactors (require testing)
- [ ] Extract `MyteMovementController` from `Myte.js`
- [ ] Consolidate collision bounds into one `getEntityColliderBounds()` function
- [ ] Consolidate distance calculations — remove inline `Math.sqrt(dx*dx+dy*dy)` in favor of `getDistanceToPoint()`
- [ ] Delete or properly replace `doFreeRoamLogic`
- [ ] Add `_lastAvailableActionsKey` short-circuit to `updateActionList`
- [ ] Throttle `OffscreenMyteIndicatorManager.update()` to ~15fps
- [ ] Pause/resume RAF loop on visibility change

### CSS
- [ ] Add `--size-shell-width` and `--size-stage-height` tokens
- [ ] Move `.custom-cursor` structural styles to SCSS, use class toggles for state
- [ ] Add empty dark mode `@media` block to `_tokens.scss`

---

*End of handoff document.*
