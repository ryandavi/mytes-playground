class TreasureChestMapObject extends ClassStateAnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        this.items = [];
        this.droppedItems = [];
        this.canClose = this.getConfig('canClose', false);

        // Add initial items if provided
        this.addItems(options.items || []);
    }

    getStateClassNames() {
        return ['closed', 'opening', 'opened', 'closing'];
    }

    addItems(items) {
        this.items = Array.isArray(items) ? [...items] : [];
    }

    open(parent) {
        if (this.state !== 'closed') return false;

        return this.playStateTransition('opening', 'opened', {
            afterChange: () => {
                this.spawnItems(parent);
            }
        });
    }

    close(parent) {
        if (this.state !== 'opened' || !this.canClose) return false;
        return this.playStateTransition('closing', 'closed');
    }

    press(parent) {
        const myte = this.activeMyte;
        if (!this.active || !myte) return false;

        if (this.state === 'closed') {
            return this.runInteractionWhenInRange(() => {
                this.open(parent);
            }, myte);
        }

        if (this.state === 'opened' && this.canClose) {
            return this.runInteractionWhenInRange(() => {
                this.close(parent);
            }, myte);
        }

        return false;
    }
    
    spawnItems(parent) {
        if (!this.items.length) return;

        const spawnPoint = this.getSpawnPoint();
        const spreadAngle = Math.PI / 6;
        const baseVelocity = 5;
        const foregroundLayer = this.gameMap?.layers?.objects || parent?.canvas?.querySelector('.layer.foreground');

        if (!foregroundLayer) return;

        this.items.forEach((item, index) => {
            const angle = this.calculateSpawnAngle(index, spreadAngle);
            const droppedItem = this.createDroppedItem(item, spawnPoint, angle, baseVelocity);

            if (!droppedItem?.element) return;

            foregroundLayer.appendChild(droppedItem.element);
            this.droppedItems.push(droppedItem);
        });

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
            this.gameMap,
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
        this.updateDroppedItems();
    }
    
    updateDroppedItems() {
        const activeMyte = this.activeMyte;
        this.droppedItems = this.droppedItems.filter(item => {
            if (!item.collected) {
                item.update(activeMyte);
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
          const item = this.generateItem(itemDef, randomFunc);
          if (item) {
            items.push(item);
          }
        });
        
        return items;
      }







}
