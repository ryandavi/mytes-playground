
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



                myte.isDragging = true;
                myte.parent.camera.setMode(CAMERA_FOLLOW_MODES.CHARACTER);
                myte.reset();
                myte.targetDot.classList.add('hidden');
                myte.duplicate.classList.add('dragging');
                myte.dropTarget.classList.add("valid-drop-target");

                // Mark portals as valid drop targets
                this._getPortalElements(myte).forEach(el => el.classList.add('valid-drop-target'));
            },
            onDragUpdate: (position) => {
                const containerRect = myte.parent.getContainerRect();
                const newX = (position.x - myte.parent.camera.posX) - containerRect.left - (192/2);
                const newY = (position.y - myte.parent.camera.posY) - containerRect.top - (192/2);

                // Move myte
                myte.setTarget(newX, newY, myte.limitTocontainer);
                myte.setPosition(newX, newY, myte.limitTocontainer);
                myte.setSpritePosition(newX, newY, myte.limitTocontainer);

                // Update home drop target
                const dropTargetRect = myte.parent.getRect(myte.dropTarget);
                if (Utility.is_coord_touching_element(position.x, position.y, dropTargetRect)) {
                    myte.dropTarget.classList.add("on-target");
                } else {
                    myte.dropTarget.classList.remove("on-target");
                }

                // Update portal drop targets
                this._getPortalElements(myte).forEach(el => {
                    const rect = myte.parent.getRect(el);
                    if (Utility.is_coord_touching_element(position.x, position.y, rect)) {
                        el.classList.add('on-target');
                    } else {
                        el.classList.remove('on-target');
                    }
                });
            },
            onDragEnd: () => {
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
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('valid-drop-target', 'on-target');
                this._getPortalElements(myte).forEach(el => el.classList.remove('valid-drop-target', 'on-target'));
                myte.targetDot.classList.remove('hidden');

                // Reset auto-pickup flag
                this.autoPickup = false;

                // If this was started via click handler auto-drag, let it handle mode switching back
                if (myte.clickHandler?.isDragging) {
                    myte.clickHandler.isDragging = false;
                }
            }
        });

        this.myte = myte;
        // Add auto-pickup flag
        this.autoPickup = false;
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