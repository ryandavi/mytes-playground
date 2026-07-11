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
}
