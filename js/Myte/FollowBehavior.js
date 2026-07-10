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

        const trailPoint = this.target.breadcrumbTrail?.pointBehind(this.followDistance) ?? null;
        const destination = trailPoint ?? this._ownSideTarget();
        if (trailPoint && distance <= this.trailReach) {
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
