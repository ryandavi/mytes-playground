// Set to true to re-enable verbose pathfinding diagnostics
const APPROACH_DEBUG = true;
const ASTAR_DEBUG = false;
const _alog  = APPROACH_DEBUG ? console.log.bind(console)  : () => {};
const _awarn = APPROACH_DEBUG ? console.warn.bind(console) : () => {};
const _slog  = ASTAR_DEBUG    ? console.log.bind(console)  : () => {};
const _swarn = ASTAR_DEBUG    ? console.warn.bind(console) : () => {};

// Direct movement to coordinates with optional A* pathfinding
class MoveAction extends MyteAction {
    static metadata = {
        id: 'move',
        label: 'Move To',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific location',
        requiresTarget: true,
        affectsMood: false
    };

    constructor(myte, options) {
        super(myte, options);

        if (!options?.target?.length) {
            throw new Error('MoveAction requires at least one target position');
        }

        this.targets = options.target;
        this.targetIndex = 0;
    }

    start() {
        super.start();
        this.setNextTarget();
        this.myte.reset();
    }

    update() {
        if (this.myte.isAtTarget()) {
            this.targetIndex++;
            return !this.setNextTarget();
        }
        this.myte.moveTowardsTarget();
        return false;
    }

    setNextTarget() {
        if (this.targets[this.targetIndex]) {
            const { x, y } = this.targets[this.targetIndex];
            this.myte.setTarget(x, y);
            return true;
        }
        return false;
    }
}

// A* pathfinding movement to a position or object
class AStarMoveAction extends MyteAction {
    static metadata = {
        id: 'astar-move',
        label: 'A* Move To',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a location using A* pathfinding',
        requiresTarget: true,
        defaultOptions: {
            target: null,
            pathfindingOptions: {},
            currentTargetIndex: 0
        }
    };

    constructor(myte, options) {
        super(myte, { ...AStarMoveAction.metadata.defaultOptions, ...options });
        this.targetPoints = null;
        this.currentTargetIndex = 0;
        this._actionComplete = false;
        this._finalTarget = null;
        this._stuckCount = 0;
        this._prevPosX = null;
        this._prevPosY = null;
    }

    getDebugPathfinder() {
        return this.myte?.pathfinder || this.myte?.parent?.gameMap?.gridSystem?.pathfinder || null;
    }

    shouldVisualizeDebugPath() {
        const gameMap = this.myte?.parent?.gameMap;
        return !!(document.body.classList.contains('debug') && gameMap?.layers?.debug && this.getDebugPathfinder());
    }

    renderDebugPath(path) {
        const pathfinder = this.getDebugPathfinder();
        const debugLayer = this.myte?.parent?.gameMap?.layers?.debug;
        if (!pathfinder || !debugLayer) return;

        pathfinder.setDebugMode(this.shouldVisualizeDebugPath());
        pathfinder.visualizePath(debugLayer, path || [], this.myte.size.width, this.myte.size.height, this.myte.collider);
    }

    clearDebugPath() {
        const pathfinder = this.getDebugPathfinder();
        const debugLayer = this.myte?.parent?.gameMap?.layers?.debug;
        if (!pathfinder || !debugLayer) return;

        pathfinder.clearVisualization(debugLayer);
    }

    refreshDebugVisualization() {
        if (!this.targetPoints?.length) {
            this.clearDebugPath();
            return;
        }

        this.renderDebugPath(this.targetPoints.map(point => ({
            x: point.x + this.myte.size.width / 2,
            y: point.y + this.myte.size.height / 2
        })));
    }

    getQueueTitle() {
        return 'Move To';
    }

    getQueueDescription() {
        const target = this.getTargetPosition();
        if (!target) {
            return '';
        }

        return `(${Math.round(target.x)}, ${Math.round(target.y)})`;
    }

    getTargetPosition() {
        if (!this.target) return null;

        if (Array.isArray(this.target) && this.target.length >= 2 && typeof this.target[0] === 'number') {
            return { x: this.target[0], y: this.target[1] };
        }

        if (typeof this.target === 'object' && 'x' in this.target && 'y' in this.target && !('posX' in this.target)) {
            return { x: this.target.x, y: this.target.y };
        }

        if (typeof this.target === 'object' && 'posX' in this.target) {
            const width  = this.target.size?.width  || 0;
            const height = this.target.size?.height || 0;
            const colliderWidth   = this.target.collider?.width   || width;
            const colliderHeight  = this.target.collider?.height  || height;
            const colliderOffsetX = this.target.collider?.offsetX || 0;
            const colliderOffsetY = this.target.collider?.offsetY || 0;
            return {
                x: this.target.posX + colliderOffsetX + (colliderWidth  / 2),
                y: this.target.posY + colliderOffsetY + (colliderHeight / 2)
            };
        }

        return null;
    }

