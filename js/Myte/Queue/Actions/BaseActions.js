// Coordinates two actions so they can wait for each other before proceeding.
// Both action instances call sync.signal(this); both will be notified via onReady().
class ActionSync {
    constructor() {
        this._ready = new Set();
        this._callbacks = [];
    }

    signal(actionInstance) {
        this._ready.add(actionInstance);
        if (this._ready.size >= 2) {
            this._callbacks.forEach(cb => cb());
            this._callbacks = [];
        }
    }

    onReady(cb) {
        if (this._ready.size >= 2) {
            cb();
        } else {
            this._callbacks.push(cb);
        }
    }

    reset() {
        this._ready.clear();
    }

    get bothReady() {
        return this._ready.size >= 2;
    }
}

// Base class for all Myte actions
class MyteAction {
    static metadata = {
        id: null,
        label: null,
        category: 'default',
        priority: 0,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 0,
        description: null,
        requiresTarget: false,
        affectsMood: false,
        moodEffect: 0
    };

    constructor(myte, options = {}) {
        this.myte = myte;
        this.duration = 0;
        this.current_duration = -1;
        this.total_time = 0;
        this.userInitiated = false;
        this.onComplete = null;

        Object.assign(this, options, {
            duration: options.duration ?? this.constructor.metadata.defaultDuration,
        });
    }

    static getRequiredOptions(selected, active) {
        return {};
    }

    static canAddToQueue(selected, active) {
        return true;
    }

    static canPerform(selected, active) {
        return false;
    }

    start() {
        if (this.duration > 0 && this.current_duration === -1) {
            this.current_duration = this.duration;
        }
    }

    update() {
        return true;
    }

    complete() {
        if (this.onComplete !== null) {
            this.onComplete();
        }
        return true;
    }

    interrupt() {}
}

// Base class for actions that need to position the Myte relative to a target
class PositionableAction extends MyteAction {
    static metadata = {
        id: 'positionable',
        label: 'Position',
        category: 'movement',
        priority: 1,
        isMovementAction: true,
        isInterruptible: true,
        defaultDuration: 0,
        description: 'Base class for position-based actions',
        requiresTarget: true,
        affectsMood: false
    };

    constructor(myte, options) {
        super(myte, options);

        if (this.constructor.metadata.requiresTarget && !options.target) {
            throw new Error(`${this.constructor.name} requires a target`);
        }
    }

    static canPerform(selected, active) {
        return false;
    }

    getCanvasBounds() {
        const r = this.myte.parent.getCanvasRect();
        return { x: 0, y: 0, width: r.width, height: r.height };
    }

    // Get the target's rect. alignTo='collider' uses physics bounds when available,
    // falling back to sprite bounds. This lets the Myte stop at the right place even
    // when the sprite has visual padding beyond the interactive area.
    getTargetRect(target, alignTo = 'sprite') {
        if (target instanceof Myte) return target.getOffsetRect();

        if (alignTo === 'collider' && target?.collider && target.posX !== undefined) {
            return {
                x:      target.posX + (target.collider.offsetX ?? 0),
                y:      target.posY + (target.collider.offsetY ?? 0),
                width:  target.collider.width,
                height: target.collider.height
            };
        }

        return this.myte.parent.getLocalOffset(target.element ?? target);
    }

    // Backward-compatible alias — always uses sprite rect
    getRect(target) {
        return this.getTargetRect(target, 'sprite');
    }

