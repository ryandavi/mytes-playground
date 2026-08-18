// Show affection toward another Myte (one-sided emote, no sync needed)
class ShowAffectionAction extends MyteAction {
    static metadata = { id: 'show_affection' };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...ShowAffectionAction.metadata.defaultOptions, duration: ShowAffectionAction.metadata.defaultDuration, ...options });
    }

    start() {
        super.start();
        this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
    }

    update(deltaTime = 0) {
        this.currentDuration -= deltaTime;
        return this.currentDuration <= 0;
    }
}

class PairedSocialAction extends PositionableAction {
    static receiverActionId = null;

    static canPerform(selected, active) {
        return selected instanceof Myte && selected !== active &&
            !active?.queue?.isCarrying?.() && !selected.queue?.isCarrying?.() &&
            !selected.queue?.isBeingCarried?.() && (selected.queue?.count?.() ?? 0) === 0;
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options = {}) {
        super(myte, { ...options, duration: options.duration ?? this.constructor.metadata.defaultDuration });
        this.sync = options.sync ?? new ActionSync();
        this.partnerSide = options.partnerSide ?? null;
        this.phase = 'approach';
        this._signalled = false;
        this._refused = false;
    }

    start() {
        super.start();
        if (!(this.target instanceof Myte)) {
            this._refuse();
            return;
        }

        if (!this.partnerSide && !this.constructor.isReceiver && !PairedSocialAction.canPerform(this.target, this.myte)) {
            this._refuse();
            return;
        }

        this.partnerSide ??= this._resolveApproachSide();
        this._setApproachTarget();

        if (!this.constructor.isReceiver) {
            this.target.queue.addToFront(this.constructor.receiverActionId, {
                target: this.myte,
                sync: this.sync,
                partnerSide: this._oppositeSide(this.partnerSide),
                expressionType: this.expressionType,
                expressionDuration: this.expressionDuration,
                expressionRepeat: this.expressionRepeat,
                duration: this.duration
            });
        }
    }

    _refuse() {
        this._refused = true;
        this._interrupted = true;
        this.myte.queue.addExpression('cry', 400, 1);
    }

    _resolveApproachSide() {
        const targetRect = this.getTargetRect(this.target, 'interaction');
        const myteRect = this.myte.getRect();
        return this.getClosestSideHorizontal(targetRect, myteRect) ?? 'left';
    }

    _oppositeSide(side) {
        return ({ left: 'right', right: 'left', top: 'bottom', bottom: 'top' })[side] ?? 'right';
    }

    _setApproachTarget() {
        const targetRect = this.getTargetRect(this.target, 'interaction');
        const myteRect = this.myte.getRect();
        if (!targetRect || !myteRect) return;
        const point = this.calculatePosition(myteRect, targetRect, this.partnerSide, {
            gap: this.socialGap ?? 8,
            align: 'center'
        });
        this.myte.setTarget(point.x, point.y);
    }

    _faceTarget() {
        const dx = this.target.posX - this.myte.posX;
        const dy = this.target.posY - this.myte.posY;
        this.myte.setDirection(Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? DIRECTION.EAST : DIRECTION.WEST)
            : (dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH));
    }

    _signalReady() {
        if (this._signalled) return;
        this._signalled = true;
        this._faceTarget();
        this.sync.signal(this);
        this.sync.onReady(() => {
            this.phase = 'perform';
            this.currentDuration = this.duration;
            this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
        });
    }

    update(deltaTime = 0) {
        if (this._refused || !this.target?.isActive) return true;
        if (this.phase === 'approach') {
            if (!this.myte.isAtTarget()) {
                this.myte.moveTowardsTarget();
                return false;
            }
            this._signalReady();
            return false;
        }
        if (this.phase !== 'perform') return false;
        this.currentDuration -= deltaTime;
        return this.currentDuration <= 0;
    }
}

class PairedSocialReceiveAction extends PairedSocialAction {
    static isReceiver = true;
    static canPerform() { return false; }
}

class GreetAction extends PairedSocialAction {
    static metadata = { id: 'greet' };
    static receiverActionId = 'greet_receive';
}

