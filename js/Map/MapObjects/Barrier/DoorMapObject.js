class DoorMapObject extends OpenableMapObject {
    getApproachConfig() {
        return {
            allowedSides: 'any',
            gap: this.getConfig('interaction.approachGap'),
            align: 'center',
            alignTo: 'collider',
            myteAlignTo: 'collider'
        };
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.teleportTarget = options.teleportTarget || null;
        this.terrainType = this.isOpen ? 'door_open' : 'door_closed';
        this.pendingAutoClose = null;
        this.updateCollisionState();
    }

    getBaseCssClass() {
        return 'door';
    }

    getToggleEventName() {
        return 'door_state_changed';
    }

    emitToggleEvent(state) {
        if (!this.gameMap?.eventManager) return;
        this.gameMap.eventManager.emit(this.getToggleEventName(), {
            door: this,
            state,
            position: { x: this.posX, y: this.posY }
        });
    }

    updateGridTerrain() {
        if (!this.gameMap?.gridSystem) return;

        const gridSystem = this.gameMap.gridSystem;
        const gridPos = gridSystem.worldToGrid(this.posX, this.posY);
        gridSystem.updateCellTerrain(gridPos.x, gridPos.y, this.terrainType);

        if (this.collider &&
            (this.collider.width > gridSystem.config.cellSize ||
             this.collider.height > gridSystem.config.cellSize)) {
            const endPos = gridSystem.worldToGrid(
                this.posX + this.collider.width,
                this.posY + this.collider.height
            );

            for (let x = gridPos.x; x <= endPos.x; x++) {
                for (let y = gridPos.y; y <= endPos.y; y++) {
                    gridSystem.updateCellTerrain(x, y, this.terrainType);
                }
            }
        }

        if (gridSystem.pathfinder?.options?.debug) {
            setTimeout(() => {
                // Keep the active action's debug overlay in sync with the new door state
                // without temporarily replacing it with the mouse-preview path.
                this.gameMap?.parent?.activeMyte?.queue?.getCurrentAction?.()?.refreshDebugVisualization?.();
            }, 50);
        }
    }

    updateCollisionState() {
        this.terrainType = this.isOpen ? 'door_open' : 'door_closed';
        this.updateGridTerrain();
        super.updateCollisionState();
    }

    getDoorBounds() {
        return {
            left: this.posX + (this.collider?.offsetX || 0),
            top: this.posY + (this.collider?.offsetY || 0),
            width: this.collider?.width || this.size.width,
            height: this.collider?.height || this.size.height
        };
    }

    getDoorCenter() {
        const bounds = this.getDoorBounds();
        return {
            x: bounds.left + bounds.width / 2,
            y: bounds.top + bounds.height / 2
        };
    }

    isValueWithinDoorSpan(value, start, length, padding = 12) {
        return value >= (start - padding) && value <= (start + length + padding);
    }

    isEntityAlignedWithDoor(entity, axis, actorCenter, intent, padding = 12) {
        const bounds = this.getDoorBounds();

        if (axis === 'x') {
            const minY = Math.min(actorCenter.y, intent.y);
            const maxY = Math.max(actorCenter.y, intent.y);
            return !(
                maxY < (bounds.top - padding) ||
                minY > (bounds.top + bounds.height + padding)
            );
        }

        if (axis === 'y') {
            const minX = Math.min(actorCenter.x, intent.x);
            const maxX = Math.max(actorCenter.x, intent.x);
            return !(
                maxX < (bounds.left - padding) ||
                minX > (bounds.left + bounds.width + padding)
            );
        }

        return false;
    }

    // Checks whether the actor's final navigation destination is on the far side of the
    // door, relative to the direction of travel. Uses the motion vector (actorCenter →
    // intent) as the authority on traversal direction rather than checking which side of
    // the door bounds the actor is on.
    //
    // Why not "actor must be outside the door bounds"?
    // The actor's sprite center (posX + size/2) is used for actorCenter, but the collision
    // boundary that triggers tryOpenCollider is the entity's *collider* (usually at the
    // bottom of the sprite). When approaching from the south the myte's collider first
    // touches the door's bottom edge, but the sprite center is already inside the door's
    // bounding box — so the old actorAbove/actorBelow check evaluated false for both sides
    // and the S→N case always failed. The direction-based check below is immune to this.
    isIntentAcrossDoor(axis, actorCenter, intent, bounds, margin = 4) {
        if (axis === 'x') {
            if (intent.x >= actorCenter.x) {
                // Moving east — final destination must clear the door's east (right) edge
                return intent.x >= (bounds.left + bounds.width - margin);
            } else {
                // Moving west — final destination must clear the door's west (left) edge
                return intent.x <= (bounds.left + margin);
            }
        }

        if (axis === 'y') {
            if (intent.y < actorCenter.y) {
                // Moving north (S→N) — destination must clear the door's north (top) edge
                return intent.y <= (bounds.top + margin);
            } else {
                // Moving south (N→S) — destination must clear the door's south (bottom) edge
                return intent.y >= (bounds.top + bounds.height - margin);
            }
        }

        return false;
    }

    getEntityCenter(entity) {
        if (!entity) return null;
        return {
            x: entity.posX + ((entity.size?.width || 0) / 2),
            y: entity.posY + ((entity.size?.height || 0) / 2)
        };
    }

    getEntityIntentPoint(entity) {
        if (!entity) return null;

        // Prefer the action's final destination (set by GoToObjectAction / AStarMoveAction).
        // The current waypoint (targetX/Y) may still be on the approach side of the door
        // while the true goal is past it, which would cause a false crossesDoor=false.
        if (entity._movementDestination &&
            Number.isFinite(entity._movementDestination.x) &&
            Number.isFinite(entity._movementDestination.y)) {
            return { x: entity._movementDestination.x, y: entity._movementDestination.y };
        }

        if (Array.isArray(entity.currentPath) && Number.isFinite(entity.pathIndex) && entity.currentPath[entity.pathIndex]) {
            const next = entity.currentPath[entity.pathIndex];
            return {
                x: next.x + ((entity.size?.width || 0) / 2),
                y: next.y + ((entity.size?.height || 0) / 2)
            };
        }

        if (Number.isFinite(entity.targetX) && Number.isFinite(entity.targetY)) {
            return {
                x: entity.targetX + ((entity.size?.width || 0) / 2),
                y: entity.targetY + ((entity.size?.height || 0) / 2)
            };
        }

        return null;
    }

    // Returns true when the actor's collider is still on the approaching side of the door
    // and is moving toward it (not away or already through).
    // axis='y' moving south: collider top hasn't yet passed the door's bottom edge.
    // axis='y' moving north: collider bottom hasn't yet passed the door's top edge.
    // axis='x' moving east:  collider left  hasn't yet passed the door's right edge.
    // axis='x' moving west:  collider right hasn't yet passed the door's left edge.
    isActorMovingTowardDoor(axis, entity, actorCenter, intent, bounds) {
        const col     = entity?.collider || {};
        const cLeft   = entity.posX + (col.offsetX || 0);
        const cTop    = entity.posY + (col.offsetY || 0);
        const cRight  = cLeft  + (col.width  || entity.size?.width  || 0);
        const cBottom = cTop   + (col.height || entity.size?.height || 0);

        const motionX = intent.x - actorCenter.x;
        const motionY = intent.y - actorCenter.y;

        if (axis === 'x') {
            if (Math.abs(motionX) < 0.5) return false;
            if (motionX > 0) return cLeft  < bounds.left + bounds.width;
            return                        cRight > bounds.left;
        }

        if (axis === 'y') {
            if (Math.abs(motionY) < 0.5) return false;
            if (motionY > 0) return cTop    < bounds.top + bounds.height;
            return                   cBottom > bounds.top;
        }

        return false;
    }

    canAutoOpenFor(entity, axis) {
        const actorCenter = this.getEntityCenter(entity);
        const intent = this.getEntityIntentPoint(entity);
        const dbg = window._doorDebug;

        if (!actorCenter || !intent || !axis) {
            if (dbg) Utility.logDebug(`[canAutoOpenFor] FAIL: missing actorCenter=${!!actorCenter} intent=${!!intent} axis=${axis}`);
            return false;
        }

        if (dbg) {
            const b = this.getDoorBounds();
            Utility.logDebug(`[canAutoOpenFor] axis=${axis} facing=${this.facingDirection} actor=(${actorCenter.x.toFixed(1)},${actorCenter.y.toFixed(1)}) intent=(${intent.x.toFixed(1)},${intent.y.toFixed(1)}) door=[${b.left.toFixed(0)},${b.top.toFixed(0)} ${b.width}x${b.height}] dest=${JSON.stringify(entity._movementDestination)}`);
        }

        if (!this.isEntityAlignedWithDoor(entity, axis, actorCenter, intent)) {
            if (dbg) Utility.logDebug(`[canAutoOpenFor] FAIL: not aligned with door`);
            return false;
        }

        const bounds = this.getDoorBounds();

        if (!this.isActorMovingTowardDoor(axis, entity, actorCenter, intent, bounds)) {
            if (dbg) {
                const col = entity?.collider || {};
                const cTop    = entity.posY + (col.offsetY || 0);
                const cBottom = cTop + (col.height || entity.size?.height || 0);
                const cLeft   = entity.posX + (col.offsetX || 0);
                const cRight  = cLeft + (col.width || entity.size?.width || 0);
                Utility.logDebug(`[canAutoOpenFor] FAIL: not moving toward door on axis=${axis} cLeft=${cLeft.toFixed(1)} cRight=${cRight.toFixed(1)} cTop=${cTop.toFixed(1)} cBottom=${cBottom.toFixed(1)} motion=(${(intent.x-actorCenter.x).toFixed(1)},${(intent.y-actorCenter.y).toFixed(1)})`);
            }
            return false;
        }

        if (!this.isIntentAcrossDoor(axis, actorCenter, intent, bounds, 0)) {
            if (dbg) Utility.logDebug(`[canAutoOpenFor] FAIL: intent not across door actorCenter=(${actorCenter.x.toFixed(1)},${actorCenter.y.toFixed(1)}) intent=(${intent.x.toFixed(1)},${intent.y.toFixed(1)}) bounds=[${bounds.left},${bounds.top} ${bounds.width}x${bounds.height}]`);
            return false;
        }

        if (dbg) Utility.logDebug(`[canAutoOpenFor] PASS axis=${axis}`);
        return true;
    }

    isEntityInDoorway(entity, padding = 8) {
        if (!entity || entity === this || entity.active === false) return false;

        const entityCollider = entity.collider || {};
        const entityLeft = entity.posX + (entityCollider.offsetX || 0);
        const entityTop = entity.posY + (entityCollider.offsetY || 0);
        const entityRight = entityLeft + (entityCollider.width || entity.size?.width || 0);
        const entityBottom = entityTop + (entityCollider.height || entity.size?.height || 0);

        const bounds = this.getDoorBounds();
        const doorLeft = bounds.left - padding;
        const doorTop = bounds.top - padding;
        const doorRight = bounds.left + bounds.width + padding;
        const doorBottom = bounds.top + bounds.height + padding;

        return !(
            entityRight < doorLeft ||
            entityLeft > doorRight ||
            entityBottom < doorTop ||
            entityTop > doorBottom
        );
    }

    isDoorwayClear() {
        const myteInDoorway = this.mytes.some(myte => myte?.isActive && this.isEntityInDoorway(myte));
        if (myteInDoorway) return false;

        const objectInDoorway = (this.gameMap?.objects || []).some(obj =>
            obj &&
            obj !== this &&
            obj.active !== false &&
            obj.collider &&
            (obj.getConfig?.('physics.collision', false) ||
             obj.getConfig?.('physics.actorCollision', false)) &&
            this.isEntityInDoorway(obj)
        );

        return !objectInDoorway;
    }

    onOpened(context = {}) {
        const actorName = context?.actor?.constructor?.name;
        const openedAutomatically = context?.triggeredBy === 'auto';
        const shouldAutoClose = openedAutomatically && actorName && actorName !== 'Myte';

        this.pendingAutoClose = shouldAutoClose
            ? {
                delay: 900,
                elapsed: 0
            }
            : null;
    }

    onClosed() {
        this.pendingAutoClose = null;
    }

    open(context = {}) {
        return super.open(context);
    }

    close(context = {}) {
        if (!context.force && context.actor && this.isEntityInDoorway(context.actor, 16)) {
            return false;
        }
        if (!context.force && !this.isDoorwayClear()) return false;
        return super.close(context);
    }

    trySetOpenState(shouldOpen, context = {}) {
        return shouldOpen ? this.open(context) : this.close(context);
    }

    getAiAffordances() {
        // Doors are opened automatically by pathfinding when traversed; the AI should
        // never target a door as an explicit interact_object goal.
        return [];
    }

    press(parent) {
        const myte = this.activeMyte;
        if (!this.active || !myte || this.isAnimating) return false;

        this.selectInUi();

        const desiredState = this.isOpen ? 'closed' : 'open';
        const interact = () => {
            if (desiredState === 'closed' && this.isEntityInDoorway(myte, 16)) {
                return false;
            }
            this.trySetOpenState(desiredState === 'open', {
                triggeredBy: 'manual',
                actor: myte,
                parent
            });
        };

        if (this.isInInteractionRange(myte, this.getInteractionRadius())) {
            interact();
            return true;
        }

        if (myte?.queue) {
            myte.queue.add('go_to_object', {
                target: this,
                onComplete: interact,
                queueVerb: desiredState === 'open' ? 'Open Door' : 'Close Door',
                userInitiated: true
            });
            return true;
        }

        return false;
    }

    runDebugDirectInteraction(parent = this.container ?? this.parent) {
        if (!this.active || this.isAnimating) return false;
        this.selectInUi();
        return this.trySetOpenState(!this.isOpen, {
            triggeredBy: 'debug',
            parent
        });
    }

    handleDoubleClick(event) {
        if (this.activeMyte) {
            super.handleDoubleClick(event);
            return;
        }

        if (!this.active || this.isAnimating) return;
        this.selectInUi();
        this.trySetOpenState(!this.isOpen, {
            triggeredBy: 'user',
            parent: this.container ?? this.parent
        });
    }

    teleportMyte(myte) {
        if (!this.teleportTarget || !this.isOpen) return;

        const entityCapabilities = {
            canOpenDoors: myte.canOpenDoors || false,
            canSwim: myte.canSwim || false,
            followsPaths: myte.followsPaths !== false
        };

        if (typeof this.teleportTarget === 'string') {
            this.gameMap?.transitionToMap(this.teleportTarget);
        } else if (typeof this.teleportTarget === 'object' && this.teleportTarget.x && this.teleportTarget.y) {
            myte.setPosition(this.teleportTarget.x, this.teleportTarget.y);
            myte.queue.addExpression('teleport');

            if (myte.ai && typeof myte.ai.resetPath === 'function') {
                setTimeout(() => {
                    myte.ai.resetPath(entityCapabilities);
                }, 100);
            }
        }
    }

    checkMytePassThrough(myte) {
        if (!this.isOpen) return;

        const dx = myte.posX - (this.posX + this.collider.offsetX);
        const dy = myte.posY - (this.posY + this.collider.offsetY);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 50) {
            this.teleportMyte(myte);
        }
    }

    update(deltaTime) {
        super.update(deltaTime);

        if (this.pendingAutoClose && this.isOpen && !this.isAnimating) {
            this.pendingAutoClose.elapsed += deltaTime;
            if (this.pendingAutoClose.elapsed >= this.pendingAutoClose.delay && this.isDoorwayClear()) {
                this.close({
                    triggeredBy: 'auto-close',
                    force: false
                });
            }
        }

        if (this.isOpen && this.teleportTarget) {
            this.mytes.forEach(myte => {
                if (myte.isActive) {
                    this.checkMytePassThrough(myte);
                }
            });
        }
    }
}
