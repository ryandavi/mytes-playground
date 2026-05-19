class DoorMapObject extends ToggleableDirectionalAnimatedMapObject {
    getApproachMode() {
        return 'front';
    }

    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.teleportTarget = options.teleportTarget || null;
        this.terrainType = this.isOpen ? 'door_open' : 'door_closed';
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

    teleportMyte(myte) {
        if (!this.teleportTarget || !this.isOpen) return;

        const entityCapabilities = {
            can_open_doors: myte.canOpenDoors || false,
            can_swim: myte.canSwim || false,
            follows_paths: myte.followsPaths !== false
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

        if (this.isOpen && this.teleportTarget) {
            this.mytes.forEach(myte => {
                if (myte.isActive) {
                    this.checkMytePassThrough(myte);
                }
            });
        }
    }
}
