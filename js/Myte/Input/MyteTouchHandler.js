
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
                // Picking up a myte always transfers control to it, regardless of
                // whether the drag came from auto-pickup or the explicit DRAG tool.
                if (!myte.isActiveMyte) {
                    myte.parent.setActiveMyte(myte);
                }

                this.dragStartedInFreeRoam = myte.goal === MOVE_TYPES.FREEROAM;
                myte.playSound('ui_pickup_item');
                myte.isDragging = true;
                this.dragStartPosition = { x: myte.posX, y: myte.posY };
                myte.parent.camera.beginTemporaryFollow(myte, CAMERA_FOLLOW_MODES.CHARACTER);
                myte.reset();
                myte.targetDot.classList.add('is-hidden');
                myte.duplicate.classList.add('is-dragging');
                myte.dropTarget.classList.add("is-droppable");

                // Mark portals as valid drop targets
                this._getPortalElements(myte).forEach(el => el.classList.add('is-droppable'));

                // Mark surface slot objects as potential drop targets
                this._hoveredSlotEntry = null;
                this._getSurfaceSlotEntries(myte).forEach(({ el }) => el?.classList.add('is-droppable'));
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
                    myte.dropTarget.classList.add("is-drag-over");
                } else {
                    myte.dropTarget.classList.remove("is-drag-over");
                }

                // Update portal drop targets
                this._getPortalElements(myte).forEach(el => {
                    const rect = myte.parent.getRect(el);
                    if (Utility.isCoordTouchingElement(position.x, position.y, rect)) {
                        el.classList.add('is-drag-over');
                    } else {
                        el.classList.remove('is-drag-over');
                    }
                });

                // Update surface slot hover with live validity feedback
                const hitSlotEntry = this._findNearestSlotAt(myte, newX, newY);
                const slotChanged = hitSlotEntry?.slot?.id !== this._hoveredSlotEntry?.slot?.id ||
                    hitSlotEntry?.obj !== this._hoveredSlotEntry?.obj;
                if (slotChanged) {
                    this._hoveredSlotEntry?.el?.classList.remove('is-drag-over', 'is-drop-rejected');
                    this._hoveredSlotEntry = hitSlotEntry;
                }
                if (this._hoveredSlotEntry) {
                    const valid = this._isSlotValid(this._hoveredSlotEntry, myte);
                    this._hoveredSlotEntry.el?.classList.toggle('is-drag-over', valid);
                    this._hoveredSlotEntry.el?.classList.toggle('is-drop-rejected', !valid);
                }
            },
            onDragEnd: () => {
                myte.queue.clear();
                myte.parent.camera.endTemporaryFollow(myte);
                if (myte.goal == MOVE_TYPES.GOHOME) {
                    myte.setMode(myte.previousGoal);
                }
                myte.isDragging = false;
                myte.duplicate.classList.remove('is-dragging');

                // Capture the hovered slot entry before cleanup
                const droppedSlotEntry = this._hoveredSlotEntry;
                this._hoveredSlotEntry = null;

                // Check if dropped on home target
                if (myte.dropTarget.classList.contains("is-drag-over")) {
                    myte.stop();
                }

                if (this.dragStartedInFreeRoam && myte.isActive && !myte.dropTarget.classList.contains("is-drag-over")) {
                    myte.setMode(MOVE_TYPES.FOLLOW);
                }

                // Check if dropped on a portal
                const droppedPortal = this._getPortals(myte).find(p => p.element?.classList.contains('is-drag-over'));
                if (droppedPortal && !myte.dropTarget.classList.contains("is-drag-over")) {
                    myte.playSound('ui_drop_item');
                    droppedPortal.beginTransition(myte);
                } else if (!myte.dropTarget.classList.contains("is-drag-over")) {
                    myte.playSound('ui_drop_item');
                    const safePosition = myte.parent?.gameMap?.gridSystem?.findNearestValidPositionForEntity(
                        myte,
                        myte.posX,
                        myte.posY,
                        10
                    ) ?? { x: myte.posX, y: myte.posY };

                    myte.setTarget(safePosition.x, safePosition.y, true);
                    myte.setPosition(safePosition.x, safePosition.y, true);
                    myte.setSpritePosition(safePosition.x, safePosition.y, true);
                    myte.physicsController?.reset?.();
                }

                // If dropped on a surface slot object or a general map object, queue the interaction
                if (!myte.dropTarget.classList.contains("is-drag-over") && !droppedPortal) {
                    const dropObj = droppedSlotEntry?.obj ?? this._findObjectAtMyte(myte);
                    if (dropObj) {
                        const isSurfaceSlotDrop = !!droppedSlotEntry;
                        const best = isSurfaceSlotDrop
                            ? { id: 'use_surface_slot' }
                            : dropObj.getBestInteractionAction?.(myte);
                        if (best) {
                            const actionOptions = ActionManager.getActionOptions(best.id, dropObj, myte);
                            if (actionOptions) {
                                myte.queue.interrupt(best.id, {
                                    ...actionOptions,
                                    userInitiated: true,
                                    immediate: isSurfaceSlotDrop,
                                    ...(isSurfaceSlotDrop ? {
                                        settleDuration: 1,
                                        slotId: droppedSlotEntry.slot.id
                                    } : {})
                                });
                            } else if (isSurfaceSlotDrop) {
                                // Can't use slot (occupied, etc.) — show rejection on slot element
                                this._rejectSlotDrop(droppedSlotEntry);
                            }
                        }
                    }
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('is-droppable', 'is-drag-over');
                this._getPortalElements(myte).forEach(el => el.classList.remove('is-droppable', 'is-drag-over'));
                this._getSurfaceSlotEntries(myte).forEach(({ el }) => el?.classList.remove('is-droppable', 'is-drag-over', 'is-drop-rejected'));
                myte.targetDot.classList.remove('is-hidden');
                myte.logVisualDebug('drag_end');

                // Reset auto-pickup flag
                this.autoPickup = false;
                this.dragStartPosition = null;
                this.dragStartedInFreeRoam = false;

                // If this was started via click handler auto-drag, let it handle mode switching back
                if (myte.inputHandler?.clickHandler?.isDragging) {
                    myte.inputHandler.clickHandler.isDragging = false;
                }
            }
        });

        this.myte = myte;
        this.autoPickup = false;
        this.dragStartPosition = null;
        this.dragStartedInFreeRoam = false;
        this._hoveredSlotEntry = null;
    }

    _rejectSlotDrop(entry) {
        if (!entry?.el) return;
        entry.el.classList.add('is-drop-rejected');
        setTimeout(() => entry.el?.classList.remove('is-drop-rejected'), 600);
    }

    _getSurfaceSlotEntries(myte) {
        const objects = myte.parent?.gameMap?.gridSystem?.activeObjects;
        if (!objects) return [];
        const entries = [];
        for (const obj of objects) {
            if (!(obj instanceof MapObject) || !obj.active || !obj.element) continue;
            if (!obj.getActionConfig?.('use_surface_slot')) continue;
            const slots = obj.getActionSlotDefinitions?.('use_surface_slot') ?? [];
            for (const slot of slots) {
                entries.push({ obj, slot, el: obj.slotElements?.get(slot.id) ?? null });
            }
        }
        return entries;
    }

    _isSlotValid(entry, myte) {
        const { obj, slot } = entry;
        if (!obj || !slot) return false;
        if (myte.queue.isCarrying?.()) return false;
        if (slot.id === 'default') {
            return !obj.isActionOccupied?.('use_surface_slot', myte);
        }
        return !obj.isActionSlotOccupied?.('use_surface_slot', slot.id, myte);
    }

    _findNearestSlotAt(myte, worldX, worldY) {
        const objects = myte.parent?.gameMap?.gridSystem?.activeObjects;
        if (!objects) return null;

        // Test using the myte's center point
        const mCX = worldX + (myte.size?.width  ?? 32) / 2;
        const mCY = worldY + (myte.size?.height ?? 32) / 2;

        for (const obj of objects) {
            if (!(obj instanceof MapObject) || !obj.active) continue;
            if (!obj.getActionConfig?.('use_surface_slot')) continue;
            if (!obj.slotElements?.size) continue;

            for (const [slotId, slotEl] of obj.slotElements) {
                const sLeft   = obj.posX + parseFloat(slotEl.style.left);
                const sTop    = obj.posY + parseFloat(slotEl.style.top);
                const sRight  = sLeft + parseFloat(slotEl.style.width);
                const sBottom = sTop  + parseFloat(slotEl.style.height);

                if (mCX >= sLeft && mCX <= sRight && mCY >= sTop && mCY <= sBottom) {
                    const slots = obj.getActionSlotDefinitions?.('use_surface_slot') ?? [];
                    const slot  = slots.find(s => s.id === slotId) ?? { id: slotId };
                    return { obj, slot, el: slotEl };
                }
            }
        }

        return null;
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