    static canPerform(selected, active) {
        return active && selected && !active?.queue?.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    start() {
        super.start();
        this.targetPoints = null;
        this.currentTargetIndex = 0;
        this._actionComplete = false;

        if (!this.myte?.pathfinder) {
            _swarn(`[ASTAR] start: no pathfinder — completing immediately`);
            this._actionComplete = true;
            return;
        }

        const target = this.getTargetPosition();
        if (!target) {
            _swarn(`[ASTAR] start: could not resolve target position from`, this.target, `— completing immediately`);
            console.trace('[ASTAR] null target call stack');
            this._actionComplete = true;
            return;
        }

        _slog(`[ASTAR] start: from=(${this.myte.posX.toFixed(1)},${this.myte.posY.toFixed(1)}) to=(${target.x.toFixed(1)},${target.y.toFixed(1)})`);
        this._finalTarget = target;
        this._buildPath(this.myte.posX, this.myte.posY, target);
    }

    _buildPath(fromX, fromY, to) {
        const myte = this.myte;
        const effectiveOptions = { ...myte.pathfindingOptions, ...(this.pathfindingOptions || {}) };
        const path = myte.pathfinder.findPath(myte, fromX, fromY, to.x, to.y, effectiveOptions);
        if (path?.length) {
            this.renderDebugPath(path);
        }

        if (!path?.length) {
            this.clearDebugPath();
            _swarn(`[ASTAR] _buildPath: pathfinder returned no path from=(${fromX.toFixed(1)},${fromY.toFixed(1)}) to=(${to.x.toFixed(1)},${to.y.toFixed(1)}) — completing`);
            this._actionComplete = true;
            return;
        }

        this.targetPoints = path.map(wp => ({
            x: wp.x - myte.size.width  / 2,
            y: wp.y - myte.size.height / 2
        }));

        // Drop first waypoint if we're already on it
        const cx = myte.posX + myte.size.width  / 2;
        const cy = myte.posY + myte.size.height / 2;
        if (this.targetPoints.length > 0 &&
            Math.abs((this.targetPoints[0].x + myte.size.width  / 2) - cx) < 1 &&
            Math.abs((this.targetPoints[0].y + myte.size.height / 2) - cy) < 1) {
            _slog(`[ASTAR] _buildPath: dropped first waypoint (already there)`);
            this.targetPoints.shift();
        }

        if (this.targetPoints.length === 0) {
            this.clearDebugPath();
            _swarn(`[ASTAR] _buildPath: targetPoints empty after filtering — completing`);
            this._actionComplete = true;
            return;
        }

        _slog(`[ASTAR] _buildPath: ${path.length} raw pts → ${this.targetPoints.length} waypoints. First=(${this.targetPoints[0].x.toFixed(1)},${this.targetPoints[0].y.toFixed(1)}) Last=(${this.targetPoints[this.targetPoints.length-1].x.toFixed(1)},${this.targetPoints[this.targetPoints.length-1].y.toFixed(1)})`);
        this.currentTargetIndex = 0;
        myte.setTarget(this.targetPoints[0].x, this.targetPoints[0].y);
    }

    update() {
        if (this._actionComplete) return true;
        if (!this.myte?.isActive) { _swarn(`[ASTAR] update: myte inactive — completing`); return true; }
        if (!this.targetPoints?.length) { _swarn(`[ASTAR] update: no targetPoints — completing`); return true; }

        if (this.myte.isAtTarget()) {
            this._stuckCount = 0;
            this.currentTargetIndex++;

            if (this.currentTargetIndex >= this.targetPoints.length) {
                const fp = this.targetPoints[this.targetPoints.length - 1];
                this.myte.setPosition(fp.x, fp.y);
                this.myte.setSpritePosition(fp.x, fp.y);
                this.myte.setTarget(fp.x, fp.y);
                this.clearDebugPath();
                this._actionComplete = true;
                return true;
            }

            this.myte.setTarget(
                this.targetPoints[this.currentTargetIndex].x,
                this.targetPoints[this.currentTargetIndex].y
            );
        }

        this.myte.moveTowardsTarget();

        // Stuck detection: recompute path after ~45 frames of no movement
        const moved = Math.abs(this.myte.posX - (this._prevPosX ?? this.myte.posX))
                    + Math.abs(this.myte.posY - (this._prevPosY ?? this.myte.posY));
        if (moved < 0.1) {
            if (++this._stuckCount >= 45) {
                if (!this._recomputePath()) {
                    this._actionComplete = true;
                }
            }
        } else {
            this._stuckCount = 0;
        }

        this._prevPosX = this.myte.posX;
        this._prevPosY = this.myte.posY;
        return false;
    }

    _recomputePath() {
        if (!this._finalTarget) return false;
        this._stuckCount = 0;
        const prev = this.targetPoints?.length;
        this._buildPath(this.myte.posX, this.myte.posY, this._finalTarget);
        return !!this.targetPoints?.length && this.targetPoints.length !== prev;
    }

    interrupt() {
        super.interrupt();
        this.clearDebugPath();
        this._actionComplete = true;
    }

    cancel() {
        this.clearDebugPath();
        this._actionComplete = true;
    }
}

// ─── Approach configs ─────────────────────────────────────────────────────────
// Full approach config schema:
// {
//   allowedSides: 'any'              — all four cardinal sides (default)
//              | string[]            — only these sides, e.g. ['bottom'] for front-only
//              | { exclude: string[] } — all except listed
//              | 'front'            — resolved at runtime from target.facingDirection
//   preferredSide: null | string     — tried first if set; others used as fallback
//   gap: number                      — px between the two aligned edges. + = clear space, - = overlap
//   align: string                    — cross-axis alignment for the approach side:
//                                      left/right → 'top-edge' | 'center' | 'bottom-edge'
//                                      top/bottom → 'left-edge' | 'center' | 'right-edge'
//   alignTo: 'sprite' | 'collider'  — which rect of the TARGET defines the approach boundary
//   myteAlignTo: 'sprite'|'collider'— which rect of the MYTE touches that boundary
//                                      'sprite'   → myte's sprite edge aligns to target boundary
//                                      'collider' → myte's collider edge aligns to target boundary
//                                      omit → defaults to 'sprite'
// }
//
// For edge-to-edge collider contact (e.g. chest front approach):
//   alignTo: 'collider', myteAlignTo: 'collider', gap: 0
// If myteAlignTo is omitted when alignTo:'collider', the myte's sprite top lands at the
// target's collider edge — the myte's actual collider (lower in the sprite) will overlap
// the target, causing the pathfinder to snap to a grid cell further away.
//
// Objects declare their approach config via:
//   getApproachConfig() → a string key below, or a partial/full config object
//   getApproachMode()   → a string key (backward-compatible shorthand)
const APPROACH_CONFIGS = {
    side:     { allowedSides: 'any',      preferredSide: null,     gap: -5,  align: 'bottom-edge', alignTo: 'collider' },
    adjacent: { allowedSides: 'any',      preferredSide: null,     gap: 12,  align: 'bottom-edge', alignTo: 'collider' },
    center:   { allowedSides: ['center'], preferredSide: 'center', gap: 0,   align: 'center',      alignTo: 'sprite'   },
    front:    { allowedSides: 'front',    preferredSide: null,     gap: -5,  align: 'bottom-edge', alignTo: 'collider' },
};

// Move to a MapObject or Myte using A* + smart side selection.
// The target object can declare how it wants to be approached via getApproachMode().
class GoToObjectAction extends PositionableAction {
    static metadata = {
        id: 'go_to_object',
        label: 'Go To',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move to a specific object or Myte',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            // approachConfig: null — pass a string key or partial config to override target's default
            allowStuckSuccess: true,
            stuckCompletionDistance: 18,
            finalApproachSkipDistance: 48,
            maxFinalAdjustmentDistance: 48
        }
    };

    targetPos = null;
    targetPoints = null;
    currentTargetIndex = 0;
    targetCenter = null;
    _stuckFrames = 0;
    _lastPos = null;
    _lastTargetSnapshot = null;
    _lastTargetReplanAt = 0;
    _replanCount = 0;

    constructor(myte, options) {
        super(myte, { ...GoToObjectAction.metadata.defaultOptions, ...options });
    }

    getQueueTitle() {
        return this.queueVerb || this.constructor.metadata.label;
    }

    getQueueDescription() {
        return this.getQueueTargetLabel(this.target);
    }

    getDebugPathfinder() {
        return this.myte?.pathfinder || this.myte?.parent?.gameMap?.gridSystem?.pathfinder || null;
    }

    shouldVisualizeDebugPath() {
        const gameMap = this.myte?.parent?.gameMap;
        return !!(document.body.classList.contains('debug') && gameMap?.layers?.debug && this.getDebugPathfinder());
    }

    renderDebugPath(path) {
        const pathfinder = this.getDebugPathfinder();
        const debugLayer = this.myte?.parent?.gameMap?.layers?.debug;
        if (!pathfinder || !debugLayer) return;

        pathfinder.setDebugMode(this.shouldVisualizeDebugPath());
        pathfinder.visualizePath(debugLayer, path || [], this.myte.size.width, this.myte.size.height, this.myte.collider);
    }

    clearDebugPath() {
        const pathfinder = this.getDebugPathfinder();
        const debugLayer = this.myte?.parent?.gameMap?.layers?.debug;
        if (!pathfinder || !debugLayer) return;

        pathfinder.clearVisualization(debugLayer);
    }

    refreshDebugVisualization() {
        if (!this.targetPoints?.length) {
            this.clearDebugPath();
            return;
        }

        this.renderDebugPath(this.targetPoints.map(point => ({
            x: point.x + this.myte.size.width / 2,
            y: point.y + this.myte.size.height / 2
        })));
    }