class GreetReceiveAction extends PairedSocialReceiveAction {
    static metadata = { id: 'greet_receive', hideFromQueue: true };
}

class KissAction extends PairedSocialAction {
    static metadata = { id: 'kiss' };
    static receiverActionId = 'kiss_receive';
}

class KissReceiveAction extends PairedSocialReceiveAction {
    static metadata = { id: 'kiss_receive', hideFromQueue: true };
}

class HighFiveAction extends PairedSocialAction {
    static metadata = { id: 'high_five' };
    static receiverActionId = 'high_five_receive';
}

class HighFiveReceiveAction extends PairedSocialReceiveAction {
    static metadata = { id: 'high_five_receive', hideFromQueue: true };
}

// Stand near another Myte and loosely follow their position.
class WatchAction extends PositionableAction {
    static metadata = { id: 'watch' };

    static canPerform(selected, active) {
        return selected instanceof Myte && selected !== active && !active?.queue.isCarrying();
    }

    static getRequiredOptions(selected, active) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...WatchAction.metadata.defaultOptions, duration: WatchAction.metadata.defaultDuration, ...options });
    }

    start() {
        super.start();
    }

    update(deltaTime = 0) {
        if (!this.target) return true;

        const targetRect = this.getTargetRect(this.target, 'interaction');
        const myteRect = this.myte.getRect();
        const horizontal = this.getClosestSideHorizontal(targetRect, myteRect);
        const watchPos = this.calculatePosition(myteRect, targetRect, horizontal, { gap: -5, align: 'bottom-edge' });

        this.myte.setTarget(watchPos.x, watchPos.y);
        this.myte.moveTowardsTarget();

        this.currentDuration -= deltaTime;
        return this.currentDuration <= 0;
    }
}

// Play tag - chaser/runner role switches on catch.
class PlayTagAction extends PositionableAction {
    static metadata = { id: 'play_tag' };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               !active?.queue.isCarrying();
    }

    constructor(myte, options) {
        super(myte, { ...PlayTagAction.metadata.defaultOptions, duration: PlayTagAction.metadata.defaultDuration, ...options });
    }

    update(deltaTime = 0) {
        const target = this.target;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.hypot(dx, dy);

        if (this.isIt) {
            this.myte.setTarget(target.posX, target.posY);
            this.myte.moveTowardsTarget();

            if (distance < this.catchDistance) {
                this.isIt = false;
                target.queue.add('play_tag', {
                    target: this.myte,
                    isIt: true,
                    duration: this.currentDuration
                });
                return true;
            }
        } else {
            const angle = Math.atan2(dy, dx) + Math.PI;
            this.myte.setTarget(
                this.myte.posX + Math.cos(angle) * this.runDistance,
                this.myte.posY + Math.sin(angle) * this.runDistance
            );
            this.myte.moveTowardsTarget();
        }

        this.currentDuration -= deltaTime;
        return this.currentDuration <= 0;
    }
}

// Chase another Myte — move toward them at speed; complete when close enough
class ChaseAction extends PositionableAction {
    static metadata = { id: 'chase' };

    static canPerform(selected, active) {
        return selected instanceof Myte && selected !== active && !active?.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    constructor(myte, options) {
        super(myte, { ...ChaseAction.metadata.defaultOptions, duration: ChaseAction.metadata.defaultDuration, ...options });
    }

    update(deltaTime = 0) {
        if (!this.target) return true;

        const dist = Math.hypot(this.target.posX - this.myte.posX, this.target.posY - this.myte.posY);

        if (dist < this.catchDistance) {
            this.myte.queue.addExpression('excited', 400, 2);
            return true;
        }

        this.myte.setTarget(this.target.posX, this.target.posY);
        this.myte.moveTowardsTarget();
        this.currentDuration -= deltaTime;
        return this.currentDuration <= 0;
    }
}

// Approach any target and show an expression on arrival
class EmoteAtAction extends GoToObjectAction {
    static metadata = { id: 'emote_at' };

