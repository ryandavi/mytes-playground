class ParticleRenderer {
    static LAYER_Z_INDEX = Object.freeze({
        background: 0,
        ground: 5,
        default: 10,
        object: 15,
        overlay: 20,
        debug: 999
    });

    constructor(system, container = null) {
        this.system = system;
        this.container = container;
        this.layerContainers = new Map();
        this.viewPool = new ParticleRendererPool();
        this.viewsByParticleId = new Map();
        this.stats = {
            boundViews: 0,
            domWrites: 0
        };
    }

    setContainer(container) {
        if (container === this.container) return;

        this.container = container;
        this.layerContainers.forEach(layer => layer.remove());
        this.layerContainers.clear();

        this.viewsByParticleId.forEach(view => {
            view.layerKey = '';
            view.element.remove();
            view.last.layerKey = '';
        });
    }

    getLayerZIndex(layerKey) {
        return ParticleRenderer.LAYER_Z_INDEX[layerKey] ?? ParticleRenderer.LAYER_Z_INDEX.default;
    }

    ensureLayerContainer(layerKey = 'default') {
        if (!this.container) return null;

        const normalizedKey = layerKey || 'default';
        if (this.layerContainers.has(normalizedKey)) {
            return this.layerContainers.get(normalizedKey);
        }

        const layer = document.createElement('div');
        layer.className = `particle-layer particle-layer--${normalizedKey}`;
        layer.style.position = 'absolute';
        layer.style.left = '0';
        layer.style.top = '0';
        layer.style.width = '100%';
        layer.style.height = '100%';
        layer.style.pointerEvents = 'none';
        layer.style.overflow = 'visible';
        layer.style.zIndex = String(this.getLayerZIndex(normalizedKey));

        this.container.appendChild(layer);
        this.layerContainers.set(normalizedKey, layer);
        return layer;
    }

    bindParticle(particle) {
        if (!particle?.id) return null;

        let view = this.viewsByParticleId.get(particle.id);
        if (view) return view;

        view = this.viewPool.acquire();
        this.viewsByParticleId.set(particle.id, view);
        this.stats.boundViews = this.viewsByParticleId.size;
        return view;
    }

    releaseParticle(particle) {
        if (!particle?.id) return;

        const view = this.viewsByParticleId.get(particle.id);
        if (!view) return;

        this.viewsByParticleId.delete(particle.id);
        this.viewPool.release(view);
        this.stats.boundViews = this.viewsByParticleId.size;
    }

    flush(particles, alpha = 1, deltaTime = 0) {
        this.stats.domWrites = 0;
        let culled = 0;

        for (const particle of particles) {
            if (!particle?.active) continue;

            const view = this.bindParticle(particle);
            if (!view) continue;

            particle.updateVisual(deltaTime, alpha, this.system);
            this.flushParticle(particle, view);
            if (!particle.renderVisible) culled++;
        }

        return culled;
    }

    flushParticle(particle, view) {
        const layerKey = particle.renderLayer || 'default';
        const layer = this.ensureLayerContainer(layerKey);
        if (!layer) return;

        if (view.layerKey !== layerKey || view.element.parentNode !== layer) {
            layer.appendChild(view.element);
            view.layerKey = layerKey;
        }

        const style = view.element.style;
        const className = particle.renderClassName || 'particle';
        if (view.last.className !== className) {
            view.element.className = className;
            view.last.className = className;
        }

        const display = particle.renderVisible ? '' : 'none';
        if (view.last.display !== display) {
            style.display = display;
            view.last.display = display;
            this.stats.domWrites++;
        }

        if (!particle.renderVisible) return;

        const transform = [
            `translate3d(${(particle.renderX - (particle.renderWidth * 0.5)).toFixed(2)}px, ${(particle.renderY - (particle.renderHeight * 0.5)).toFixed(2)}px, 0)`,
            `rotate(${particle.renderRotation.toFixed(2)}deg)`,
            `scale(${particle.renderScaleX.toFixed(3)}, ${particle.renderScaleY.toFixed(3)})`
        ].join(' ');

        if (view.last.transform !== transform) {
            style.transform = transform;
            view.last.transform = transform;
            this.stats.domWrites++;
        }

        const opacity = `${ParticleMath.clamp(particle.renderOpacity, 0, 1)}`;
        if (view.last.opacity !== opacity) {
            style.opacity = opacity;
            view.last.opacity = opacity;
            this.stats.domWrites++;
        }

        const width = `${Math.max(0.1, particle.renderWidth).toFixed(2)}px`;
        if (view.last.width !== width) {
            style.width = width;
            view.last.width = width;
            this.stats.domWrites++;
        }

        const height = `${Math.max(0.1, particle.renderHeight).toFixed(2)}px`;
        if (view.last.height !== height) {
            style.height = height;
            view.last.height = height;
            this.stats.domWrites++;
        }

        const zIndex = String(Math.round(particle.renderZIndex));
        if (view.last.zIndex !== zIndex) {
            style.zIndex = zIndex;
            view.last.zIndex = zIndex;
            this.stats.domWrites++;
        }

        const visibility = particle.renderVisibility || '';
        if (view.last.visibility !== visibility) {
            style.visibility = visibility;
            view.last.visibility = visibility;
            this.stats.domWrites++;
        }

        const blendMode = particle.renderBlendMode || '';
        if (view.last.mixBlendMode !== blendMode) {
            style.mixBlendMode = blendMode;
            view.last.mixBlendMode = blendMode;
            this.stats.domWrites++;
        }

        if (particle.useSprite) {
            const backgroundImage = particle.spriteUrl ? `url(${particle.spriteUrl})` : '';
            if (view.last.backgroundImage !== backgroundImage) {
                style.backgroundImage = backgroundImage;
                view.last.backgroundImage = backgroundImage;
                this.stats.domWrites++;
            }

            const backgroundPosition = particle.renderBackgroundPosition || '';
            if (view.last.backgroundPosition !== backgroundPosition) {
                style.backgroundPosition = backgroundPosition;
                view.last.backgroundPosition = backgroundPosition;
                this.stats.domWrites++;
            }

            const backgroundSize = particle.renderBackgroundSize || 'contain';
            if (view.last.backgroundSize !== backgroundSize) {
                style.backgroundSize = backgroundSize;
                view.last.backgroundSize = backgroundSize;
                this.stats.domWrites++;
            }

            if (view.last.backgroundColor !== '') {
                style.backgroundColor = '';
                view.last.backgroundColor = '';
                this.stats.domWrites++;
            }

            if (view.last.borderRadius !== '') {
                style.borderRadius = '';
                view.last.borderRadius = '';
                this.stats.domWrites++;
            }
        } else {
            if (view.last.backgroundImage !== '') {
                style.backgroundImage = '';
                view.last.backgroundImage = '';
                this.stats.domWrites++;
            }

            if (view.last.backgroundPosition !== '') {
                style.backgroundPosition = '';
                view.last.backgroundPosition = '';
                this.stats.domWrites++;
            }

            if (view.last.backgroundSize !== '') {
                style.backgroundSize = '';
                view.last.backgroundSize = '';
                this.stats.domWrites++;
            }

            const backgroundColor = particle.renderColor || '';
            if (view.last.backgroundColor !== backgroundColor) {
                style.backgroundColor = backgroundColor;
                view.last.backgroundColor = backgroundColor;
                this.stats.domWrites++;
            }

            const borderRadius = particle.renderBorderRadius || '50%';
            if (view.last.borderRadius !== borderRadius) {
                style.borderRadius = borderRadius;
                view.last.borderRadius = borderRadius;
                this.stats.domWrites++;
            }
        }
    }

    dispose() {
        this.viewsByParticleId.forEach(view => this.viewPool.release(view));
        this.viewsByParticleId.clear();
        this.layerContainers.forEach(layer => layer.remove());
        this.layerContainers.clear();
        this.viewPool.clear();
    }
}