    static canPerform(selected, active) {
        return active && selected && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    // Merge a string key or partial config object into a full ApproachConfig.
    _normalizeConfig(raw) {
        const config = typeof raw === 'string'
            ? { ...APPROACH_CONFIGS[raw] ?? APPROACH_CONFIGS.side }
            : { ...APPROACH_CONFIGS.side, ...raw };

        if (config.alignTo === 'collider' && config.myteAlignTo == null) {
            config.myteAlignTo = 'collider';
        }

        return config;
    }

    // Priority: action-level override → target.getApproachConfig() → target.getApproachMode() → 'side'
    _resolveApproachConfig() {
        if (this.approachConfig != null) {
            const cfg = this._normalizeConfig(this.approachConfig);
            _alog(`[APPROACH] config source=action-override`, cfg);
            return cfg;
        }
        const targetCfg = this.target?.getApproachConfig?.();
        if (targetCfg != null) {
            const cfg = this._normalizeConfig(targetCfg);
            _alog(`[APPROACH] config source=getApproachConfig raw=`, targetCfg, `resolved=`, cfg);
            return cfg;
        }
        const mode = this.target?.getApproachMode?.() ?? 'side';
        const cfg = { ...APPROACH_CONFIGS[mode] ?? APPROACH_CONFIGS.side };
        _alog(`[APPROACH] config source=getApproachMode mode="${mode}"`, cfg);
        return cfg;
    }

    // Resolve allowedSides to an ordered array, accounting for the 'front' special case.
    // Sides are sorted by proximity to the Myte so we try the closest first.
    _getAllowedSides(config, targetRect) {
        const cardinal = ['left', 'right', 'top', 'bottom'];
        const { allowedSides } = config;

        let sides;
        if (!allowedSides || allowedSides === 'any') {
            sides = cardinal.slice();
        } else if (Array.isArray(allowedSides)) {
            sides = allowedSides.filter(s => cardinal.includes(s) || s === 'center');
        } else if (typeof allowedSides === 'object' && allowedSides.exclude) {
            sides = cardinal.filter(s => !allowedSides.exclude.includes(s));
        } else if (allowedSides === 'front') {
            const dir = this.target?.facingDirection;
            const map = { S: 'bottom', N: 'top', E: 'right', W: 'left' };
            const resolved = dir && map[dir];
            sides = resolved ? [resolved] : cardinal.slice();
        } else {
            sides = cardinal.slice();
        }

        // Sort by distance from Myte's center to each side's midpoint
        const mx = this.myte.posX + this.myte.size.width  / 2;
        const my = this.myte.posY + this.myte.size.height / 2;
        const cx = targetRect.x + targetRect.width  / 2;
        const cy = targetRect.y + targetRect.height / 2;

        const sideDist = {
            left:   Math.hypot(mx - targetRect.x,                    my - cy),
            right:  Math.hypot(mx - (targetRect.x + targetRect.width), my - cy),
            top:    Math.hypot(mx - cx,                               my - targetRect.y),
            bottom: Math.hypot(mx - cx,                               my - (targetRect.y + targetRect.height)),
            center: Math.hypot(mx - cx,                               my - cy)
        };

        sides.sort((a, b) => (sideDist[a] ?? 0) - (sideDist[b] ?? 0));

        // If the config specifies a preferred side, move it to the front
        if (config.preferredSide && sides.includes(config.preferredSide)) {
            sides.splice(sides.indexOf(config.preferredSide), 1);
            sides.unshift(config.preferredSide);
        }

        return sides;
    }

    start() {
        super.start();
        this.currentTargetIndex  = 0;
        this._resolvedApproachConfig = this._resolveApproachConfig();
        this.buildApproachPlan();
        this._lastTargetSnapshot = this._captureTargetSnapshot();
        this._lastTargetReplanAt = performance.now();
    }

    _captureTargetSnapshot() {
        if (!this.target || this.target.posX == null || this.target.posY == null) {
            return null;
        }

        return { x: this.target.posX, y: this.target.posY };
    }

    _targetMovedSignificantly() {
        const snapshot = this._captureTargetSnapshot();
        if (!snapshot || !this._lastTargetSnapshot) {
            return false;
        }

        return Math.hypot(
            snapshot.x - this._lastTargetSnapshot.x,
            snapshot.y - this._lastTargetSnapshot.y
        ) >= 16;
    }

    buildApproachPlan() {
        const cfg        = this._resolvedApproachConfig;
        // Use collider rect for positioning; sprite rect for facing direction
        const targetRect = this.getTargetRect(this.target, cfg.alignTo);
        const spriteRect = this.getTargetRect(this.target, 'sprite');

        if (!targetRect) {
            _awarn(`[APPROACH] buildApproachPlan: no targetRect — alignTo="${cfg.alignTo}" target=`, this.target);
            this.targetPos = null;
            this.targetPoints = null;
            return;
        }

        const myteApproachRect = this.getMyteApproachRect(cfg.myteAlignTo);
        _alog(`[APPROACH] buildApproachPlan target="${this.target?.constructor?.name ?? this.target?.id}" alignTo="${cfg.alignTo}" myteAlignTo="${cfg.myteAlignTo ?? 'sprite'}" targetRect=`, {...targetRect}, `myteApproachRect=`, {...myteApproachRect}, `mytePos=(${this.myte.posX.toFixed(1)},${this.myte.posY.toFixed(1)})`);

        this.targetCenter = {
            x: spriteRect.x + spriteRect.width  / 2,
            y: spriteRect.y + spriteRect.height / 2
        };

        const candidates = this.getCandidatePositions(targetRect, myteApproachRect, cfg);
        _alog(`[APPROACH] candidates (${candidates.length}):`, candidates.map((c, i) => `[${i}] (${c.x.toFixed(1)},${c.y.toFixed(1)})`).join('  '));
        const bestPath   = this.findBestPath(candidates);

        if (bestPath) {
            const routeTarget = bestPath.resolvedTargetPos ?? bestPath.targetPos;
            _alog(`[APPROACH] bestPath → routeTarget=(${routeTarget.x.toFixed(1)},${routeTarget.y.toFixed(1)}) finalTarget=(${bestPath.targetPos.x.toFixed(1)},${bestPath.targetPos.y.toFixed(1)}) score=${bestPath.score.toFixed(1)} waypoints=${bestPath.targetPoints.length}`);
            this.targetPos    = bestPath.targetPos;
            this.targetPoints = bestPath.targetPoints;
            this.refreshDebugVisualization();
            return;
        }

        this.targetPos = candidates[0] ?? {
            x: this.targetCenter.x - (this.myte.size.width / 2),
            y: this.targetCenter.y - (this.myte.size.height / 2)
        };
        _alog(`[APPROACH] no path found — falling back to candidate[0] targetPos=(${this.targetPos.x.toFixed(1)},${this.targetPos.y.toFixed(1)})`);
        this.targetPoints = null;
        this.clearDebugPath();
    }

    getMyteApproachRect(alignTo = 'sprite') {
        if (alignTo === 'collider' && this.myte?.collider) {
            return {
                x: this.myte.posX + (this.myte.collider.offsetX ?? 0),
                y: this.myte.posY + (this.myte.collider.offsetY ?? 0),
                width: this.myte.collider.width ?? this.myte.size.width,
                height: this.myte.collider.height ?? this.myte.size.height,
                offsetX: this.myte.collider.offsetX ?? 0,
                offsetY: this.myte.collider.offsetY ?? 0
            };
        }

        return {
            x: this.myte.posX,
            y: this.myte.posY,
            width: this.myte.size.width,
            height: this.myte.size.height,
            offsetX: 0,
            offsetY: 0
        };
    }

    getCandidatePositions(targetRect, myteRect, cfg) {
        const sides    = this._getAllowedSides(cfg, targetRect);
        const posOpts  = { gap: cfg.gap, align: cfg.align };
        const seen     = new Set();
        const candidates = [];
        const myteSpriteRect = this.myte.getRect();

        _alog(`[APPROACH] sides order: [${sides.join(', ')}]`);
        for (const side of sides) {
            const rawCollider = this.calculatePosition(myteRect, targetRect, side, posOpts);
            const raw = {
                x: rawCollider.x - (myteRect.offsetX ?? 0),
                y: rawCollider.y - (myteRect.offsetY ?? 0)
            };
            const clamped  = this.adjustPositionToBounds(raw, myteSpriteRect);
            const key      = `${Math.round(clamped.x)},${Math.round(clamped.y)}`;
            const dup = seen.has(key);
            _alog(`[APPROACH]   side=${side} rawCollider=(${rawCollider.x.toFixed(1)},${rawCollider.y.toFixed(1)}) rawMyte=(${raw.x.toFixed(1)},${raw.y.toFixed(1)}) clamped=(${clamped.x.toFixed(1)},${clamped.y.toFixed(1)})${dup ? ' [DUPLICATE - skipped]' : ''}`);
            if (dup) continue;
            seen.add(key);
            candidates.push(clamped);
        }

        return candidates;
    }

    findBestPath(candidates) {
        if (!this.myte?.pathfinder) {
            _awarn(`[APPROACH] findBestPath: no pathfinder on myte`);
            return null;
        }
        if (!candidates.length) {
            _awarn(`[APPROACH] findBestPath: no candidates`);
            return null;
        }

        let bestPath = null;
        let fallbackPath = null;
        const maxAdjustmentDistance = this.getMaxFinalAdjustmentDistance();

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const endCX = candidate.x + (this.myte.size.width  / 2);
            const endCY = candidate.y + (this.myte.size.height / 2);
            const col = this.myte.collider;
            const cellSize = this.myte.pathfinder?.gridSystem?.config?.cellSize ?? 32;
            const endGridX = Math.floor(candidate.x / cellSize);
            const endGridY = Math.floor(candidate.y / cellSize);
            const snappedColliderY = endGridY * cellSize + (col?.offsetY ?? 0);
            const exactColliderY   = candidate.y   + (col?.offsetY ?? 0);
            _alog(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) endGrid=(${endGridX},${endGridY}) snappedColliderY=${snappedColliderY.toFixed(0)} exactColliderY=${exactColliderY.toFixed(0)}`);
            const path  = this.myte.pathfinder.findPath(
                this.myte,
                this.myte.posX,
                this.myte.posY,
                endCX,
                endCY,
                { exactEndMode: 'never' }
            );

            if (!path?.length) {
                _alog(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) → no path`);
                continue;
            }