    /**
     * Returns the {x, y} top-left position for the Myte to stand at beside destRect.
     *
     * @param {object} myteRect         — Myte's bounding rect
     * @param {object} destRect         — Target's bounding rect
     * @param {string} side             — Which side to stand on:
     *                                    'left' | 'right' | 'top' | 'bottom' | 'center'
     * @param {object} [opts]
     * @param {number} [opts.gap=0]     — Distance from the target edge.
     *                                    Positive = clear space, negative = overlap.
     * @param {string} [opts.align]     — Cross-axis alignment (default 'center').
     *                                    For left/right sides: 'top-edge' | 'center' | 'bottom-edge'
     *                                    For top/bottom sides: 'left-edge' | 'center' | 'right-edge'
     */
    calculatePosition(myteRect, destRect, side, { gap = 0, align = 'center' } = {}) {
        switch (side) {
            case 'left':
                return { x: destRect.x - myteRect.width - gap,       y: this._crossY(myteRect, destRect, align) };
            case 'right':
                return { x: destRect.x + destRect.width + gap,        y: this._crossY(myteRect, destRect, align) };
            case 'top':
                return { x: this._crossX(myteRect, destRect, align),  y: destRect.y - myteRect.height - gap };
            case 'bottom':
                return { x: this._crossX(myteRect, destRect, align),  y: destRect.y + destRect.height + gap };
            case 'center':
            default:
                return {
                    x: destRect.x + (destRect.width  - myteRect.width)  / 2,
                    y: destRect.y + (destRect.height - myteRect.height) / 2
                };
        }
    }

    _crossY(myteRect, destRect, align) {
        switch (align) {
            case 'top-edge':    return destRect.y;
            case 'bottom-edge': return destRect.y + destRect.height - myteRect.height;
            default:            return destRect.y + (destRect.height - myteRect.height) / 2;
        }
    }

    _crossX(myteRect, destRect, align) {
        switch (align) {
            case 'left-edge':  return destRect.x;
            case 'right-edge': return destRect.x + destRect.width - myteRect.width;
            default:           return destRect.x + (destRect.width - myteRect.width) / 2;
        }
    }

    // Clamp a position so the Myte stays fully within canvas bounds
    adjustPositionToBounds(position, myteRect) {
        const b = this.getCanvasBounds();
        return {
            x: Math.max(b.x, Math.min(position.x, b.x + b.width  - myteRect.width)),
            y: Math.max(b.y, Math.min(position.y, b.y + b.height - myteRect.height))
        };
    }

    getClosestSideHorizontal(destRect, myteRect) {
        return this.myte.posX + myteRect.width / 2 < destRect.x + destRect.width / 2
            ? 'left' : 'right';
    }

    getClosestSideVertical(destRect, myteRect) {
        return this.myte.posY + myteRect.height / 2 < destRect.y + destRect.height / 2
            ? 'top' : 'bottom';
    }

    getOpposite(side) {
        return { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side] ?? null;
    }
}

// Pause in place for a fixed number of frames
class IdleAction extends MyteAction {
    static metadata = {
        id: 'idle',
        label: 'Idle',
        category: 'state',
        priority: 0,
        isMovementAction: false,
        isInterruptible: true,
        defaultDuration: 200,
        description: 'Stay in place for a moment',
        requiresTarget: false,
        affectsMood: false
    };

    static canPerform(selected, active) {
        return active && selected === active;
    }

    start() {
        super.start();
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }
    }

    update() {
        this.current_duration--;
        return this.current_duration <= 0;
    }
}

// Show an expression overlay (hearts, Zs, etc.)
class ExpressionAction extends MyteAction {
    static metadata = {
        id: 'expression',
        label: 'Express',
        category: 'state',
        priority: 2,
        isMovementAction: false,
        isInterruptible: false,
        defaultDuration: 50,
        description: 'Show an emotion or expression overlay',
        requiresTarget: false,
        affectsMood: true,
        moodEffect: 5
    };

    static canPerform(selected, active) {
        return active && selected === active;
    }

    constructor(myte, options) {
        super(myte, options);
        this.type = options.action_type;
        this.repeat = options.repeat || 1;
    }

    start() {
        super.start();
        if (this.current_duration === -1) {
            this.current_duration = this.duration;
        }
    }

    update() {
        this.current_duration--;

        if (this.current_duration <= 0) {
            this.repeat--;
            if (this.repeat <= 0) return true;
            this.current_duration = this.duration;
        }
        return false;
    }
}
