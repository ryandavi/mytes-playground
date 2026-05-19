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

    static canPerform(selected, active) {
        return false;
    }

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

        if (this.myte.checkForCollisions && this.myte.parent.gameMap) {
            const path = this.myte.parent.gameMap.gridSystem.pathfinder.findPath(
                this.myte.posX,
                this.myte.posY,
                this.targets[this.targetIndex].x,
                this.targets[this.targetIndex].y,
                this.myte.collider.width,
                this.myte.collider.height
            );

            if (path) {
                this.targets = path;
                this.targetIndex = 0;
            }
        }

        this.setNextTarget();
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            this.targetIndex++;
            return !this.setNextTarget();
        }
        this.myte.move_toward_target();
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
            console.warn(`[ASTAR] start: no pathfinder — completing immediately`);
            this._actionComplete = true;
            return;
        }

        const target = this.getTargetPosition();
        if (!target) {
            console.warn(`[ASTAR] start: could not resolve target position from`, this.target, `— completing immediately`);
            console.trace('[ASTAR] null target call stack');
            this._actionComplete = true;
            return;
        }

        console.log(`[ASTAR] start: from=(${this.myte.posX.toFixed(1)},${this.myte.posY.toFixed(1)}) to=(${target.x.toFixed(1)},${target.y.toFixed(1)})`);
        this._finalTarget = target;
        this._buildPath(this.myte.posX, this.myte.posY, target);
    }

    _buildPath(fromX, fromY, to) {
        const myte = this.myte;
        const effectiveOptions = { ...myte.pathfindingOptions, ...(this.pathfindingOptions || {}) };
        const path = myte.pathfinder.findPath(myte, fromX, fromY, to.x, to.y, effectiveOptions);

        if (!path?.length) {
            console.warn(`[ASTAR] _buildPath: pathfinder returned no path from=(${fromX.toFixed(1)},${fromY.toFixed(1)}) to=(${to.x.toFixed(1)},${to.y.toFixed(1)}) — completing`);
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
            console.log(`[ASTAR] _buildPath: dropped first waypoint (already there)`);
            this.targetPoints.shift();
        }

        if (this.targetPoints.length === 0) {
            console.warn(`[ASTAR] _buildPath: targetPoints empty after filtering — completing`);
            this._actionComplete = true;
            return;
        }

        console.log(`[ASTAR] _buildPath: ${path.length} raw pts → ${this.targetPoints.length} waypoints. First=(${this.targetPoints[0].x.toFixed(1)},${this.targetPoints[0].y.toFixed(1)}) Last=(${this.targetPoints[this.targetPoints.length-1].x.toFixed(1)},${this.targetPoints[this.targetPoints.length-1].y.toFixed(1)})`);
        this.currentTargetIndex = 0;
        myte.setTarget(this.targetPoints[0].x, this.targetPoints[0].y);
    }

    update() {
        if (this._actionComplete) return true;
        if (!this.myte?.isActive) { console.warn(`[ASTAR] update: myte inactive — completing`); return true; }
        if (!this.targetPoints?.length) { console.warn(`[ASTAR] update: no targetPoints — completing`); return true; }

        if (this.myte.is_at_target()) {
            this._stuckCount = 0;
            this.currentTargetIndex++;

            if (this.currentTargetIndex >= this.targetPoints.length) {
                const fp = this.targetPoints[this.targetPoints.length - 1];
                this.myte.setPosition(fp.x, fp.y);
                this.myte.setSpritePosition(fp.x, fp.y);
                this.myte.setTarget(fp.x, fp.y);
                this._actionComplete = true;
                return true;
            }

            this.myte.setTarget(
                this.targetPoints[this.currentTargetIndex].x,
                this.targetPoints[this.currentTargetIndex].y
            );
        }

        if (typeof this.myte.move_toward_target_new === 'function') {
            this.myte.move_toward_target_new();
        } else {
            this.myte.move_toward_target();
        }

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
        this._actionComplete = true;
    }

    cancel() {
        this._actionComplete = true;
    }
}