            const finalPathPoint = path[path.length - 1];
            const resolvedTargetPos = finalPathPoint
                ? {
                    x: finalPathPoint.x - this.myte.size.width / 2,
                    y: finalPathPoint.y - this.myte.size.height / 2
                }
                : candidate;

            const targetPoints = path
                .map(wp => ({
                    x: wp.x - this.myte.size.width  / 2,
                    y: wp.y - this.myte.size.height / 2
                }))
                .filter((pt, i, arr) => {
                    if (i === 0) return Math.hypot(pt.x - this.myte.posX, pt.y - this.myte.posY) > 1;
                    const prev = arr[i - 1];
                    return Math.hypot(pt.x - prev.x, pt.y - prev.y) > 0.5;
                });

            const adjustmentDistance = Math.hypot(
                candidate.x - resolvedTargetPos.x,
                candidate.y - resolvedTargetPos.y
            );
            const score = this.getPathScore(targetPoints) + adjustmentDistance;
            const pathInfo = { targetPos: candidate, resolvedTargetPos, targetPoints, score, adjustmentDistance };

            if (!fallbackPath || adjustmentDistance < fallbackPath.adjustmentDistance || (adjustmentDistance === fallbackPath.adjustmentDistance && score < fallbackPath.score)) {
                fallbackPath = pathInfo;
            }

