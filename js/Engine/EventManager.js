
class EventManager {
    constructor(core) {
        this.core = core;
        this.handlers = new Map();
    }

    addHandler(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
    }

    removeHandler(event, handler) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    on(event, handler) {
        this.addHandler(event, handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        this.removeHandler(event, handler);
    }

    once(event, handler) {
        const wrapper = (data) => {
            handler(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }

    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`[EventManager] Handler failed for "${event}"`, error);
                }
            });
        }
    }

    dispose() {
        this.handlers.clear();
    }
}
