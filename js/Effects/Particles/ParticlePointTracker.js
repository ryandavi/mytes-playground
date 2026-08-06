class ParticlePointTracker {
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.lastX = x;
        this.lastY = y;
        this.dx = 0;
        this.dy = 0;
        this.speed = 0;
        this.active = true;
        this.visible = true;
    }

    setPosition(x = this.x, y = this.y, z = this.z) {
        this.x = ParticleDataUtils.toFiniteNumber(x, this.x);
        this.y = ParticleDataUtils.toFiniteNumber(y, this.y);
        this.z = ParticleDataUtils.toFiniteNumber(z, this.z);
        return this;
    }

    update() {
        this.dx = this.x - this.lastX;
        this.dy = this.y - this.lastY;
        this.speed = Math.hypot(this.dx, this.dy);
        this.lastX = this.x;
        this.lastY = this.y;
        return this;
    }
}
