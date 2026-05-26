class FootstepController {
    constructor(myte) {
        this.myte = myte;
        this.lastTriggerAt = 0;
        this.lastFrameKey = '';
        this.lastFoot = 'right';
    }

    reset() {
        this.lastTriggerAt = 0;
        this.lastFrameKey = '';
        this.lastFoot = 'right';
    }

    handleAnimationEvent(event = {}) {
        if (event.type !== 'footstep') return;

        const config = this.getConfig();
        if (!config.enabled) return;

        const now = performance.now();
        if (now - this.lastTriggerAt < config.cooldownMs) return;

        const frameKey = `${event.state || ''}:${event.frameIndex}`;
        if (frameKey === this.lastFrameKey) return;

        const soundManager = this.myte.parent?.core?.soundManager;
        if (!soundManager?.playFootstep) return;

        const foot = event.foot || this.getAlternatingFoot();
        const speedNormalized = this.getSpeedNormalized();
        const surfaceTag = this.resolveSurfaceTag(config);
        const baseVolume = this.resolveFootstepVolume(config, foot, speedNormalized, surfaceTag);

        soundManager.playFootstep(surfaceTag, {
            foot,
            volume: baseVolume,
            speedNormalized
        });

        this.lastTriggerAt = now;
        this.lastFrameKey = frameKey;
        this.lastFoot = foot;
    }

    getConfig() {
        const movementBaseSpeed = this.myte.definition?.movement?.baseSpeed ?? this.myte.stats?.speed ?? 1;
        const locomotion = this.myte.definition?.audio?.locomotion ?? {};
        const footsteps = locomotion.footsteps ?? {};
        return {
            enabled: footsteps.enabled !== false,
            cooldownMs: footsteps.cooldownMs ?? 80,
            baseVolume: footsteps.baseVolume ?? 0.62,
            volumeSteps: Array.isArray(footsteps.volumeSteps) && footsteps.volumeSteps.length >= 2
                ? footsteps.volumeSteps
                : [0.96, 1.0],
            speedVolumeRange: footsteps.speedVolumeRange ?? { min: 0.88, max: 1.06 },
            surfaces: footsteps.surfaces ?? {},
            movementBaseSpeed
        };
    }

    getSpeedNormalized() {
        const currentSpeed = this.myte.stats?.getSpeed?.() ?? this.myte.speed ?? 1;
        const baseSpeed = this.myte.definition?.movement?.baseSpeed ?? this.myte.stats?.speed ?? 1;
        const safeBaseSpeed = Math.max(0.01, baseSpeed);
        return Utility.clamp(currentSpeed / safeBaseSpeed, 0.65, 1.35);
    }

    getAlternatingFoot() {
        return this.lastFoot === 'left' ? 'right' : 'left';
    }

    resolveSurfaceTag(config) {
        const gridSystem = this.myte.parent?.gameMap?.gridSystem;
        if (!gridSystem) return 'default';

        const m  = this.myte;
        const ox = m.collider?.offsetX ?? 0;
        const oy = m.collider?.offsetY ?? 0;
        const cw = m.collider?.width  ?? m.size?.width  ?? 0;
        const ch = m.collider?.height ?? m.size?.height ?? 0;
        const feetX = m.posX + ox + cw / 2;
        const feetY = m.posY + oy + ch;

        const { x: gx, y: gy } = gridSystem.worldToGrid(feetX, feetY);
        const terrainType = gridSystem.grid[gx]?.[gy]?.terrainType ?? 'default';
        return config.surfaces[terrainType] || terrainType || 'default';
    }

    resolveFootstepVolume(config, foot, speedNormalized, _surfaceTag) {
        const footStep = foot === 'left' ? config.volumeSteps[0] : config.volumeSteps[1];
        const speedStep = speedNormalized >= 1
            ? config.speedVolumeRange.max
            : config.speedVolumeRange.min;
        return config.baseVolume * footStep * speedStep;
    }
}
