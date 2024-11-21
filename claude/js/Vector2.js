class Vector2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(other) {
        other = this.ensureVector2(other);
        return new Vector2(this.x + other.x, this.y + other.y);
    }

    subtract(other) {
        other = this.ensureVector2(other);
        return new Vector2(this.x - other.x, this.y - other.y);
    }

    multiply(scalar) {
        return new Vector2(this.x * scalar, this.y * scalar);
    }

    divide(scalar) {
        if (scalar === 0) return new Vector2();
        return new Vector2(this.x / scalar, this.y / scalar);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const mag = this.magnitude();
        if (mag === 0) return new Vector2();
        return this.divide(mag);
    }

    distanceTo(other) {
        other = this.ensureVector2(other);
        return this.subtract(other).magnitude();
    }

    clone() {
        return new Vector2(this.x, this.y);
    }

    equals(other) {
        other = this.ensureVector2(other);
        return this.x === other.x && this.y === other.y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    // Helper method to ensure we're always working with Vector2 objects
    ensureVector2(point) {
        if (point instanceof Vector2) {
            return point;
        }
        return new Vector2(point.x || 0, point.y || 0);
    }

    // Static utility methods
    static zero() {
        return new Vector2(0, 0);
    }

    static one() {
        return new Vector2(1, 1);
    }

    static distance(a, b) {
        return a.distanceTo(b);
    }

    static lerp(start, end, t) {
        return start.add(end.subtract(start).multiply(t));
    }
}