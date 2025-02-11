

// Enhanced MapObjects manager class
class MapArea {
    constructor(parent, data = null) {
        this.parent = parent;
        this.objects = [];
        this.name = 'Map Area';
        this.objectLayerSelector = '.layer.foreground';
    }



    addObject(type, variant, x, y) {
        const object = MapObjectFactory.create(type, variant, x, y);


        if (object) {
            this.objects.push(object);
            
            // Render immediately if container exists
            const container = this.parent.canvas.querySelector(this.objectLayerSelector);
            if (container) {
                object.render(container, this.parent);
            }
        }
        return object;
    }

    addRandomObjects(count, types = ['GRASS']) {
        const foregroundLayer = this.parent.canvas.querySelector(this.objectLayerSelector);
        if (!foregroundLayer) return;

        const maxX = foregroundLayer.clientWidth;
        const maxY = foregroundLayer.clientHeight;

        // loop
        for (let i = 0; i < count; i++) {
            // Randomly select type and variant
            const type = types[Math.floor(Math.random() * types.length)];
            const config = MAP_OBJECT_TYPES[type];
            const variant = config.variants[Math.floor(Math.random() * config.variants.length)];
            
            const x = Math.floor(Math.random() * maxX);
            const y = Math.floor(Math.random() * maxY);

            this.addObject(type, variant, x, y);
        }
    }

    getObjectsInRadius(x, y, radius) {
        return this.objects.filter(obj => {
            const dx = obj.posX - x;
            const dy = obj.posY - y;
            return Math.sqrt(dx * dx + dy * dy) <= radius;
        });
    }

    removeInactive() {
        this.objects = this.objects.filter(obj => obj.active);
    }

    init() {

        /*
        // Add random nature objects
        this.addRandomObjects(100, ['GRASS']);
        this.addRandomObjects(20, ['FLOWER']);
        // this.addRandomObjects(10, ['TREE']);
        
        // Add some interactive items
        this.addRandomObjects(5, ['MUSIC_BOX']);
        // this.addRandomObjects(15, ['FOOD']);
        */

        // Add some treasure chests
        const chest = this.addObject('TREASURE_CHEST', 'wooden_chest', 200, 200);
        chest.addItems([
            { type: 'COIN', variant: 'gold' },
            { type: 'HEALTH', variant: 'potion' }
        ]);

        this.addObject('CROP_PLANT', 'tomato', 100, 100); 
        
        const goldenChest = this.addObject('TREASURE_CHEST', 'golden_chest', 400, 300);
        goldenChest.addItems([
            { type: 'COIN', variant: 'gold' },
            { type: 'COIN', variant: 'gold' },
            { type: 'EQUIPMENT', variant: 'sword' },
            { type: 'COIN', variant: 'gold' },
            { type: 'COIN', variant: 'gold' },
            { type: 'EQUIPMENT', variant: 'sword' }
        ]);


    }

    update() {
        // Update all active objects
        this.objects.forEach(object => {
            if (object.active) {
                object.update(this.parent);
            }
        });

        // Clean up inactive objects
        this.removeInactive();
    }

    removeInactive() {
        this.objects = this.objects.filter(obj => obj.active);
    }
}