    static canPerform(selected, active) {
        return active && selected instanceof Myte && selected !== active && !active?.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    complete() {
        this.faceTarget();
        super.complete();
        this.myte.queue.addExpression(this.expressionType, this.expressionDuration, this.expressionRepeat);
        this.myte.queue.addIdle(600);
    }
}

// Approach another Myte and transfer the held item to them
class GiveItemAction extends GoToObjectAction {
    static metadata = { id: 'give_item' };

    static canPerform(selected, active) {
        return selected instanceof Myte &&
               selected !== active &&
               active?.queue?.isCarryingItem?.();
    }

    static getRequiredOptions(selected) {
        return { target: selected };
    }

    complete() {
        this.faceTarget();
        super.complete();
        const item = this.myte.queue.getHeldItem?.();
        if (!item || item.carrier !== this.myte) return;

        // Drop item at the recipient's feet and let them pick it up
        item.drop?.(0, 0);
        item.setPosition?.(this.target.posX, this.target.posY);
        item.setSpritePosition?.(this.target.posX, this.target.posY);
        this.target.queue.add('pickup_item', { target: item });
        this.myte.queue.addExpression('heart', 300, 1);
    }
}

const FetchStates = {
    PICKUP: 'pickup',
    THROW: 'throw',
    CHASE: 'chase',
    RETURN: 'return'
};

// Play fetch with a throwable object.
class PlayFetchAction extends MyteAction {
    static metadata = { id: 'play_fetch' };

    static canPerform(selected, active) {
        return active &&
               selected instanceof MapObject &&
               selected.type?.toUpperCase?.() === 'BALL' &&
               !active.queue.isCarrying();
    }

    static getRequiredOptions(selected) {
        return { target: selected, throwable: selected };
    }

    constructor(myte, options) {
        super(myte, { ...PlayFetchAction.metadata.defaultOptions, ...options });
        this.throwPosition = null;
        this.throwTarget = null;
        this.throwProgress = 0;
        this.completedTrips = 0;
        // Fetch walks the map like any other errand: a chest between the myte
        // and the ball has to be walked around, not into. Raw steering could
        // only push into it, so every leg drives a nested A* move instead.
        this.moveAction = null;
        this._moveDestination = null;
    }

    start() {
        super.start();
        this.myte.queue.addExpression(this.expressionType, this.expressionDuration);
    }

    update() {
        switch (this.fetchState) {
            case FetchStates.PICKUP: return this._handlePickup();
            case FetchStates.THROW: return this._handleThrow();
            case FetchStates.CHASE: return this._handleChase();
            case FetchStates.RETURN: return this._handleReturn();
            default: return true;
        }
    }

    interrupt() {
        super.interrupt();
        this._stopMoving();
    }

    complete() {
        this._stopMoving();
        return super.complete();
    }

    cancel() {
        this._stopMoving();
        super.cancel?.();
    }

    // ── Pathed movement ──────────────────────────────────────────────────────

    _stopMoving() {
        this.moveAction?.cancel?.();
        this.moveAction = null;
        this._moveDestination = null;
    }

    // Drives a nested A* move towards (x, y), replanning when the destination
    // drifts (the ball rolls, the myte is carried elsewhere). Returns true once
    // the path is exhausted — arrived, or as close as the map allows.
    _moveTowards(x, y, replanDistance = 24) {
        const drifted = this._moveDestination &&
            Math.hypot(this._moveDestination.x - x, this._moveDestination.y - y) > replanDistance;

        if (!this.moveAction || drifted) {
            this.moveAction?.cancel?.();
            this.moveAction = new AStarMoveAction(this.myte, {
                target: { x, y },
                pathfindingOptions: { exactEndMode: 'if-reachable' }
            });
            this.moveAction.start();
            this._moveDestination = { x, y };
        }

        if (this.moveAction.update()) {
            this.moveAction = null;
            this._moveDestination = null;
            return true;
        }

        return false;
    }