            if (adjustmentDistance > maxAdjustmentDistance) {
                _alog(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) → rejected adjust=${adjustmentDistance.toFixed(1)} > max=${maxAdjustmentDistance.toFixed(1)}`);
                continue;
            }

            _alog(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) → path ok rawPts=${path.length} filteredPts=${targetPoints.length} adjust=${adjustmentDistance.toFixed(1)} score=${score.toFixed(1)}${(!bestPath || score < bestPath.score) ? ' ← best so far' : ''}`);
            if (!bestPath || score < bestPath.score) {
                bestPath = pathInfo;
            }
        }

        if (bestPath) {
            return bestPath;
        }

        if (fallbackPath) {
            _awarn(`[APPROACH] no candidates within max final adjustment ${maxAdjustmentDistance.toFixed(1)}; falling back to least-bad candidate adjust=${fallbackPath.adjustmentDistance.toFixed(1)}`);
        }

        return fallbackPath;
    }

    getMaxFinalAdjustmentDistance() {
        const explicit = Number(this.maxFinalAdjustmentDistance);
        if (Number.isFinite(explicit) && explicit > 0) {
            return explicit;
        }

        const touchThreshold = Number(this.target?.getConfig?.('interactionTouchThreshold', NaN));
        if (Number.isFinite(touchThreshold) && touchThreshold > 0) {
            return Math.max(24, touchThreshold + 16);
        }

        return 48;
    }

    getPathScore(points) {
        if (!points?.length) return 0;
        let total = 0;
        let prev  = { x: this.myte.posX, y: this.myte.posY };
        for (const pt of points) {
            total += Math.hypot(pt.x - prev.x, pt.y - prev.y);
            prev   = pt;
        }
        return total;
    }

    faceTarget() {
        if (!this.targetCenter) return;
        this.myte.faceTowardsPoint(this.targetCenter.x, this.targetCenter.y, 1);
    }

    getTargetColliderGap() {
        if (!this.target) return Infinity;

        if (typeof this.target.getColliderGapTo === 'function') {
            return this.target.getColliderGapTo(this.myte);
        }

        const myteRect = {
            left: this.myte.posX + (this.myte.collider?.offsetX ?? 0),
            top: this.myte.posY + (this.myte.collider?.offsetY ?? 0),
            right: this.myte.posX + (this.myte.collider?.offsetX ?? 0) + (this.myte.collider?.width ?? this.myte.size.width),
            bottom: this.myte.posY + (this.myte.collider?.offsetY ?? 0) + (this.myte.collider?.height ?? this.myte.size.height)
        };
        const targetRect = {
            left: this.target.posX + (this.target.collider?.offsetX ?? 0),
            top: this.target.posY + (this.target.collider?.offsetY ?? 0),
            right: this.target.posX + (this.target.collider?.offsetX ?? 0) + (this.target.collider?.width ?? this.target.size?.width ?? 0),
            bottom: this.target.posY + (this.target.collider?.offsetY ?? 0) + (this.target.collider?.height ?? this.target.size?.height ?? 0)
        };

        const gapX = Math.max(0, myteRect.left - targetRect.right, targetRect.left - myteRect.right);
        const gapY = Math.max(0, myteRect.top - targetRect.bottom, targetRect.top - myteRect.bottom);
        return Math.hypot(gapX, gapY);
    }

    getEffectiveStuckCompletionDistance() {
        const targetThreshold = Number(this.target?.getConfig?.('interactionTouchThreshold', NaN));
        if (Number.isFinite(targetThreshold) && targetThreshold > 0) {
            return Math.min(this.stuckCompletionDistance, targetThreshold);
        }

        return this.stuckCompletionDistance;
    }

    getInteractionCompletionThreshold() {
        const targetThreshold = Number(this.target?.getConfig?.('interactionTouchThreshold', NaN));
        if (Number.isFinite(targetThreshold) && targetThreshold >= 0) {
            return targetThreshold;
        }

        return null;
    }

    hasReachedInteractionThreshold() {
        const threshold = this.getInteractionCompletionThreshold();
        if (threshold === null) {
            return null;
        }

        return this.getTargetColliderGap() <= threshold;
    }

    shouldSkipLastWaypoint(waypoint) {
        if (!waypoint || !this.targetPos || !this.targetPoints?.length) {
            return false;
        }

        const isLastWaypoint = this.currentTargetIndex === this.targetPoints.length - 1;
        if (!isLastWaypoint) {
            return false;
        }

        const skipDistance = Number(this.finalApproachSkipDistance ?? 48);
        if (!Number.isFinite(skipDistance) || skipDistance <= 0) {
            return false;
        }

        return Math.hypot(
            waypoint.x - this.targetPos.x,
            waypoint.y - this.targetPos.y
        ) <= skipDistance;
    }

    update() {
        const now = performance.now();
        if (this._targetMovedSignificantly() && now - this._lastTargetReplanAt >= 150) {
            this.currentTargetIndex = 0;
            this.buildApproachPlan();
            this._lastTargetSnapshot = this._captureTargetSnapshot();
            this._lastTargetReplanAt = now;
            this._progressWindow = null;
        }

        // Per-frame stuck detection (true stillness)
        if (!this._lastPos) this._lastPos = { x: this.myte.posX, y: this.myte.posY };
        const moved = Math.hypot(this.myte.posX - this._lastPos.x, this.myte.posY - this._lastPos.y);
        this._lastPos = { x: this.myte.posX, y: this.myte.posY };
        this._stuckFrames = moved < 0.1 ? this._stuckFrames + 1 : 0;

        if (this._stuckFrames > 45) {
            const colliderGap = this.getTargetColliderGap();
            if (this.allowStuckSuccess !== false && colliderGap <= this.getEffectiveStuckCompletionDistance()) {
                this.faceTarget();
                return true;
            }
            this._stuckFrames = 0;
            this._progressWindow = null;
            this.currentTargetIndex = 0;
            this._replanCount++;
            if (this._replanCount >= (this.maxReplanAttempts ?? 6)) {
                this.faceTarget();
                this.clearDebugPath();
                return true;
            }
            this.buildApproachPlan();
            this._lastTargetSnapshot = this._captureTargetSnapshot();
            this._lastTargetReplanAt = performance.now();
            if (!this.targetPos && !this.targetPoints) return true;
        }

        // Oscillation detection: check net displacement over a 60-frame window.
        // Catches the case where the myte is bouncing against a collider and
        // moved > 0.1 every frame (so _stuckFrames never accumulates).
        if (!this._progressWindow) {
            this._progressWindow = { startX: this.myte.posX, startY: this.myte.posY, frames: 0 };
        }
        this._progressWindow.frames++;
        if (this._progressWindow.frames >= 60) {
            const netDisp = Math.hypot(
                this.myte.posX - this._progressWindow.startX,
                this.myte.posY - this._progressWindow.startY
            );
            this._progressWindow = { startX: this.myte.posX, startY: this.myte.posY, frames: 0 };
            if (netDisp < 5) {
                const colliderGap = this.getTargetColliderGap();
                if (this.allowStuckSuccess !== false && colliderGap <= this.getEffectiveStuckCompletionDistance()) {
                    this.faceTarget();
                    this.clearDebugPath();
                    return true;
                }
                this._stuckFrames = 0;
                this.currentTargetIndex = 0;
                this._replanCount++;
                if (this._replanCount >= (this.maxReplanAttempts ?? 6)) {
                    this.faceTarget();
                    this.clearDebugPath();
                    return true;
                }
                this.buildApproachPlan();
                this._lastTargetSnapshot = this._captureTargetSnapshot();
                this._lastTargetReplanAt = performance.now();
                if (!this.targetPos && !this.targetPoints) return true;
            }
        }

        if (this.targetPoints?.length) {
            if (this.myte.isAtTarget()) {
                this._replanCount = 0;
                this.currentTargetIndex++;
                if (this.currentTargetIndex >= this.targetPoints.length) {
                    this.targetPoints = null;
                    this.currentTargetIndex = 0;
                }
            }

            if (this.targetPoints?.length) {
                const wp = this.targetPoints[this.currentTargetIndex];
                if (!wp) {
                    this.targetPoints = null;
                } else if (this.shouldSkipLastWaypoint(wp)) {
                    _alog(`[APPROACH] skipping terminal waypoint (${wp.x.toFixed(1)},${wp.y.toFixed(1)}) and switching to exact final target (${this.targetPos.x.toFixed(1)},${this.targetPos.y.toFixed(1)})`);
                    this.targetPoints = null;
                    this.currentTargetIndex = 0;
                } else {
                    this.myte.setTarget(wp.x, wp.y);
                    this.myte.moveTowardsTarget();
                    return false;
                }
            }
        }

        if (!this.targetPos) return true;

        this.myte.setTarget(this.targetPos.x, this.targetPos.y);
        this.myte.moveTowardsTarget();

        if (this.myte.isAtTarget()) {
            const withinInteractionThreshold = this.hasReachedInteractionThreshold();
            if (withinInteractionThreshold === false) {
                this._replanCount++;
                if (this._replanCount >= (this.maxReplanAttempts ?? 6)) {
                    this.faceTarget();
                    this.clearDebugPath();
                    return true;
                }
                this.buildApproachPlan();
                this._lastTargetSnapshot = this._captureTargetSnapshot();
                this._lastTargetReplanAt = performance.now();

                if (this.targetPoints?.length || this.targetPos) {
                    return false;
                }
            }

            this.faceTarget();
            this.clearDebugPath();
            return true;
        }

        return false;
    }

    interrupt() {
        super.interrupt();
        this.clearDebugPath();
    }
}

// Follow the mouse cursor
class FollowMouseAction extends MyteAction {
    static metadata = {
        id: 'follow_mouse',
        label: 'Follow Mouse',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Follow the mouse cursor',
        requiresTarget: false,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    update() {
        this.myte.updateTargetToFollowMouse();
        this.myte.moveTowardsTarget();
        return false;
    }
}

// Shared safety helpers for legacy patterned movement actions.
class PatternMovementAction extends PositionableAction {
    constructor(myte, options = {}) {
        super(myte, options);
        this._patternLastPos = null;
        this._patternStuckFrames = 0;
        this._patternRecoveryCount = 0;
    }

    start() {
        super.start();
        this.resetPatternMovementState();
    }

    resetPatternMovementState() {
        this._patternLastPos = { x: this.myte.posX, y: this.myte.posY };
        this._patternStuckFrames = 0;
        this._patternRecoveryCount = 0;
    }

    notePatternProgress() {
        this._patternLastPos = { x: this.myte.posX, y: this.myte.posY };
        this._patternStuckFrames = 0;
        this._patternRecoveryCount = 0;
    }

