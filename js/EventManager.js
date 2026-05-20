
class EventManager {
    constructor(core) {
        this.core = core;
        this.handlers = new Map();
        this.mousePosition = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.lastActivityTime = Date.now();
        this.boundHandlers = null;
        
        this.initGlobalEvents();
    }

    initGlobalEvents() {
        this.boundHandlers = {
            mousemove: (e) => {
                this.mousePosition.x = e.clientX + window.scrollX;
                this.mousePosition.y = e.clientY + window.scrollY;
                this.lastActivityTime = Date.now();
                this.emit('mousemove', this.mousePosition);
            },
            mousedown: () => {
                this.isMouseDown = true;
                this.lastActivityTime = Date.now();
                this.emit('mousedown');
            },
            mouseup: () => {
                this.isMouseDown = false;
                this.lastActivityTime = Date.now();
                this.emit('mouseup');
            },
            scroll: () => {
                this.lastActivityTime = Date.now();
                this.emit('scroll');
            }
        };

        window.addEventListener('mousemove', this.boundHandlers.mousemove);
        window.addEventListener('mousedown', this.boundHandlers.mousedown);
        window.addEventListener('mouseup', this.boundHandlers.mouseup);
        window.addEventListener('scroll', this.boundHandlers.scroll);
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
            handlers.forEach(handler => handler(data));
        }
    }

    isUserInactive() {
        return Date.now() - this.lastActivityTime > this.core.config.inactiveTimeout;
    }

    dispose() {
        if (this.boundHandlers) {
            window.removeEventListener('mousemove', this.boundHandlers.mousemove);
            window.removeEventListener('mousedown', this.boundHandlers.mousedown);
            window.removeEventListener('mouseup', this.boundHandlers.mouseup);
            window.removeEventListener('scroll', this.boundHandlers.scroll);
            this.boundHandlers = null;
        }

        this.handlers.clear();
    }
}
