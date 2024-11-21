
class EventManager {
    constructor(core) {
        this.core = core;
        this.handlers = new Map();
        this.mousePosition = { x: 0, y: 0 };
        this.isMouseDown = false;
        this.lastActivityTime = Date.now();
        
        this.initGlobalEvents();
    }

    initGlobalEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mousePosition.x = e.clientX + window.scrollX;
            this.mousePosition.y = e.clientY + window.scrollY;
            this.lastActivityTime = Date.now();
            this.emit('mousemove', this.mousePosition);
        });

        window.addEventListener('mousedown', () => {
            this.isMouseDown = true;
            this.lastActivityTime = Date.now();
            this.emit('mousedown');
        });

        window.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            this.lastActivityTime = Date.now();
            this.emit('mouseup');
        });

        window.addEventListener('scroll', () => {
            this.lastActivityTime = Date.now();
            this.emit('scroll');
        });
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

    emit(event, data) {
        const handlers = this.handlers.get(event);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    isUserInactive() {
        return Date.now() - this.lastActivityTime > this.core.config.inactiveTimeout;
    }
}