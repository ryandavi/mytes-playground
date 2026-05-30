const CARRY_OFFSET = 45;

// Pickup animation — lifts target Myte toward the carrier over a fixed duration
class CarryPickupAction extends MyteAction {
    static metadata = { id: 'carry_pickup' };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !selected.queue.isBeingCarried() &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        this.startPosition = { x: this.target.posX, y: this.target.posY };
    }

    update() {
        if (this.currentDuration === -1) {
            this.currentDuration = this.duration;
        }

        const progress      = 1 - (this.currentDuration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY - CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        this.target.setPosition(currentPos.x, currentPos.y);
        this.target.setSpritePosition(currentPos.x, currentPos.y);

        this.currentDuration--;

        if (this.currentDuration <= 0) {
            this.myte.queue.add('carry', { target: this.target, duration: -1 });
            this.target.queue.clear();
            this.target.queue.add('being_carried', { carrierMyte: this.myte, duration: -1 });
        }

        return this.currentDuration <= 0;
    }
}

// Carry — the carrier follows the mouse while keeping the target overhead
class CarryAction extends MyteAction {
    static metadata = { id: 'carry' };

    static canPerform(selected, active) {
        return active?.queue.isCarryingMyte?.();
    }

    update() {
        this.myte.updateTargetToFollowMouse();
        this.myte.moveTowardsTarget();

        this.target.setPosition(this.myte.posX, this.myte.posY - CARRY_OFFSET);
        this.target.setSpritePosition(this.myte.posX, this.myte.posY - CARRY_OFFSET);

        return false;
    }
}

// Being carried — passive state on the carried Myte
class BeingCarriedAction extends MyteAction {
    static metadata = { id: 'being_carried', hideFromQueue: true };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !selected.queue.isBeingCarried() &&
               !active?.queue.isCarrying();
    }

    update() {
        return false;
    }
}

// Putdown animation — lowers the carried Myte to the ground
class CarryPutdownAction extends MyteAction {
    static metadata = { id: 'carry_putdown' };

    static canPerform(selected, active) {
        return active?.queue.isCarryingMyte?.();
    }

    constructor(myte, options) {
        super(myte, options);
        this.startPosition = { x: this.target.posX, y: this.target.posY };
    }

    update() {
        if (this.currentDuration === -1) {
            this.currentDuration = this.duration;
        }

        const progress      = 1 - (this.currentDuration / this.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY + CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        this.target.setPosition(currentPos.x, currentPos.y);
        this.target.setSpritePosition(currentPos.x, currentPos.y);
        this.currentDuration--;

        if (this.currentDuration <= 0) {
            this.target.queue.clear();
        }

        return this.currentDuration <= 0;
    }
}

class PickupItemAction extends MyteAction {
    static metadata = { id: 'pickup_item' };

    static canPerform(selected, active) {
        return active &&
               selected instanceof MapObject &&
               selected.getConfig?.('canPickUp', false) &&
               !selected.isPickedUp &&
               !active.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, options);
        this.target = options.target ?? null;
        this.approachAction = null;
        this.maxReplans = 4;
        this.replanCount = 0;
        this.lastTargetPosition = null;
        this.lastReplanAt = 0;
        this.startedAt = 0;
        this.lastDistance = Infinity;
        this.lastProgressAt = 0;
        this.maxPickupDurationMs = 8000;
        this.maxStallDurationMs = 2000;
    }

    start() {
        super.start();
        this.startedAt = performance.now();
        this.lastProgressAt = this.startedAt;
        this.lastDistance = this._getDistanceToTarget();
        if (this.target) {
            this.target.pendingPickup = true;
            this.lastTargetPosition = { x: this.target.posX, y: this.target.posY };
        }
    }

    update() {
        if (!this.target?.active) return true;
        if (this.target.isPickedUp && this.target.carrier !== this.myte) return true;
        if (!this.target.canBePickedUpBy?.(this.myte)) {
            this.target.pendingPickup = false;
            return true;
        }

        const now = performance.now();
        const distance = this._getDistanceToTarget();
        if (distance + 4 < this.lastDistance) {
            this.lastDistance = distance;
            this.lastProgressAt = now;
        } else if (Number.isFinite(distance)) {
            this.lastDistance = Math.min(this.lastDistance, distance);
        }

        if (this.target.isInPickupRange?.(this.myte)) {
            this.target.pendingPickup = false;
            if (this.target.pickup?.(this.myte)) {
                this.myte.queue.add('hold_item', { target: this.target });
            }
            return true;
        }

        if (now - this.startedAt >= this.maxPickupDurationMs) {
            this.target.pendingPickup = false;
            return true;
        }

        if (now - this.lastProgressAt >= this.maxStallDurationMs) {
            if (this.replanCount >= this.maxReplans) {
                this.target.pendingPickup = false;
                return true;
            }
            this._createApproachAction();
            this.lastProgressAt = now;
        }

        if (!this.approachAction || this._shouldReplan()) {
            if (this.replanCount >= this.maxReplans) {
                this.target.pendingPickup = false;
                return true;
            }

            this._createApproachAction();
        }

        if (!this.approachAction) {
            this.target.pendingPickup = false;
            return true;
        }

        const approachComplete = this.approachAction.update();
        if (approachComplete && !this.target.isInPickupRange?.(this.myte)) {
            this._createApproachAction();
        }

        return false;
    }