    // Picks a throw destination the myte can actually run to. A random point can
    // land inside a wall or on the far side of one, which used to strand the
    // ball; candidates are tested against the pathfinder and the throw shortens
    // until one lands somewhere reachable.
    _pickThrowTarget(from) {
        const pathfinder = this.myte?.pathfinder;
        const attempts = 8;

        for (let attempt = 0; attempt < attempts; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            // Later attempts throw shorter, so a myte boxed into a small room
            // still finds somewhere to put the ball.
            const reach = this.maxThrowDistance * (1 - (attempt / attempts));
            const candidate = {
                x: from.x + Math.cos(angle) * reach,
                y: from.y + Math.sin(angle) * reach
            };

            if (!pathfinder) return candidate;

            const path = pathfinder.findPath(
                this.myte, from.x, from.y, candidate.x, candidate.y,
                { ...this.myte.pathfindingOptions, exactEndMode: 'if-reachable' }
            );
            if (!path?.length) continue;

            const end = path[path.length - 1];
            if (Math.hypot(end.x - candidate.x, end.y - candidate.y) <= this.catchDistance * 2) {
                return candidate;
            }
        }

        // Nothing reachable — drop the ball where the myte is standing rather
        // than throwing it somewhere it can never be retrieved from.
        return { x: from.x, y: from.y };
    }

    _handlePickup() {
        if (!this.throwable) return true;

        const dx = this.throwable.posX - this.myte.posX;
        const dy = this.throwable.posY - this.myte.posY;

        if (Math.hypot(dx, dy) > this.pickupDistance) {
            // Path exhausted without reaching the ball means it is walled off;
            // ending the action lets the queue move on instead of shoving.
            if (this._moveTowards(this.throwable.posX, this.throwable.posY, this.pickupDistance)) {
                return Math.hypot(
                    this.throwable.posX - this.myte.posX,
                    this.throwable.posY - this.myte.posY
                ) > this.pickupDistance;
            }
            return false;
        }

        this._stopMoving();
        this.throwPosition = { x: this.myte.posX, y: this.myte.posY };
        this.throwTarget = this._pickThrowTarget(this.throwPosition);
        this.throwProgress = 0;
        this.fetchState = FetchStates.THROW;
        return false;
    }

    _handleThrow() {
        this.throwProgress += this.throwStrength / 100;

        if (this.throwProgress >= 1) {
            this.fetchState = FetchStates.CHASE;
            return false;
        }

        const t = this.throwProgress;
        const x = this.throwPosition.x + (this.throwTarget.x - this.throwPosition.x) * t;
        const y = this.throwPosition.y + (this.throwTarget.y - this.throwPosition.y) * t
                - Math.sin(t * Math.PI) * this.arcHeight;

        if (this.throwable) {
            this.throwable.setPosition(x, y);
            this.throwable.setSpritePosition(x, y);
        }

        return false;
    }

    _handleChase() {
        if (!this.throwable) return true;

        const arrived = this._moveTowards(this.throwTarget.x, this.throwTarget.y, this.catchDistance);
        const reached = Math.hypot(
            this.myte.posX - this.throwTarget.x,
            this.myte.posY - this.throwTarget.y
        ) < this.catchDistance;

        if (reached || arrived) {
            this._stopMoving();
            this.myte.queue.addExpression('excited', 500);
            this.fetchState = FetchStates.RETURN;
        }

        return false;
    }

    _handleReturn() {
        const arrived = this._moveTowards(this.throwPosition.x, this.throwPosition.y, this.catchDistance);

        if (this.throwable) {
            this.throwable.setPosition(this.myte.posX, this.myte.posY - 20);
            this.throwable.setSpritePosition(this.myte.posX, this.myte.posY - 20);
        }

        if (arrived || this.myte.isAtTarget()) {
            this._stopMoving();
            this.completedTrips++;

            if (this.throwable) {
                this.throwable.setPosition(this.throwPosition.x, this.throwPosition.y);
                this.throwable.setSpritePosition(this.throwPosition.x, this.throwPosition.y);
            }

            if (this.completedTrips >= this.roundTrips) {
                return true;
            }

            this.throwProgress = 0;
            this.throwTarget = this._pickThrowTarget(this.throwPosition);
            this.fetchState = FetchStates.THROW;
        }

        return false;
    }
}
