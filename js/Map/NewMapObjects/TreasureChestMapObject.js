class TreasureChestMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // State
        this.state = this.getConfig('spriteConfig.default', 'closed');
        this.items = [];
        this.droppedItems = [];
        this.canClose = this.getConfig('canClose', false);

        // Add initial items if provided
        this.addItems(options.items || []);
    }

    addItems(items) {
        this.items = items;
    }

    open(parent) {
        if (this.state !== 'closed') return;

        console.log("opening chest");

        // Update state
        this.state = 'opening';
        this.updateElementState('opening');
        
        // Play animation
        this.playAnimation('opening', () => {
            this.state = 'opened';
            this.updateElementState('opened');
            this.playAnimation('opened');
            this.spawnItems(parent);
        });
    }

    close(parent) {
        if (this.state !== 'opened' || !this.canClose) return;

        // Update state
        this.state = 'closing';
        this.updateElementState('closing');
        
        // Play animation
        this.playAnimation('closing', () => {
            this.state = 'closed';
            this.updateElementState('closed');
            this.playAnimation('closed');
        });
    }
    
    updateElementState(newState) {
        if (!this.element) return;
        
        // Remove previous state classes
        ['closed', 'opening', 'opened', 'closing'].forEach(state => {
            this.element.classList.remove(state);
        });
        
        // Add new state class
        this.element.classList.add(newState);
    }

    press(parent) {
        if (!this.active || !parent.activeMyte) return false;

        const myte = parent.activeMyte;
        const distance = this.getDistanceFromMyte(myte);
        const interactionRadius = this.getConfig('interactionRadius', 100);

        this.open(parent);


        return;

        // Check if we can interact directly
        if (this.state === 'closed') {
            return this.handleChestPress(parent, myte, distance, interactionRadius, 
                   () => this.open(parent));
        } 
        else if (this.state === 'opened' && this.canClose) {
            return this.handleChestPress(parent, myte, distance, interactionRadius, 
                   () => this.close(parent));
        }

        return false;
    }
    
    handleChestPress(parent, myte, distance, interactionRadius, action) {
        // If no distance check is needed
        if (interactionRadius === -1) {
            action();
            return true;
        }

        // If myte is close enough, perform action
        if (distance <= interactionRadius) {
            myte.queue.add('go_to_object', {
                target: this,
                onComplete: action
            });
            return true;
        }

        // Otherwise just go to the chest
        myte.queue.add('go_to_object', { target: this });
        return true;
    }
    
    getDistanceFromMyte(myte) {
        const dx = this.posX - myte.posX;
        const dy = this.posY - myte.posY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    spawnItems(parent) {
        if (!this.items.length) return;

        const spawnPoint = this.getSpawnPoint();
        const spreadAngle = Math.PI / 6;
        const baseVelocity = 5;

        this.items.forEach((item, index) => {
            // Calculate spawn angle
            const angle = this.calculateSpawnAngle(index, spreadAngle);
            
            // Create dropped item
            const droppedItem = this.createDroppedItem(item, spawnPoint, angle, baseVelocity);
            
            // Add to scene
            parent.canvas.querySelector('.layer.foreground').appendChild(droppedItem.element);
            this.droppedItems.push(droppedItem);
        });

        // Clear items after spawning
        this.items = [];
    }
    
    getSpawnPoint() {
        return {
            x: this.posX + this.size.width / 2,
            y: this.posY + this.size.height / 2
        };
    }
    
    calculateSpawnAngle(index, spreadAngle) {
        return this.items.length === 1
            ? -Math.PI / 2  // Single item goes straight up
            : -Math.PI / 2 - spreadAngle / 2 + (spreadAngle * index / (this.items.length - 1));
    }
    
    createDroppedItem(item, spawnPoint, angle, baseVelocity) {
        const droppedItem = new DroppedMapItem(
            item.type,
            item.variant,
            spawnPoint.x,
            spawnPoint.y
        );

        droppedItem.velocityX = Math.cos(angle) * baseVelocity;
        droppedItem.velocityY = Math.sin(angle) * baseVelocity;
        droppedItem.velocityZ = baseVelocity;
        
        return droppedItem;
    }

    update(deltaTime) {

        
        super.update(deltaTime);


        
        // Update dropped items
        this.updateDroppedItems();
    }
    
    updateDroppedItems() {


        this.droppedItems = this.droppedItems.filter(item => {
            if (!item.collected) {

                if(this.parent?.activeMyte){
                    item.update(this.parent.activeMyte);
                }
                
                return true;
            }
            return false;
        });
    }

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('treasure-chest', this.state);
        return element;
    }





    


    generateItem(itemDef, randomFunc = Math.random) {
        // Check probability
        if (randomFunc() > itemDef.probability) {
          return null; // Item doesn't spawn
        }
        
        // Calculate quantity
        let quantity = itemDef.quantity;
        if (Array.isArray(quantity)) {
          // If quantity is a range, pick a random number within that range
          const [min, max] = quantity;
          quantity = Math.floor(randomFunc() * (max - min + 1)) + min;
        }
        
        // Calculate value (for variants that are ranges)
        let variant = itemDef.variant;
        if (Array.isArray(variant)) {
          // If variant is a range, pick a random number within that range
          const [min, max] = variant;
          variant = Math.floor(randomFunc() * (max - min + 1)) + min;
        }
        
        return {
          type: itemDef.type,
          variant: variant,
          quantity: quantity
        };
      }
      
      openChest(chestDef, seed) {
        const items = [];
        
        // Create a seeded random function if seed is provided
        const randomFunc = seed !== undefined ? Utility.createRandomGenerator(seed) : Math.random;
        
        chestDef.forEach(itemDef => {
          const item = generateItem(itemDef, randomFunc);
          if (item) {
            items.push(item);
          }
        });
        
        return items;
      }







}