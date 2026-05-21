
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
                myte.parent.camera.beginTemporaryFollow(myte, CAMERA_FOLLOW_MODES.CHARACTER);
                myte.reset();
                myte.targetDot.classList.add('is-hidden');
                myte.duplicate.classList.add('is-dragging');
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
                myte.parent.camera.focusOn?.(myte);

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
                myte.queue.clear();
                myte.parent.camera.endTemporaryFollow(myte);
                if (myte.goal == MOVE_TYPES.GOHOME) {
                    myte.setMode(myte.previousGoal);
                }
                myte.isDragging = false;
                myte.duplicate.classList.remove('is-dragging');

                // Check if dropped on home target
                if (myte.dropTarget.classList.contains("on-target")) {
                    myte.stop();
                }

                // Check if dropped on a portal
                const droppedPortal = this._getPortals(myte).find(p => p.element?.classList.contains('on-target'));
                if (droppedPortal && !myte.dropTarget.classList.contains("on-target")) {
                    myte.playSound('ui_drop_item');
                    droppedPortal.beginTransition(myte);
                } else if (!myte.dropTarget.classList.contains("on-target")) {
                    myte.playSound('ui_drop_item');
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

                // If dropped on a normal map position, check for an underlying object to interact with
                if (!myte.dropTarget.classList.contains("on-target") && !droppedPortal) {
                    const dropObj = this._findObjectAtMyte(myte);
                    if (dropObj) {
                        const best = dropObj.getBestInteractionAction?.(myte);
                        if (best) {
                            const actionOptions = ActionManager.getActionOptions(best.id, dropObj, myte);
                            if (!actionOptions) {
                                return;
                            }

                            myte.queue.clear();
                            myte.queue.add(best.id, {
                                ...actionOptions,
                                userInitiated: true
                            });
                        }
                    }
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('valid-drop-target', 'on-target');
                this._getPortalElements(myte).forEach(el => el.classList.remove('valid-drop-target', 'on-target'));
                myte.targetDot.classList.remove('is-hidden');
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

    _findObjectAtMyte(myte) {
        const objects = myte.parent?.gameMap?.gridSystem?.activeObjects;
        if (!objects) return null;

        const ml = myte.posX + (myte.collider?.offsetX ?? 0);
        const mt = myte.posY + (myte.collider?.offsetY ?? 0);
        const mr = ml + (myte.collider?.width ?? myte.size.width);
        const mb = mt + (myte.collider?.height ?? myte.size.height);

        let best = null;
        let bestArea = 0;

        for (const obj of objects) {
            if (!(obj instanceof MapObject) || !obj.active) continue;
            const ol = obj.posX + (obj.collider?.offsetX ?? 0);
            const ot = obj.posY + (obj.collider?.offsetY ?? 0);
            const or_ = ol + (obj.collider?.width ?? obj.size.width);
            const ob = ot + (obj.collider?.height ?? obj.size.height);
            const area = Math.max(0, Math.min(mr, or_) - Math.max(ml, ol)) *
                         Math.max(0, Math.min(mb, ob) - Math.max(mt, ot));
            if (area > bestArea) { bestArea = area; best = obj; }
        }

        return best;
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
