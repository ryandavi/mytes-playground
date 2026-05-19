class DoorMapObject extends ToggleableDirectionalAnimatedMapObject {
    getApproachMode() {
        return 'front';
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

        if (gridSystem.pathfinder?.options?.debug && this.gameMap.testPathfinding) {
            setTimeout(() => {
                this.gameMap.testPathfinding();
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

    getEntityCenter(entity) {
        if (!entity) return null;
        return {
            x: entity.posX + ((entity.size?.width || 0) / 2),
            y: entity.posY + ((entity.size?.height || 0) / 2)
        };
    }

    getEntityIntentPoint(entity) {
        if (!entity) return null;

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

    canAutoOpenFor(entity, axis) {
        const actorCenter = this.getEntityCenter(entity);
        const intent = this.getEntityIntentPoint(entity);
        if (!actorCenter || !intent || !axis) return false;

        const doorCenter = this.getDoorCenter();
        const margin = 4;

        if (axis === 'x') {
            const actorSide = actorCenter.x < (doorCenter.x - margin) ? -1 : actorCenter.x > (doorCenter.x + margin) ? 1 : 0;
            const intentSide = intent.x < (doorCenter.x - margin) ? -1 : intent.x > (doorCenter.x + margin) ? 1 : 0;
            return actorSide !== 0 && intentSide !== 0 && actorSide !== intentSide;
        }

        if (axis === 'y') {
            const actorSide = actorCenter.y < (doorCenter.y - margin) ? -1 : actorCenter.y > (doorCenter.y + margin) ? 1 : 0;
            const intentSide = intent.y < (doorCenter.y - margin) ? -1 : intent.y > (doorCenter.y + margin) ? 1 : 0;
            return actorSide !== 0 && intentSide !== 0 && actorSide !== intentSide;
        }

        return false;
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
        if (!context.force && !this.isDoorwayClear()) return false;
        return super.close(context);
    }

    trySetOpenState(shouldOpen, context = {}) {
        return shouldOpen ? this.open(context) : this.close(context);
    }

    press(parent) {
        const myte = this.activeMyte;
        if (!this.active || !myte || this.isAnimating) return false;

        this.selectInUi();

        const desiredState = this.isOpen ? 'closed' : 'open';
        const interact = () => {
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
                onComplete: interact
            });
            return true;
        }

        return false;
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