// ─── Approach configs ─────────────────────────────────────────────────────────
// Full approach config schema:
// {
//   allowedSides: 'any'              — all four cardinal sides (default)
//              | string[]            — only these sides, e.g. ['left', 'right']
//              | { exclude: string[] } — all except listed
//              | 'front'            — resolved at runtime from target.facingDirection
//   preferredSide: null | string     — tried first if set; others used as fallback
//   gap: number                      — px from target edge. + = clear space, - = overlap
//   align: string                    — cross-axis alignment for the approach side:
//                                      left/right → 'top-edge' | 'center' | 'bottom-edge'
//                                      top/bottom → 'left-edge' | 'center' | 'right-edge'
//   alignTo: 'sprite' | 'collider'  — which target rect to use for positioning
// }
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
        }
    };

    targetPos = null;
    targetPoints = null;
    currentTargetIndex = 0;
    targetCenter = null;
    _stuckFrames = 0;
    _lastPos = null;

    constructor(myte, options) {
        super(myte, { ...GoToObjectAction.metadata.defaultOptions, ...options });
    }

    static canPerform(selected, active) {
        return active && selected && !active.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    // Merge a string key or partial config object into a full ApproachConfig.
    _normalizeConfig(raw) {
        if (typeof raw === 'string') {
            return { ...APPROACH_CONFIGS[raw] ?? APPROACH_CONFIGS.side };
        }
        return { ...APPROACH_CONFIGS.side, ...raw };
    }

    // Priority: action-level override → target.getApproachConfig() → target.getApproachMode() → 'side'
    _resolveApproachConfig() {
        if (this.approachConfig != null) {
            const cfg = this._normalizeConfig(this.approachConfig);
            console.log(`[APPROACH] config source=action-override`, cfg);
            return cfg;
        }
        const targetCfg = this.target?.getApproachConfig?.();
        if (targetCfg != null) {
            const cfg = this._normalizeConfig(targetCfg);
            console.log(`[APPROACH] config source=getApproachConfig raw=`, targetCfg, `resolved=`, cfg);
            return cfg;
        }
        const mode = this.target?.getApproachMode?.() ?? 'side';
        const cfg = { ...APPROACH_CONFIGS[mode] ?? APPROACH_CONFIGS.side };
        console.log(`[APPROACH] config source=getApproachMode mode="${mode}"`, cfg);
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
    }

    buildApproachPlan() {
        const cfg        = this._resolvedApproachConfig;
        // Use collider rect for positioning; sprite rect for facing direction
        const targetRect = this.getTargetRect(this.target, cfg.alignTo);
        const spriteRect = this.getTargetRect(this.target, 'sprite');

        if (!targetRect) {
            console.warn(`[APPROACH] buildApproachPlan: no targetRect — alignTo="${cfg.alignTo}" target=`, this.target);
            this.targetPos = null;
            this.targetPoints = null;
            return;
        }

        const myteRect = this.myte.getRect();
        console.log(`[APPROACH] buildApproachPlan target="${this.target?.constructor?.name ?? this.target?.id}" alignTo="${cfg.alignTo}" targetRect=`, {...targetRect}, `myteRect=`, {...myteRect}, `mytePos=(${this.myte.posX.toFixed(1)},${this.myte.posY.toFixed(1)})`);

        this.targetCenter = {
            x: spriteRect.x + spriteRect.width  / 2,
            y: spriteRect.y + spriteRect.height / 2
        };

        const candidates = this.getCandidatePositions(targetRect, myteRect, cfg);
        console.log(`[APPROACH] candidates (${candidates.length}):`, candidates.map((c, i) => `[${i}] (${c.x.toFixed(1)},${c.y.toFixed(1)})`).join('  '));
        const bestPath   = this.findBestPath(candidates);

        if (bestPath) {
            console.log(`[APPROACH] bestPath → targetPos=(${bestPath.targetPos.x.toFixed(1)},${bestPath.targetPos.y.toFixed(1)}) score=${bestPath.score.toFixed(1)} waypoints=${bestPath.targetPoints.length}`);
            this.targetPos    = bestPath.targetPos;
            this.targetPoints = bestPath.targetPoints;
            return;
        }

        this.targetPos = candidates[0] ?? {
            x: this.targetCenter.x - myteRect.width  / 2,
            y: this.targetCenter.y - myteRect.height / 2
        };
        console.log(`[APPROACH] no path found — falling back to candidate[0] targetPos=(${this.targetPos.x.toFixed(1)},${this.targetPos.y.toFixed(1)})`);
        this.targetPoints = null;
    }

    getCandidatePositions(targetRect, myteRect, cfg) {
        const sides    = this._getAllowedSides(cfg, targetRect);
        const posOpts  = { gap: cfg.gap, align: cfg.align };
        const seen     = new Set();
        const candidates = [];

        console.log(`[APPROACH] sides order: [${sides.join(', ')}]`);
        for (const side of sides) {
            const raw      = this.calculatePosition(myteRect, targetRect, side, posOpts);
            const clamped  = this.adjustPositionToBounds(raw, myteRect);
            const key      = `${Math.round(clamped.x)},${Math.round(clamped.y)}`;
            const dup = seen.has(key);
            console.log(`[APPROACH]   side=${side} raw=(${raw.x.toFixed(1)},${raw.y.toFixed(1)}) clamped=(${clamped.x.toFixed(1)},${clamped.y.toFixed(1)})${dup ? ' [DUPLICATE - skipped]' : ''}`);
            if (dup) continue;
            seen.add(key);
            candidates.push(clamped);
        }

        return candidates;
    }

    findBestPath(candidates) {
        if (!this.myte?.pathfinder) {
            console.warn(`[APPROACH] findBestPath: no pathfinder on myte`);
            return null;
        }
        if (!candidates.length) {
            console.warn(`[APPROACH] findBestPath: no candidates`);
            return null;
        }

        let bestPath = null;

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const endCX = candidate.x + (this.myte.size.width  / 2);
            const endCY = candidate.y + (this.myte.size.height / 2);
            const path  = this.myte.pathfinder.findPath(this.myte, this.myte.posX, this.myte.posY, endCX, endCY);

            if (!path?.length) {
                console.log(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) → no path`);
                continue;
            }

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

            const score = this.getPathScore(targetPoints);
            console.log(`[APPROACH]   candidate[${i}] (${candidate.x.toFixed(1)},${candidate.y.toFixed(1)}) → path ok rawPts=${path.length} filteredPts=${targetPoints.length} score=${score.toFixed(1)}${(!bestPath || score < bestPath.score) ? ' ← best so far' : ''}`);
            if (!bestPath || score < bestPath.score) {
                bestPath = { targetPos: candidate, targetPoints, score };
            }
        }

        return bestPath;
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

    _moveToward() {
        if (typeof this.myte.move_toward_target_new === 'function') {
            this.myte.move_toward_target_new();
        } else {
            this.myte.move_toward_target();
        }
    }

    update() {
        // Stuck detection
        if (!this._lastPos) this._lastPos = { x: this.myte.posX, y: this.myte.posY };
        const moved = Math.hypot(this.myte.posX - this._lastPos.x, this.myte.posY - this._lastPos.y);
        this._lastPos = { x: this.myte.posX, y: this.myte.posY };
        this._stuckFrames = moved < 0.1 ? this._stuckFrames + 1 : 0;

        if (this._stuckFrames > 45) {
            const finalTarget = this.targetPoints?.length
                ? this.targetPoints[this.targetPoints.length - 1]
                : this.targetPos;
            if (finalTarget) {
                const dist = Math.hypot(this.myte.posX - finalTarget.x, this.myte.posY - finalTarget.y);
                if (dist < 80) {
                    this.faceTarget();
                    return true;
                }
            }
            this._stuckFrames = 0;
            this.buildApproachPlan();
            if (!this.targetPos && !this.targetPoints) return true;
        }

        if (this.targetPoints?.length) {
            if (this.myte.is_at_target()) {
                this.currentTargetIndex++;
                if (this.currentTargetIndex >= this.targetPoints.length) {
                    this.faceTarget();
                    return true;
                }
            }
            const wp = this.targetPoints[this.currentTargetIndex];
            this.myte.setTarget(wp.x, wp.y);
            this._moveToward();
            return false;
        }

        if (!this.targetPos) return true;

        this.myte.setTarget(this.targetPos.x, this.targetPos.y);
        this._moveToward();

        if (this.myte.is_at_target()) {
            this.faceTarget();
            return true;
        }

        return false;
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
        this.myte.move_toward_target();
        return false;
    }
}

// Follow another Myte or MapObject continuously
class FollowObjectAction extends PositionableAction {
    static metadata = {
        id: 'follow_object',
        label: 'Follow',
        category: 'movement',
        priority: 2,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: -1,
        description: 'Follow another object or Myte',
        requiresTarget: true,
        affectsMood: false,
        defaultOptions: {
            gap: -5,
            align: 'bottom-edge'
        }
    };

    static canPerform(selected, active) {
        const isFollowable = selected instanceof Myte || selected instanceof MapObject;
        return active && selected && selected !== active && isFollowable && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...FollowObjectAction.metadata.defaultOptions, ...options });
    }

    update() {
        if (!this.target) return true;

        const targetRect  = this.getRect(this.target);
        const myteRect    = this.myte.getRect();
        const posOpts     = { gap: this.gap, align: this.align };

        let horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        let rawTargetPos = this.calculatePosition(myteRect, targetRect, horizontal, posOpts);
        let targetPos = this.adjustPositionToBounds(rawTargetPos, myteRect);

        if (Math.abs(targetPos.x - rawTargetPos.x) > 0.01) {
            horizontal = rawTargetPos.x < targetPos.x ? 'right' : 'left';
            rawTargetPos = this.calculatePosition(myteRect, targetRect, horizontal, posOpts);
            targetPos = this.adjustPositionToBounds(rawTargetPos, myteRect);
        }

        this.myte.setTarget(targetPos.x, targetPos.y);

        if (typeof this.myte.move_toward_target_new === 'function') {
            this.myte.move_toward_target_new();
        } else {
            this.myte.move_toward_target();
        }

        return false;
    }
}

// Run laps around an object
class RunLapsAction extends PositionableAction {
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
            currentTargetIndex: 0
        }
    };

    static canPerform(selected, active) {
        return active && selected && selected instanceof Element && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...RunLapsAction.metadata.defaultOptions, ...options });
    }

    start() {
        super.start();

        const targetRect = this.getRect(this.target);
        const myteRect   = this.myte.getRect();

        this.targetPoints = [
            this.calculatePosition(myteRect, targetRect, 'left',   { gap: -5, align: 'bottom-edge' }),
            this.calculatePosition(myteRect, targetRect, 'right',  { gap: -5, align: 'bottom-edge' }),
            this.calculatePosition(myteRect, targetRect, 'right',  { gap: -5, align: 'top-edge' }),
            this.calculatePosition(myteRect, targetRect, 'left',   { gap: -5, align: 'top-edge' })
        ];

        this.myte.setTarget(this.targetPoints[this.currentTargetIndex].x, this.targetPoints[this.currentTargetIndex].y);
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targetPoints.length;

            if (this.currentTargetIndex === 0) {
                this.repeat--;
                if (this.repeat <= 0) return true;
            }

            this.myte.setTarget(this.targetPoints[this.currentTargetIndex].x, this.targetPoints[this.currentTargetIndex].y);
        }
        this.myte.move_toward_target();
        return false;
    }
}

// Move in a circular pattern
class CircleAction extends MyteAction {
    static metadata = {
        id: 'circle',
        label: 'Circle',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 3000,
        description: 'Move in a circular pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 3,
        defaultOptions: {
            radius: 50,
            speed: 0.01,
            centerX: null,
            centerY: null
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
            duration: CircleAction.metadata.defaultDuration,
            ...options
        });
        this.angle = 0;
    }

    start() {
        super.start();
    }

    update() {
        this.angle += this.speed;
        this.myte.setTarget(
            this.centerX + Math.cos(this.angle) * this.radius,
            this.centerY + Math.sin(this.angle) * this.radius
        );
        this.myte.move_toward_target();
        this.current_duration--;
        return this.current_duration <= 0;
    }
}

// Move in a zigzag pattern
class ZigzagAction extends MyteAction {
    static metadata = {
        id: 'zigzag',
        label: 'Zigzag',
        category: 'movement',
        priority: 3,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 2000,
        description: 'Move in a zigzag pattern',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 4,
        defaultOptions: {
            amplitude: 100,
            frequency: 0.05,
            direction: { x: 1, y: 0 }
        }
    };

    static canPerform(selected, active) {
        return active === selected && !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...ZigzagAction.metadata.defaultOptions, duration: ZigzagAction.metadata.defaultDuration, ...options });
        this.startX = myte.posX;
        this.startY = myte.posY;
        this.distance = 0;
    }

    start() {
        super.start();
    }

    update() {
        this.distance += 1;
        const zigzag = Math.sin(this.distance * this.frequency) * this.amplitude;
        this.myte.setTarget(
            this.startX + this.distance * this.direction.x - zigzag * this.direction.y,
            this.startY + this.distance * this.direction.y + zigzag * this.direction.x
        );
        this.myte.move_toward_target();
        this.current_duration--;
        return this.current_duration <= 0;
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
