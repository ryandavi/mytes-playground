// Shared, behavior-neutral movement math for map-object movers. Collision
// response and AI remain owned by each mover because their semantics differ.
class MovementBody {
    constructor(owner) {
        this.owner = owner;
    }

    getSpeed(velocity = this.owner?.velocity) {
        return Math.hypot(Number(velocity?.x ?? 0), Number(velocity?.y ?? 0));
    }

    capVelocity(limit, velocity = this.owner?.velocity) {
        if (!velocity) return false;
        const speed = this.getSpeed(velocity);
        if (!Number.isFinite(speed)) {
            velocity.x = 0;
            velocity.y = 0;
            return false;
        }
        if (!Number.isFinite(limit) || limit <= 0 || speed <= limit) return false;
        velocity.x = (velocity.x / speed) * limit;
        velocity.y = (velocity.y / speed) * limit;
        return true;
    }

    getDirection(velocity = this.owner?.velocity, threshold = 0.01) {
        const x = Number(velocity?.x) || 0;
        const y = Number(velocity?.y) || 0;
        if ((x === 0 && y === 0) || (Math.abs(x) < threshold && Math.abs(y) < threshold)) return null;
        if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'E' : 'W';
        return y > 0 ? 'S' : 'N';
    }

    // ── Occupancy sampling ────────────────────────────────────────────────────

    // Can the owner stand at (x, y)? Defers to the grid; permissive with no grid,
    // matching the pre-extraction behaviour of every caller.
    canOccupy(x, y) {
        const gridSystem = this.owner?.gameMap?.gridSystem;
        if (!gridSystem) return true;
        const clearsWorld = gridSystem.isEntityPositionValid?.(this.owner, x, y) ?? true;
        if (!clearsWorld) return false;
        return gridSystem.isActorPositionValid?.(this.owner, x, y) ?? true;
    }

    // Sample the straight line to (x, y) at `stepSize` intervals. Cheap
    // pre-flight check for "could I fly/walk straight there", not a path search.
    isPathClear(targetX, targetY, stepSize = 12) {
        const dx = targetX - this.owner.posX;
        const dy = targetY - this.owner.posY;
        const distance = Math.hypot(dx, dy);
        if (distance <= 1) return this.canOccupy(targetX, targetY);

        const steps = Math.max(1, Math.ceil(distance / stepSize));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (!this.canOccupy(this.owner.posX + (dx * t), this.owner.posY + (dy * t))) return false;
        }
        return true;
    }

    // ── Movement resolution ───────────────────────────────────────────────────

    /**
     * Resolve an intended step against obstacles, in escalating order: the full
     * step, then each axis alone (slide along the wall), then angular probes
     * around the heading. Returns where the owner may actually land and with what
     * velocity; `moved: false` means every option was blocked and the caller
     * should apply its own response (bounce, repath, give up).
     *
     * Pure math — it never writes to the owner. Callers assign the result.
     */
    resolveMove(nextX, nextY, options = {}) {
        const velocity = this.owner.velocity;
        const { posX, posY } = this.owner;
        const canOccupy = options.canOccupy ?? ((x, y) => this.canOccupy(x, y));

        if (canOccupy(nextX, nextY)) {
            return { moved: true, x: nextX, y: nextY, vx: velocity.x, vy: velocity.y };
        }
        if (canOccupy(nextX, posY)) {
            return { moved: true, x: nextX, y: posY, vx: velocity.x, vy: 0 };
        }
        if (canOccupy(posX, nextY)) {
            return { moved: true, x: posX, y: nextY, vx: 0, vy: velocity.y };
        }

        const probeSpeed = options.probeSpeed ?? this.getSpeed(velocity);
        const angleOffsets = options.angleOffsets ?? MovementBody.DEFAULT_PROBE_ANGLES;
        const baseAngle = Math.atan2(velocity.y, velocity.x || 0.0001);

        for (const offset of angleOffsets) {
            const testVx = Math.cos(baseAngle + offset) * probeSpeed;
            const testVy = Math.sin(baseAngle + offset) * probeSpeed;
            const testX = posX + testVx;
            const testY = posY + testVy;
            if (canOccupy(testX, testY)) {
                return { moved: true, x: testX, y: testY, vx: testVx, vy: testVy };
            }
        }

        return { moved: false, x: posX, y: posY, vx: velocity.x, vy: velocity.y };
    }

    // ── Stuck detection ───────────────────────────────────────────────────────

    /**
     * Shared "I meant to move but didn't" counter. Each mover keeps its own
     * *response* — creatures bounce and re-pick a heading, NPCs open doors and
     * repath — but the detection is the same in all of them, so it lives here.
     *
     * @param {string} name       counter id, so one owner can run several
     * @param {boolean} intending was movement actually attempted this tick?
     * @param {number} moved      displacement achieved
     * @param {object} options    { minDistance, threshold }
     * @returns {boolean} true on the tick the threshold trips (counter auto-resets)
     */
    trackStuck(name, intending, moved, { minDistance = 0.5, threshold = 6 } = {}) {
        this._stuckCounters ??= new Map();

        if (!intending || moved >= minDistance) {
            this._stuckCounters.set(name, 0);
            return false;
        }

        const next = (this._stuckCounters.get(name) ?? 0) + 1;
        if (next >= threshold) {
            this._stuckCounters.set(name, 0);
            return true;
        }
        this._stuckCounters.set(name, next);
        return false;
    }

    getStuckCount(name) {
        return this._stuckCounters?.get(name) ?? 0;
    }

    resetStuck(name = null) {
        if (!this._stuckCounters) return;
        if (name === null) this._stuckCounters.clear();
        else this._stuckCounters.set(name, 0);
    }
}

// Slide angles tried around the blocked heading, nearest-first.
MovementBody.DEFAULT_PROBE_ANGLES = Object.freeze([
    Math.PI / 4, -Math.PI / 4,
    Math.PI / 2, -Math.PI / 2,
    (3 * Math.PI) / 4, -(3 * Math.PI) / 4
]);
