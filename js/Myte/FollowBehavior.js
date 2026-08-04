class BreadcrumbTrail {
    constructor(owner, { sampleDistance = 16, maxPoints = 160 } = {}) {
        this.owner = owner;
        this.sampleDistance = sampleDistance;
        this.maxPoints = maxPoints;
        this.points = [];
    }

    record(x = this.owner?.posX, y = this.owner?.posY) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
        const previous = this.points[this.points.length - 1];
        if (previous && Math.hypot(x - previous.x, y - previous.y) < this.sampleDistance) return false;
        this.points.push({ x, y });
        if (this.points.length > this.maxPoints) this.points.shift();
        return true;
    }

    pointBehind(distance) {
        if (this.points.length === 0) return null;
        let remaining = Math.max(0, Number(distance) || 0);
        for (let index = this.points.length - 1; index > 0; index--) {
            const newer = this.points[index];
            const older = this.points[index - 1];
            const segmentLength = Math.hypot(newer.x - older.x, newer.y - older.y);
            if (segmentLength <= 0) continue;
            if (remaining <= segmentLength) {
                const t = remaining / segmentLength;
                return { x: newer.x + ((older.x - newer.x) * t), y: newer.y + ((older.y - newer.y) * t) };
            }
            remaining -= segmentLength;
        }
        return { ...this.points[0] };
    }

    // Nearest recorded crumb to (x, y), with its distance.
    nearest(x, y) {
        let bestIndex = -1;
        let bestDistance = Infinity;
        for (let index = 0; index < this.points.length; index++) {
            const point = this.points[index];
            const distance = Math.hypot(point.x - x, point.y - y);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = index;
            }
        }
        return { index: bestIndex, distance: bestDistance };
    }

    // Index of the crumb sitting `distance` behind the newest one by arc length.
    indexBehind(distance) {
        let remaining = Math.max(0, Number(distance) || 0);
        for (let index = this.points.length - 1; index > 0; index--) {
            const segmentLength = Math.hypot(
                this.points[index].x - this.points[index - 1].x,
                this.points[index].y - this.points[index - 1].y
            );
            if (remaining <= segmentLength) return index;
            remaining -= segmentLength;
        }
        return 0;
    }

    /**
     * The next crumb a follower at (x, y) should steer toward: a short hop forward
     * along ground the leader physically walked, never past the follower's own slot.
     *
     * Steering by short trail hops (rather than straight at the slot point) is what
     * lets an arbitrarily long line thread a doorway — every segment is pre-validated,
     * so no follower needs A* while the trail holds. Returns null only when the
     * follower is genuinely off the trail (teleport, closed door, map change), which
     * is the caller's signal to fall back to a real path search.
     */
    stepFrom(x, y, slotDistance, { maxOffTrail = 96, lookAhead = 2 } = {}) {
        if (this.points.length === 0) return null;
        const { index, distance } = this.nearest(x, y);
        if (index < 0 || distance > maxOffTrail) return null;

        const slotIndex = this.indexBehind(slotDistance);
        if (index >= slotIndex) return this.pointBehind(slotDistance);
        return { ...this.points[Math.min(index + lookAhead, slotIndex)] };
    }
}

class FollowBehavior {
    constructor(follower, target, options = {}) {
        this.follower = follower;
        this.target = target;
        this.minDistance = options.minDistance ?? follower.followRadius?.min ?? 64;
        this.maxDistance = options.maxDistance ?? follower.followRadius?.max ?? 128;
        const baseFollowDistance = options.followDistance ?? Math.max(this.minDistance, 28);
        const followers = follower.container?.relationships?.get?.('followedBy', target) ?? [];
        const trailIndex = followers
            .slice()
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
            .indexOf(follower);
        this.followDistance = baseFollowDistance * Math.max(1, trailIndex + 1);
        this.smoothingMs = options.smoothingMs ?? 250;
        this.repathInterval = options.repathInterval ?? 450;
        // How far OFF the shared trail this follower may drift and still steer by it.
        // Deliberately not a distance to the leader: a follower at trail rank N sits
        // N*gap behind by design, so gating on leader distance pushed the tail of a
        // long line into the A* fallback while the trail was perfectly intact.
        this.trailReach = options.trailReach ?? this.maxDistance * 2;
        this.isMoving = false;
        this.smoothedTarget = null;
        this._pathAction = null;
        this._lastRepathAt = -Infinity;
    }

    _smoothTarget(deltaTime) {
        if (!this.smoothedTarget) {
            this.smoothedTarget = { x: this.target.posX, y: this.target.posY };
            return;
        }
        const alpha = 1 - Math.exp(-Math.max(0, deltaTime) / this.smoothingMs);
        this.smoothedTarget.x += (this.target.posX - this.smoothedTarget.x) * alpha;
        this.smoothedTarget.y += (this.target.posY - this.smoothedTarget.y) * alpha;
    }

    _ownSideTarget() {
        const dx = this.follower.posX - this.smoothedTarget.x;
        const dy = this.follower.posY - this.smoothedTarget.y;
        const length = Math.hypot(dx, dy) || 1;
        return {
            x: this.smoothedTarget.x + ((dx / length) * this.followDistance),
            y: this.smoothedTarget.y + ((dy / length) * this.followDistance)
        };
    }

    _startFallbackPath(destination) {
        const now = SimClock.now();
        if (now - this._lastRepathAt < this.repathInterval) return;
        this._lastRepathAt = now;
        this._pathAction = new AStarMoveAction(this.follower, { target: destination, userInitiated: false });
        this._pathAction.start();
    }

    update(deltaTime = 0) {
        if (this.target?.isActive === false || this.target?.active === false || !this.follower?.isActive) return true;
        this._smoothTarget(deltaTime);
        const distance = Math.hypot(this.follower.posX - this.smoothedTarget.x, this.follower.posY - this.smoothedTarget.y);
        if (!this.isMoving && distance <= this.maxDistance) return false;
        if (this.isMoving && distance <= this.minDistance) {
            this.isMoving = false;
            this._pathAction = null;
            return false;
        }
        this.isMoving = true;

        const trailStep = this.target.breadcrumbTrail?.stepFrom(
            this.follower.posX, this.follower.posY, this.followDistance,
            { maxOffTrail: this.trailReach }
        ) ?? null;
        const destination = trailStep ?? this._ownSideTarget();
        if (trailStep) {
            this._pathAction = null;
            this.follower.setTarget(destination.x, destination.y);
            this.follower.moveTowardsTarget();
            return false;
        }

        this._startFallbackPath(destination);
        if (this._pathAction?.update?.()) this._pathAction = null;
        return false;
    }
}
