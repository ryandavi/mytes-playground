
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
            },
            onDragUpdate: (position) => {
                const containerRect = myte.parent.getContainerRect();
                const newX = (position.x - myte.parent.camera.posX) - containerRect.left - (192/2);
                const newY = (position.y - myte.parent.camera.posY) - containerRect.top - (192/2);

                // Move myte
                myte.setTarget(newX, newY, myte.limitTocontainer);
                myte.setPosition(newX, newY, myte.limitTocontainer);
                myte.setSpritePosition(newX, newY, myte.limitTocontainer);

                // Update drop target
                const dropTargetRect = myte.parent.getRect(myte.dropTarget);
                if (Utility.is_coord_touching_element(position.x, position.y, dropTargetRect)) {
                    myte.dropTarget.classList.add("on-target");
                } else {
                    myte.dropTarget.classList.remove("on-target");
                }
            },
            onDragEnd: () => {
                myte.queue.clear();
                myte.parent.camera.setToPreviousMode();
                if (myte.goal == MOVE_TYPES.GOHOME) {
                    myte.setMode(myte.previousGoal);
                }
                myte.isDragging = false;
                myte.duplicate.classList.remove('dragging');

                // Check if dropped on target
                if (myte.dropTarget.classList.contains("on-target")) {
                    myte.stop();
                }

                // Reset drop target states
                myte.dropTarget.classList.remove('valid-drop-target', 'on-target');
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
}