    trackPatternMovementProgress(minDistance = 0.2) {
        if (!this._patternLastPos) {
            this._patternLastPos = { x: this.myte.posX, y: this.myte.posY };
            return 0;
        }

        const moved = Math.hypot(
            this.myte.posX - this._patternLastPos.x,
            this.myte.posY - this._patternLastPos.y
        );

        this._patternLastPos = { x: this.myte.posX, y: this.myte.posY };

        if (moved >= minDistance) {
            this._patternStuckFrames = 0;
            if (moved >= 0.45) {
                this._patternRecoveryCount = Math.max(0, this._patternRecoveryCount - 1);
            }
        } else {
            this._patternStuckFrames++;
        }

        return this._patternStuckFrames;
    }

    resolvePatternTarget(x, y, maxRadius = this.safeTargetRadius ?? 10) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
        }

        const clamped = this.myte.parent?.clampEntityPosition?.(this.myte, x, y, {
            rect: this.myte.getRect?.() ?? null
        }) ?? { x, y };
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        return gridSystem?.findNearestValidPositionForEntity?.(
            this.myte,
            clamped.x,
            clamped.y,
            maxRadius
        ) ?? clamped;
    }

    setPatternTarget(x, y, { maxRadius = this.safeTargetRadius ?? 10 } = {}) {
        const safe = this.resolvePatternTarget(x, y, maxRadius);
        if (!safe) {
            return false;
        }

        this.myte.setTarget(safe.x, safe.y);
        return true;
    }

    getResolvedPatternCandidates(candidates, { maxRadius = this.safeTargetRadius ?? 10 } = {}) {
        const seen = new Set();
        const resolved = [];

        for (const candidate of candidates) {
            const safe = this.resolvePatternTarget(candidate.x, candidate.y, maxRadius);
            if (!safe) {
                continue;
            }

            const key = `${Math.round(safe.x)},${Math.round(safe.y)}`;
            if (seen.has(key)) {
                continue;
            }

            seen.add(key);
            resolved.push(safe);
        }

        resolved.sort((a, b) =>
            Math.hypot(a.x - this.myte.posX, a.y - this.myte.posY) -
            Math.hypot(b.x - this.myte.posX, b.y - this.myte.posY)
        );

        return resolved;
    }

    handlePatternStuck() {
        const threshold = this.stuckThresholdFrames ?? 40;
        if (this.trackPatternMovementProgress() < threshold) {
            return false;
        }

        this._patternStuckFrames = 0;
        this._patternRecoveryCount++;

        const recovered = this.recoverFromStuck?.(this._patternRecoveryCount) === true;
        if (recovered) {
            return false;
        }

        if (this.failOnUnrecoverableStuck === false) {
            this._patternRecoveryCount = 0;
            return false;
        }

        if (this._patternRecoveryCount < (this.maxPatternRecoveries ?? 4)) {
            return false;
        }

        this.myte.queue.addExpression('surprise', 24, 1);
        this.myte.queue.addIdle(18);
        return true;
    }
}

// Follow another Myte or a MapObject that has followable:true in its config.
// Trails behind the target's facing direction with a gap, replanning when the target moves.
class FollowObjectAction extends PositionableAction {
    static metadata = {
        id: 'follow_object',
        label: 'Follow',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Follow another Myte or creature',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            trailGap: 28,
            minFollowDistance: 8,
            replanThreshold: 12
        }
    };

    static canPerform(selected, active) {
        const isFollowable = selected instanceof Myte ||
            (selected instanceof MapObject && selected.getConfig?.('followable', false));
        return active && selected !== active && isFollowable && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...FollowObjectAction.metadata.defaultOptions, ...options });
        this._trailPos = null;
        this._lastTargetPos = null;
    }

    // Opposite of target's facing direction — stand here to trail behind them
    _getTrailSide() {
        if (!(this.target instanceof Myte)) return 'bottom';
        const opposite = { N: 'bottom', S: 'top', E: 'left', W: 'right' };
        return opposite[this.target.direction] ?? 'bottom';
    }

    _recomputeTrailPos() {
        const targetRect = this.getRect(this.target);
        const myteRect   = this.myte.getRect();
        return this.calculatePosition(myteRect, targetRect, this._getTrailSide(), {
            gap: this.trailGap,
            align: 'center'
        });
    }

    update() {
        if (!this.target) return true;

        const targetMoved = !this._lastTargetPos ||
            Math.hypot(
                this.target.posX - this._lastTargetPos.x,
                this.target.posY - this._lastTargetPos.y
            ) >= this.replanThreshold;

        if (targetMoved || !this._trailPos) {
            this._trailPos = this._recomputeTrailPos();
            this._lastTargetPos = { x: this.target.posX, y: this.target.posY };
        }

        const dist = Math.hypot(
            this.myte.posX - this._trailPos.x,
            this.myte.posY - this._trailPos.y
        );
        if (dist <= this.minFollowDistance) return false;

        this.myte.setTarget(this._trailPos.x, this._trailPos.y);
        this.myte.moveTowardsTarget();
        return false;
    }
}

// Run laps around an object
class RunLapsAction extends PatternMovementAction {
    static metadata = {
        id: 'run_laps',
        label: 'Run Laps',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Run laps around a target',
        requiresTarget: true,
        affectsMood: true,
        moodEffect: 5,
        defaultOptions: {
            repeat: 5,
            currentTargetIndex: 0,
            lapGap: 12,
            safeTargetRadius: 14,
            stuckThresholdFrames: 42,
            maxPatternRecoveries: 4
        }
    };

    static canPerform(selected, active) {
        return active && selected && selected instanceof Element && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...RunLapsAction.metadata.defaultOptions, ...options });
        this._lapGap = this.lapGap;
    }

    start() {
        super.start();
        this._totalLaps = this.repeat;
        this.currentTargetIndex = 0;
        this.myte.reset();
        this.buildLapTargets();
    }

    getProgress() {
        if (!this._totalLaps || !this.targetPoints?.length) return 0;
        const done = (this._totalLaps - this.repeat) + (this.currentTargetIndex / this.targetPoints.length);
        return Math.min(1, done / this._totalLaps);
    }

    buildLapTargets() {
        if (!this.target) {
            this.targetPoints = [];
            return false;
        }

        const targetRect = this.getTargetRect(this.target, 'collider');
        const myteRect = this.myte.getRect();
        if (!targetRect || !myteRect) {
            this.targetPoints = [];
            return false;
        }

        const candidates = [
            this.calculatePosition(myteRect, targetRect, 'left', { gap: this._lapGap, align: 'bottom-edge' }),
            this.calculatePosition(myteRect, targetRect, 'right', { gap: this._lapGap, align: 'bottom-edge' }),
            this.calculatePosition(myteRect, targetRect, 'right', { gap: this._lapGap, align: 'top-edge' }),
            this.calculatePosition(myteRect, targetRect, 'left', { gap: this._lapGap, align: 'top-edge' })
        ];
        const resolved = this.getResolvedPatternCandidates(candidates, {
            maxRadius: Math.max(this.safeTargetRadius ?? 14, this._lapGap + 6)
        });

        this.targetPoints = resolved;
        if (!this.targetPoints.length) {
            return false;
        }

        this.currentTargetIndex %= this.targetPoints.length;
        const targetPoint = this.targetPoints[this.currentTargetIndex];
        this.myte.setTarget(targetPoint.x, targetPoint.y);
        return true;
    }

    recoverFromStuck() {
        this._lapGap = Math.min(this._lapGap + 6, 44);
        if (this.targetPoints?.length) {
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targetPoints.length;
        }
        return this.buildLapTargets();
    }

    update() {
        if (!this.target || !this.targetPoints?.length) {
            return true;
        }

        if (this.myte.isAtTarget()) {
            this.notePatternProgress();
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targetPoints.length;

            if (this.currentTargetIndex === 0) {
                this.repeat--;
                if (this.repeat <= 0) return true;
            }

            const nextTarget = this.targetPoints[this.currentTargetIndex];
            this.myte.setTarget(nextTarget.x, nextTarget.y);
        }

        this.myte.moveTowardsTarget();
        return this.handlePatternStuck();
    }
}