    interrupt() {
        super.interrupt();
        if (this.target?.carrier !== this.myte) {
            this.target.pendingPickup = false;
        }
    }

    complete() {
        super.complete();
        if (this.target?.carrier !== this.myte) {
            this.target.pendingPickup = false;
        }
    }

    _createApproachAction() {
        this.approachAction = new GoToObjectAction(this.myte, {
            target: this.target,
            approachConfig: 'center'
        });
        this.approachAction.start();
        this.replanCount++;
        this.lastReplanAt = performance.now();
        this.lastTargetPosition = this.target ? { x: this.target.posX, y: this.target.posY } : null;
    }

    _shouldReplan() {
        if (!this.target || !this.lastTargetPosition) {
            return false;
        }

        const now = performance.now();
        if (now - this.lastReplanAt < 150) {
            return false;
        }

        const movedDistance = Math.hypot(
            this.target.posX - this.lastTargetPosition.x,
            this.target.posY - this.lastTargetPosition.y
        );

        return movedDistance >= 16;
    }

    _getDistanceToTarget() {
        if (!this.target) {
            return Infinity;
        }

        const targetCenter = this.target.getPickupTargetPoint?.(this.myte) ||
            this.target.getCenterPoint?.() || {
            x: this.target.posX + ((this.target.size?.width ?? 0) / 2),
            y: this.target.posY + ((this.target.size?.height ?? 0) / 2)
        };
        const myteCenter = this.myte.getCenterPoint?.('collider') || {
            x: this.myte.posX + (this.myte.collider?.offsetX ?? 0) + ((this.myte.collider?.width ?? this.myte.size.width) / 2),
            y: this.myte.posY + (this.myte.collider?.offsetY ?? 0) + ((this.myte.collider?.height ?? this.myte.size.height) / 2)
        };

        return Math.hypot(targetCenter.x - myteCenter.x, targetCenter.y - myteCenter.y);
    }
}

class HoldItemAction extends MyteAction {
    static metadata = { id: 'hold_item' };

    static canPerform() {
        return false;
    }

    constructor(myte, options) {
        super(myte, options);
        this.target = options.target ?? null;
    }

    start() {
        super.start();
        if (this.target && this.target.carrier !== this.myte && this.target.isInPickupRange?.(this.myte)) {
            this.target.pickup?.(this.myte);
        }
    }

    update() {
        if (!this.target || this.target.carrier !== this.myte) return true;
        this.myte.updateTargetToFollowMouse();
        this.myte.moveTowardsTarget();
        return false;
    }

    interrupt() {
        super.interrupt();
        this._dropItem();
    }

    complete() {
        super.complete();
        this._dropItem();
    }

    _dropItem() {
        if (!this.target || this.target.carrier !== this.myte) return;
        const dx = this.myte.targetX - this.myte.posX;
        const dy = this.myte.targetY - this.myte.posY;
        const dist = Math.hypot(dx, dy);
        const spd = 3;
        this.target.drop?.(
            dist > 1 ? (dx / dist) * spd : 0,
            dist > 1 ? (dy / dist) * spd : 0
        );
    }
}

class DropItemAction extends MyteAction {
    static metadata = { id: 'drop_item' };

    static canPerform(selected, active) {
        const heldItem = active?.queue?.getHeldItem?.() || null;
        return !!heldItem && (selected === active || selected === heldItem);
    }

    static getRequiredOptions(selected, active) {
        return { target: active?.queue?.getHeldItem?.() || null };
    }

    start() {
        super.start();
        if (!this.target || this.target.carrier !== this.myte) {
            return;
        }

        const dx = this.myte.targetX - this.myte.posX;
        const dy = this.myte.targetY - this.myte.posY;
        const dist = Math.hypot(dx, dy);
        const spd = 3;
        this.target.drop?.(
            dist > 1 ? (dx / dist) * spd : 0,
            dist > 1 ? (dy / dist) * spd : 0
        );
    }

    update() {
        return true;
    }
}
