
class MyteTouchHandler extends DragHandler {
    constructor(myte) {
        super({
            element: myte.sprite,
            parent: myte,
            canDrag: () => {
                
                return (myte.parent.ui.isTool(UIToolModes.DRAG) && 
                       myte.isActive && 
                       myte.canDrag()) || 
                       (myte.inputHandler && myte.inputHandler.clickHandler && 
                        myte.inputHandler.clickHandler.isDragging);
            },
            
            onDragStart: () => {
                // Set this Myte as active if coming from auto-pickup
                if (this.autoPickup && !myte.isActiveMyte) {
                    myte.parent.setActiveMyte(myte);
                }

                myte.playSound('ui_pickup_item');
                myte.isDragging = true;
                this.dragStartPosition = { x: myte.posX, y: myte.posY };
                myte.parent.camera.setMode(CAMERA_FOLLOW_MODES.CHARACTER);
                myte.reset();
                myte.targetDot.classList.add('hidden');
                myte.duplicate.classList.add('dragging');
                myte.dropTarget.classList.add("valid-drop-target");

                // Mark portals as valid drop targets
                this._getPortalElements(myte).forEach(el => el.classList.add('valid-drop-target'));
            },
            onDragUpdate: (position) => {
                const world = myte.parent.inputHandler.screenToWorldCoordinates(position.x, position.y, {
                    element: myte
                });
                const newX = world.x;
                const newY = world.y;

                // Always limit to canvas during drag using collider bounds
                myte.setTarget(newX, newY, true);
                myte.setPosition(newX, newY, true);
                myte.setSpritePosition(newX, newY, true);

                // Update home drop target
                const dropTargetRect = myte.parent.getRect(myte.dropTarget);
                if (Utility.isCoordTouchingElement(position.x, position.y, dropTargetRect)) {
                    myte.dropTarget.classList.add("on-target");
                } else {
                    myte.dropTarget.classList.remove("on-target");
                }

                // Update portal drop targets
                this._getPortalElements(myte).forEach(el => {
                    const rect = myte.parent.getRect(el);
                    if (Utility.isCoordTouchingElement(position.x, position.y, rect)) {
                        el.classList.add('on-target');
                    } else {
                        el.classList.remove('on-target');
                    }
                });
            },
            onDragEnd: () => {
                myte.playSound('ui_drop_item');
                myte.queue.clear();
                myte.parent.camera.setToPreviousMode();
                if (myte.goal == MOVE_TYPES.GOHOME) {
                    myte.setMode(myte.previousGoal);
                }
                myte.isDragging = false;
                myte.duplicate.classList.remove('dragging');

                // Check if dropped on home target
                if (myte.dropTarget.classList.contains("on-target")) {
                    myte.stop();
                }

                // Check if dropped on a portal
                const droppedPortal = this._getPortals(myte).find(p => p.element?.classList.contains('on-target'));
                if (droppedPortal && !myte.dropTarget.classList.contains("on-target")) {
                    droppedPortal.beginTransition(myte);
                } else if (!myte.dropTarget.classList.contains("on-target")) {
                    const safePosition = myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity(
                        myte,
                        myte.posX,
                        myte.posY,
                        10
                    ) || this.dragStartPosition || { x: myte.posX, y: myte.posY };

                    myte.setTarget(safePosition.x, safePosition.y, true);
                    myte.setPosition(safePosition.x, safePosition.y, true);
                    myte.setSpritePosition(safePosition.x, safePosition.y, true);
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('valid-drop-target', 'on-target');
                this._getPortalElements(myte).forEach(el => el.classList.remove('valid-drop-target', 'on-target'));
                myte.targetDot.classList.remove('hidden');
                myte.logVisualDebug('drag_end');

                // Reset auto-pickup flag
                this.autoPickup = false;
                this.dragStartPosition = null;

                // If this was started via click handler auto-drag, let it handle mode switching back
                if (myte.inputHandler?.clickHandler?.isDragging) {
                    myte.inputHandler.clickHandler.isDragging = false;
                }
            }
        });

        this.myte = myte;
        // Add auto-pickup flag
        this.autoPickup = false;
        this.dragStartPosition = null;
    }

    _getPortals(myte) {
        return (myte.parent?.gameMap?.objects || []).filter(
            obj => obj instanceof PortalMapObject && obj.isActive && obj.element
        );
    }

    _getPortalElements(myte) {
        return this._getPortals(myte).map(p => p.element);
    }
}