// Move in a circular pattern using discrete waypoints (like RunLapsAction).
// Pre-generates numPoints evenly-spaced positions around the circle and walks through them.
class CircleAction extends PatternMovementAction {
    static metadata = {
        id: 'circle',
        label: 'Circle',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move in a circular pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            radius: 50,
            numPoints: 8,
            repeat: 2,
            clockwise: true,
            centerX: null,
            centerY: null,
            safeTargetRadius: 12,
            stuckThresholdFrames: 42,
            maxPatternRecoveries: 4
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, {
            ...CircleAction.metadata.defaultOptions,
            centerX: options.centerX ?? myte.posX,
            centerY: options.centerY ?? myte.posY,
            ...options
        });
        this.waypoints = [];
        this.waypointIndex = 0;
    }

    start() {
        super.start();
        this._totalLaps = this.repeat;
        this.waypointIndex = 0;
        this._buildWaypoints();
    }

    getProgress() {
        if (!this._totalLaps || !this.waypoints?.length) return 0;
        const done = (this._totalLaps - this.repeat) + (this.waypointIndex / this.waypoints.length);
        return Math.min(1, done / this._totalLaps);
    }

    _buildWaypoints() {
        const n   = this.numPoints ?? 8;
        const dir = this.clockwise ? 1 : -1;
        const candidates = [];
        for (let i = 0; i < n; i++) {
            const angle = dir * (i / n) * Math.PI * 2;
            candidates.push({
                x: this.centerX + Math.cos(angle) * this.radius,
                y: this.centerY + Math.sin(angle) * this.radius
            });
        }
        const resolved = this.getResolvedPatternCandidates(candidates, {
            maxRadius: Math.max(this.safeTargetRadius ?? 12, Math.round(this.radius * 0.5))
        });
        this.waypoints = resolved.length >= 3 ? resolved : candidates;

        // Start from the waypoint closest to the Myte's current position
        let closestIdx = 0, closestDist = Infinity;
        for (let i = 0; i < this.waypoints.length; i++) {
            const d = Math.hypot(this.waypoints[i].x - this.myte.posX, this.waypoints[i].y - this.myte.posY);
            if (d < closestDist) { closestDist = d; closestIdx = i; }
        }
        this.waypointIndex = closestIdx;
        this.myte.setTarget(this.waypoints[this.waypointIndex].x, this.waypoints[this.waypointIndex].y);
    }

    recoverFromStuck(recoveryCount) {
        this.centerX = this.myte.posX;
        this.centerY = this.myte.posY;
        this.radius  = Math.max(Math.round(this.radius * 0.78), 18);
        if (recoveryCount % 2 === 0) this.clockwise = !this.clockwise;
        this._buildWaypoints();
        return this.waypoints.length >= 3;
    }

    update() {
        if (!this.waypoints?.length) return true;

        if (this.myte.isAtTarget()) {
            this.notePatternProgress();
            this.waypointIndex = (this.waypointIndex + 1) % this.waypoints.length;
            if (this.waypointIndex === 0) {
                this.repeat--;
                if (this.repeat <= 0) return true;
            }
            const next = this.waypoints[this.waypointIndex];
            this.myte.setTarget(next.x, next.y);
        }

        this.myte.moveTowardsTarget();
        return this.handlePatternStuck();
    }
}

// Move in a zigzag pattern using discrete turning-point waypoints.
// Pre-generates numLegs alternating-side waypoints and walks them sequentially.
// Each leg ends at a peak (sin = ±1), computed from frequency and amplitude.
class ZigzagAction extends PatternMovementAction {
    static metadata = {
        id: 'zigzag',
        label: 'Zigzag',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Move in a zigzag pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {
            amplitude: 80,
            frequency: 0.05,
            numLegs: 6,
            direction: { x: 1, y: 0 },
            repeat: 1,
            safeTargetRadius: 12,
            stuckThresholdFrames: 34,
            maxPatternRecoveries: 4
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...ZigzagAction.metadata.defaultOptions, ...options });
        this.waypoints = [];
        this.waypointIndex = 0;
        this._normalizeDirection();
    }

    _normalizeDirection() {
        const d   = this.direction ?? { x: 1, y: 0 };
        const mag = Math.hypot(d.x ?? 1, d.y ?? 0) || 1;
        this.direction = { x: (d.x ?? 1) / mag, y: (d.y ?? 0) / mag };
    }

    start() {
        super.start();
        this._totalRepeat = this.repeat;
        this.startX = this.myte.posX;
        this.startY = this.myte.posY;
        this.waypointIndex = 0;
        this._buildWaypoints();
    }

    getProgress() {
        if (!this._totalRepeat || !this.waypoints?.length) return 0;
        const completedReps = this._totalRepeat - this.repeat;
        const partial = this.waypointIndex / this.waypoints.length;
        return Math.min(1, (completedReps + partial) / this._totalRepeat);
    }

    // Turning points occur where sin(dist * freq) = ±1, i.e. dist = (π/2 + i*π) / freq
    _buildWaypoints() {
        const n    = this.numLegs ?? 6;
        const freq = this.frequency ?? 0.05;
        const amp  = this.amplitude ?? 80;
        const candidates = [];
        for (let i = 0; i < n; i++) {
            const dist   = (Math.PI / 2 + i * Math.PI) / freq;
            const zigzag = Math.sin(dist * freq) * amp; // alternates ±amp
            candidates.push({
                x: this.startX + dist * this.direction.x - zigzag * this.direction.y,
                y: this.startY + dist * this.direction.y + zigzag * this.direction.x
            });
        }
        const resolved = this.getResolvedPatternCandidates(candidates, {
            maxRadius: Math.max(this.safeTargetRadius ?? 12, Math.round(amp * 0.4))
        });
        this.waypoints = resolved.length >= 2 ? resolved : candidates;
        this.waypointIndex = 0;
        if (this.waypoints.length > 0) {
            this.myte.setTarget(this.waypoints[0].x, this.waypoints[0].y);
        }
    }

    recoverFromStuck(recoveryCount) {
        this.startX    = this.myte.posX;
        this.startY    = this.myte.posY;
        this.amplitude = Math.max(Math.round(this.amplitude * 0.75), 24);
        if (recoveryCount % 2 === 0) {
            this.direction = { x: this.direction.y || 1, y: -this.direction.x || 0 };
        }
        this._buildWaypoints();
        return this.waypoints.length >= 2;
    }

    update() {
        if (!this.waypoints?.length) return true;

        if (this.myte.isAtTarget()) {
            this.notePatternProgress();
            this.waypointIndex++;

            if (this.waypointIndex >= this.waypoints.length) {
                this.repeat--;
                if (this.repeat <= 0) return true;
                // Reverse direction and rebuild from current position
                this.startX    = this.myte.posX;
                this.startY    = this.myte.posY;
                this.direction = { x: -this.direction.x, y: -this.direction.y };
                this._buildWaypoints();
                return false;
            }

            const next = this.waypoints[this.waypointIndex];
            this.myte.setTarget(next.x, next.y);
        }

        this.myte.moveTowardsTarget();
        return this.handlePatternStuck();
    }
}

