class ParticleRendererPool {
    constructor() {
        this.pool = [];
    }

    createView() {
        const element = document.createElement('div');
        element.className = 'particle';
        element.style.position = 'absolute';
        element.style.left = '0';
        element.style.top = '0';
        element.style.pointerEvents = 'none';
        element.style.transformOrigin = 'center center';
        element.style.willChange = 'transform, opacity';
        element.style.backgroundRepeat = 'no-repeat';

        return {
            element,
            layerKey: '',
            last: {
                transform: '',
                opacity: '',
                width: '',
                height: '',
                backgroundImage: '',
                backgroundPosition: '',
                backgroundSize: '',
                backgroundColor: '',
                borderRadius: '',
                zIndex: '',
                visibility: '',
                display: '',
                mixBlendMode: '',
                className: ''
            }
        };
    }

    acquire() {
        return this.pool.pop() || this.createView();
    }

    release(view) {
        if (!view) return;
        view.layerKey = '';
        view.element.remove();
        // Keep the cache aligned with the element's retained inline styles.
        // On reuse, flushParticle can then clear properties from the previous
        // render type (such as a generic particle's circular background).
        this.pool.push(view);
    }

    clear() {
        this.pool.forEach(view => view.element.remove());
        this.pool = [];
    }
}
