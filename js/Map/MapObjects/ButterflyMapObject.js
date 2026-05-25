class ButterflyMapObject extends AmbientCreatureMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Map legacy butterfly config keys to generic creature keys
        const mergedConfig = {
            targetSeekChance: config.flowerSeekChance ?? 0.003,
            targetSearchRadius: config.flowerSearchRadius ?? 320,
            targetRestDurationMin: config.flowerRestDurationMin ?? 2200,
            targetRestDurationMax: config.flowerRestDurationMax ?? 5200,
            ...config
        };
        super(parent, type, variant, posX, posY, mergedConfig, options);
        this.flutterSoundCooldown = 300 + Math.random() * 300;
        this.wasRestingOnTarget = false;

        this.parent.particleSystem.addParticleMethodsToObject(this);
        this.addEffect('SPARKLE_SPRITE', {
            attachmentPoint: 'back',
            directionalDistance: Math.max(8, this.size.width * 0.18),
            followElevation: true,
            randomizePosition: true,
            randomizeFactor: 10,
            offsetY: this.size.height * 0.05
        });
    }

    findTarget() {
        let best = null;
        let bestDistance = this.targetSearchRadius;
        const objects = this.gameMap?.objects || [];

        for (const obj of objects) {
            if (!obj || obj === this || obj.active === false) continue;

            const type = String(obj.type || '').toUpperCase();
            const variant = String(obj.variant || '').toLowerCase();
            const ctor = obj.constructor?.name || '';
            const isFlower = type.includes('FLOWER') || variant.includes('flower') || ctor.includes('Flower');
            if (!isFlower) continue;

            // Skip deflowered flowers
            if (obj.config?.deflowered || obj.getConfig?.('deflowered')) continue;

            // Skip flowers already claimed by another butterfly
            const claimed = objects.some(other =>
                other !== this &&
                other instanceof ButterflyMapObject &&
                other.restingTarget === obj
            );
            if (claimed) continue;

            const pos = this.getTargetRestPosition(obj);
            if (!pos || !this.canOccupyPosition(pos.x, pos.y)) continue;

            const distance = Math.hypot(
                (obj.posX + (obj.size?.width || 0) / 2) - (this.posX + this.size.width / 2),
                (obj.posY + (obj.size?.height || 0) / 2) - (this.posY + this.size.height / 2)
            );

            if (distance < bestDistance) {
                best = obj;
                bestDistance = distance;
            }
        }

        return best;
    }

    getTargetRestPosition(flower) {
        if (!flower) return null;
        return {
            x: flower.posX + ((flower.size?.width || 0) - this.size.width) / 2,
            y: flower.posY + ((flower.size?.height || 0) - this.size.height) / 2
        };
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('butterfly', 'interactive');
        return element;
    }

    tickUpdate(tickDelta) {
        this.flutterSoundCooldown = Math.max(0, this.flutterSoundCooldown - tickDelta);
        const wasRestingOnTarget = this.isRestingOnTarget;

        super.tickUpdate(tickDelta);

        const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const soundManager = this.gameMap?.soundManager;
        if (!soundManager) {
            this.wasRestingOnTarget = this.isRestingOnTarget;
            return;
        }

        if (!wasRestingOnTarget && this.isRestingOnTarget) {
            soundManager.play('obj_butterfly_land', { volume: 0.5 });
        } else if (!this.isIdle && !this.isRestingOnTarget && currentSpeed > 0.18 && this.flutterSoundCooldown <= 0) {
            soundManager.play('obj_butterfly_flutter', {
                volume: Utility.clamp(0.38 + (currentSpeed / Math.max(this.speed, 0.01)) * 0.14, 0.36, 0.56)
            });
            this.flutterSoundCooldown = 520 + Math.random() * 420;
        }

        this.wasRestingOnTarget = this.isRestingOnTarget;
    }

    getSelectionDebugInfo() {
        const target = this.getRestingTargetPosition();
        const velocityMagnitude = Math.hypot(this.velocity.x, this.velocity.y);
        return [
            {
                label: 'Butterfly State',
                value: this.isRestingOnTarget ? 'resting' :
                    this.restingTarget ? 'seeking flower' :
                    this.isIdle ? 'idle' :
                    this.isHovering ? 'hovering' : 'moving'
            },
            {
                label: 'Velocity',
                value: `(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) @ ${velocityMagnitude.toFixed(2)}`
            },
            {
                label: 'Height',
                value: `${(this.posZ || 0).toFixed(1)}`
            },
            {
                label: 'Flower Target',
                value: target ? `(${target.x.toFixed(0)}, ${target.y.toFixed(0)})` : 'none'
            },
            {
                label: 'Blocked',
                value: `${this.blockedFrames} frames, reason: ${this.lastBlockedReason}`
            },
            {
                label: 'Cooldown',
                value: `${Math.ceil(this.seekCooldown)} ms`
            }
        ];
    }
}