// Walk back and forth between two points a fixed distance apart
class PatrolAction extends PatternMovementAction {
    static metadata = {
        id: 'patrol',
        label: 'Patrol',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Walk back and forth between two points',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            distance: 120,
            direction: { x: 1, y: 0 },
            repeat: 4,
            pauseDuration: 30,
            safeTargetRadius: 14,
            stuckThresholdFrames: 40,
            maxPatternRecoveries: 3
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...PatrolAction.metadata.defaultOptions, ...options });
        this.patrolPoints = [];
        this.patrolIndex  = 0;
        this.pauseTimer   = 0;
    }

    start() {
        super.start();
        this._totalRepeat = this.repeat;
        this._buildPatrolPoints();
    }

    getProgress() {
        if (!this._totalRepeat) return 0;
        const done = (this._totalRepeat - this.repeat) + (this.patrolIndex / 2);
        return Math.min(1, done / this._totalRepeat);
    }

    _buildPatrolPoints() {
        const d   = this.direction ?? { x: 1, y: 0 };
        const mag = Math.hypot(d.x ?? 1, d.y ?? 0) || 1;
        const dx  = (d.x ?? 1) / mag;
        const dy  = (d.y ?? 0) / mag;
        const half = (this.distance ?? 120) / 2;
        const candidates = [
            { x: this.myte.posX - dx * half, y: this.myte.posY - dy * half },
            { x: this.myte.posX + dx * half, y: this.myte.posY + dy * half }
        ];
        const resolved = this.getResolvedPatternCandidates(candidates, { maxRadius: this.safeTargetRadius ?? 14 });
        this.patrolPoints = resolved.length >= 2 ? resolved : candidates;
        this.patrolIndex  = 0;
        this.myte.setTarget(this.patrolPoints[0].x, this.patrolPoints[0].y);
    }

    recoverFromStuck() {
        this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
        const pt = this.patrolPoints[this.patrolIndex];
        return this.setPatternTarget(pt.x, pt.y);
    }

    update() {
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            return false;
        }

        if (this.myte.isAtTarget()) {
            this.notePatternProgress();
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
            if (this.patrolIndex === 0) {
                this.repeat--;
                if (this.repeat <= 0) return true;
            }
            this.pauseTimer = this.pauseDuration ?? 30;
            const next = this.patrolPoints[this.patrolIndex];
            this.myte.setTarget(next.x, next.y);
        }

        this.myte.moveTowardsTarget();
        return this.handlePatternStuck();
    }
}

// Wander randomly within a radius of the starting position
class WanderAction extends PatternMovementAction {
    static metadata = {
        id: 'wander',
        label: 'Wander',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 5000,
        description: 'Wander randomly within a radius',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 2,
        defaultOptions: {
            wanderRadius: 100,
            pauseMin: 30,
            pauseMax: 90,
            safeTargetRadius: 14,
            stuckThresholdFrames: 40,
            maxPatternRecoveries: 5
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...WanderAction.metadata.defaultOptions, duration: WanderAction.metadata.defaultDuration, ...options });
        this.originX    = myte.posX;
        this.originY    = myte.posY;
        this.pauseTimer = 0;
    }

    start() {
        super.start();
        this.originX = this.myte.posX;
        this.originY = this.myte.posY;
        this._pickNextTarget();
    }

    _pickNextTarget() {
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * (this.wanderRadius ?? 100);
        this.setPatternTarget(
            this.originX + Math.cos(angle) * dist,
            this.originY + Math.sin(angle) * dist,
            { maxRadius: this.safeTargetRadius ?? 14 }
        );
    }

    recoverFromStuck() {
        this._pickNextTarget();
        return true;
    }

    update() {
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            this.currentDuration--;
            return this.currentDuration <= 0;
        }

        if (this.myte.isAtTarget()) {
            this.notePatternProgress();
            const min = this.pauseMin ?? 30;
            const max = this.pauseMax ?? 90;
            this.pauseTimer = min + Math.floor(Math.random() * (max - min));
            this._pickNextTarget();
        }

        this.myte.moveTowardsTarget();
        this.currentDuration--;
        if (this.handlePatternStuck()) return true;
        return this.currentDuration <= 0;
    }
}

// Stay near a guard post; return to it whenever the Myte drifts too far
class GuardAction extends PatternMovementAction {
    static metadata = {
        id: 'guard',
        label: 'Guard',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Guard a position, returning if wandered too far',
        requiresTarget: false,
        affectsMood: false,
        defaultOptions: {
            returnThreshold: 80,
            safeTargetRadius: 14,
            stuckThresholdFrames: 40,
            failOnUnrecoverableStuck: false
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...GuardAction.metadata.defaultOptions, ...options });
        this.guardX     = myte.posX;
        this.guardY     = myte.posY;
        this._returning = false;
    }

    start() {
        super.start();
        this.guardX = this.myte.posX;
        this.guardY = this.myte.posY;
    }

    recoverFromStuck() {
        // If stuck while returning, nudge slightly and try again
        this.setPatternTarget(this.guardX, this.guardY, { maxRadius: (this.safeTargetRadius ?? 14) * 2 });
        return true;
    }

    update() {
        const distFromPost = Math.hypot(this.myte.posX - this.guardX, this.myte.posY - this.guardY);

        if (!this._returning && distFromPost > (this.returnThreshold ?? 80)) {
            this._returning = true;
            this.setPatternTarget(this.guardX, this.guardY, { maxRadius: this.safeTargetRadius ?? 14 });
        }

        if (this._returning) {
            this.myte.moveTowardsTarget();
            this.handlePatternStuck();
            if (distFromPost < 10) {
                this._returning = false;
                this.notePatternProgress();
            }
        }

        return false; // infinite — interrupted externally
    }
}

// Physics-based jump
class JumpAction extends MyteAction {
    static metadata = {
        id: 'jump',
        label: 'Jump',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: false,
        defaultDuration: 0,
        description: 'Jump with physics-based movement',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            height: 100,
            gravity: 0.5,
            initialVelocity: -12,
            bounceReduction: 0.5,
            minBounceVelocity: 2
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...JumpAction.metadata.defaultOptions, ...options });
        this.velocity = this.initialVelocity;
    }

    start() {
        super.start();
        this.groundY  = this.myte.posY;
        this.maxHeight = this.groundY - this.height;
    }

    update() {
        this.velocity    += this.gravity;
        this.myte.posY   += this.velocity;

        if (this.myte.posY >= this.groundY) {
            this.myte.posY = this.groundY;
            this.velocity  = -this.velocity * this.bounceReduction;

            if (Math.abs(this.velocity) < this.minBounceVelocity) return true;
        }

        this.myte.setSpritePosition(null, this.myte.posY);
        return false;
    }

    complete() {
        super.complete();
        this.velocity  = 0;
        this.myte.posY = this.groundY;
    }
}
