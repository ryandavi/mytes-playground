# A* Feel Improvements — Undo Reference

Added May 2026. Three layered changes to make navigation feel smoother. Each can be reverted independently.

---

## 1. Catmull-Rom Spline Interpolation (`MoveActions.js`)

**What it does:** After A* builds a path, the waypoints are expanded into a smooth Catmull-Rom curve. The myte arcs through turns instead of pivoting at each grid-cell centre.

**Where:** `MoveActions.js` — top-level helpers `_catmullRomPoint` / `_splineWaypoints`, called inside `AStarMoveAction._buildPath`.

**To undo:** Remove the two helper functions at the top of the file and remove this block from `_buildPath`:
```js
if (this.targetPoints.length >= 3) {
    this.targetPoints = _splineWaypoints(this.targetPoints);
}
```

**Tuning:** Change the `resolution` argument in the `_splineWaypoints` call (default `5`). Higher = smoother curve, more waypoints to traverse. `3` is noticeably coarser; `8` is very smooth. Values below 3 on short paths may cause jitter.

---

## 2. Buffered Line-of-Sight in Path Smoothing (`GameMapGridAStar.js`)

**What it does:** The path shortcutter (`_smoothPath`) inflates the entity collider by `smoothingBuffer` px before doing LOS checks. Shortcuts are only approved when the path has real clearance from walls, preventing diagonal corner-grazing.

**Where:** `AStarPathfinder.options.smoothingBuffer` (default `2`). Used in `_smoothPath` → `_hasLineOfSight`.

**To undo:** Set `smoothingBuffer: 0` in the options, or remove the `effectiveCollider` branch inside `_hasLineOfSight`.

**Tuning:** `2` is subtle. Increase to `4` if still snagging corners; decrease to `1` in maps with many tight 1-cell-wide corridors where the buffer might over-reject shortcuts.

---

## 3. Wall-Clearance Penalty in A* Cost (`GameMapGridAStar.js`)

**What it does:** Cells adjacent to walls cost slightly more during A* search. When two paths cost the same, A* naturally picks the one farther from walls (centre of corridors). In tight corridors all cells have equal penalty, so routing is unaffected.

**Where:** `AStarPathfinder.options.wallClearancePenalty` (default `0.05` per cardinal wall neighbour, max 4 neighbours = `0.20` total penalty).

**To undo:** Set `wallClearancePenalty: 0` in the options, or remove the penalty block at the bottom of `_getMovementCost`.

**Tuning:** `0.05` is nearly invisible on cost. If paths feel too indirect in open areas, lower to `0.02`. If corner-hugging is still occurring, raise to `0.08`.
