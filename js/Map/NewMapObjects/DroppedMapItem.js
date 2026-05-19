
class BaseMapObject {

    constructor(parent, type, variant, posX, posY) {
        this.type = type;
        this.variant = variant;
        this.posX = posX;
        this.posY = posY;
        this.posZ = 0;

        this.size = {
            width: 24,
            height: 24
        };
    }
}

class DroppedMapItem {
    constructor(parent, type, variant, posX, posY) {
        if (posY === undefined) {
            posY = posX;
            posX = variant;
            variant = type;
            type = parent;
            parent = null;
        }

        // Store base identity properties
        this.parent = parent;
        this.type = type;
        this.variant = variant;
        this.posX = posX;
        this.posY = posY;
        this.posZ = 0;

		// Core state
		this.active = true;
		this.element = null;

        // physics
        this.velocityX = 0;
        this.velocityY = -5; // Initial upward velocity (negative is up)
        this.velocityZ = 0;
        this.gravity = 0.5;
        this.bounceCount = 0;
        this.maxBounces = 1;

        // grounding
        this.groundY = posY + 32; // Store the ground position
        this.grounded = false;

        // hover
        this.hoverOffset = 0;
        this.hoverSpeed = 0.05;

        // collecting
        this.magnetSpeed = 0.2;
        this.collected = false;
        this.minimumCollectDistance = 192 / 2;

        this.size = {
            width: 24,
            height: 24
        };

        this.element = this.createItemElement();
    }


    createItemElement() {
        const element = document.createElement('div');
        element.classList.add('dropped-item', this.type.toLowerCase(), this.variant);

        // Set size
        element.style.width = `${this.size.width}px`;
        element.style.height = `${this.size.height}px`;

        // Set initial position
        this.updatePosition(element);
        return element;
    }

    updatePosition(element = this.element) {
        if (!element) return;

        // Apply hover effect when grounded
        let displayY = this.posY;
        if (this.grounded) {
            this.hoverOffset += this.hoverSpeed;
            displayY -= Math.sin(this.hoverOffset) * 5;
        }

        // Subtract posZ for height
        displayY -= this.posZ;

        // Set position using top/left
        element.style.left = `${this.posX - (this.size.width / 2)}px`;
        element.style.top = `${displayY - (this.size.height / 2)}px`;
        // element.style.zIndex = parent.getZIndex(displayY, this.size.height)

        // Update z-index based on y position for proper layering
        element.style.zIndex = Math.floor(displayY);
    }

    update(myte = null) {
        if (this.collected) return;

        

        if (!this.grounded) {
            // Update positions
            this.posX += this.velocityX;

            // Apply gravity to Y velocity
            this.velocityY += this.gravity;
            this.posY += this.velocityY;

            // Check if item has landed at the ground position
            if (this.posY >= this.groundY) {
                this.posY = this.groundY;
                if (this.bounceCount < this.maxBounces) {
                    // Bounce with reduced velocity
                    this.velocityY = -this.velocityY * 0.4;
                    this.velocityX *= 0.8;  // Add some friction
                    this.bounceCount++;
                } else {
                    this.grounded = true;
                    this.velocityX = 0;
                    this.velocityY = 0;
                }
            }
        } else if (myte) {
            const activeMyte = this.parent?.activeMyte || myte.parent?.activeMyte;
            if (activeMyte === myte) {
                // Magnet effect when grounded
                const myteCenter = {
                    x: myte.posX + (myte.size.width / 2),
                    y: myte.posY + (myte.size.height / 2)
                };

                const center = {
                    x: this.posX + (this.size.width / 2),
                    y: this.posY + (this.size.height / 2)
                };


                const dx = myteCenter.x - center.x;
                const dy = myteCenter.y - center.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // if within collection distance
                if (myte.isIndependent() && distance < this.minimumCollectDistance) {
                    const magnetStrength = 1 - (distance / this.minimumCollectDistance);
                    this.posX += dx * this.magnetSpeed * magnetStrength;
                    this.posY += dy * this.magnetSpeed * magnetStrength;

                    if (distance < 20) {
                        this.collect(myte);
                    }
                }
            }
        }

        // Apply hover effect when grounded (visual-only offset)
        let displayY = this.posY;
        if (this.grounded) {
            this.hoverOffset += this.hoverSpeed;
            displayY -= Math.sin(this.hoverOffset) * 5;
        }

        // Write into renderState — MapRenderer.flush() applies this to the DOM
        if (this.renderState) {
            this.renderState.posX = this.posX;
            this.renderState.posY = displayY;
            this.renderState.dirty = true;
        } else {
            this.updatePosition();
        }
    }

    collect(myte) {
        if (this.collected) return;
        this.collected = true;
        const owner = this.parent || myte.parent;
        owner?.soundManager?.play?.('ui_pickup_item');

        // Add to inventory or apply effect based on item type
        switch (this.type) {
            case 'COIN':
                owner?.core?.user?.addCurrency?.('coins', 1);
                break;
            case 'HEALTH':
                myte.updateHealth(20);
                break;
            default:
                // Add to inventory
                owner?.inventory?.addItem?.(this.variant, 1, this.type);
        }

        // Add collection animation class
        this.element.classList.add('collected');

        // Remove after animation
        setTimeout(() => {
            this.remove();
        }, 500);
    }

    remove() {
        this.active = false;
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }

}
