class PortalMapObject extends AnimatedMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);
        
        // Portal-specific properties
        this.targetMap = options.targetMap || null;
        this.targetSpawnPoint = options.targetSpawnPoint || 'default';
        this.isActive = options.isActive !== undefined ? options.isActive : true;
        this.activationRadius = options.activationRadius || 75;
        this.transitionDuration = options.transitionDuration || 1000;
        
        // Visual state tracking
        this.isAnimating = false;
        this.particleSystem = null;
        
        // Initialize portal visuals
        this.initializePortalEffects();
    }
    
    // Set up portal particle effects if configured
    initializePortalEffects() {
        // Set up portal particle effects if available
        if (this.gameMap?.particleSystem && this.getConfig('particleEffects', true)) {
            this.particleSystem = this.gameMap.particleSystem.addEffect(this, 'GLOW', {
                colors: [
                    this.getConfig('particleStartColor', '#8A2BE2'),
                    this.getConfig('particleEndColor', '#4B0082')
                ],
                count: this.isActive ? 1 : 0,
                randomizePosition: true,
                randomizeFactor: 20
            });
        }
    }
    
    // Override interaction handling
    press(interactor) {
        if (this.isAnimating || !this.isActive) return false;
        
        console.log(`Portal to ${this.targetMap} activated via interaction`);

        // Activate the portal
        // if (interactor === this.parent.activeMyte) {
            this.beginTransition(interactor);
        // }
        
        // Call parent press for basic interaction tracking
        super.press(interactor);
        
        return true;
    }
    
    // Check if myte is close enough to auto-activate
    checkProximityActivation(myte) {
        if (!this.isActive || !myte || !this.targetMap || this.isAnimating) return;
        
        // Calculate distance to myte
        const dx = (myte.posX + myte.size.width/2) - (this.posX + this.size.width/2);
        const dy = (myte.posY + myte.size.height/2) - (this.posY + this.size.height/2);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Check if myte is close enough
        if (distance < this.activationRadius) {
            console.log(`Portal to ${this.targetMap} activated via proximity`);
            this.beginTransition(myte);
        }
    }
    
    // Begin the map transition process
    beginTransition(myte) {
        if (this.isAnimating || !this.isActive || !this.targetMap) return;
        this.isAnimating = true;
        
        // Disable portal during transition
        this.isActive = false;
        
        // Play portal activation animation if available
        if (this.hasAnimation('activate')) {
            this.playAnimation('activate');
        }

		let container = this.container;
		let gameMap = this.gameMap;

        // Trigger the map transition
        if (container.transitionManager) {
			console.log("transition manager transition")
            // Use the transition manager if available
            container.transitionManager.startTransition({
                targetMap: this.targetMap,
                targetSpawnPoint: this.targetSpawnPoint,
                duration: this.transitionDuration,
                myte: myte,
                sourcePortal: this,
                onComplete: () => {
                    this.isAnimating = false;
                    this.isActive = true;
                }
            });
        } else {
            // Fallback to basic transition
			console.log("fallback transition to " + this.targetMap);


            container.loadMap(this.targetMap).then(() => {
                this.isAnimating = false;
                this.isActive = true;
                
                // Position the myte at the target spawn point
                if (myte && gameMap) {
                    const spawnPoint = gameMap.getSpawnPoint(this.targetSpawnPoint);
                    myte.setPosition(spawnPoint.x, spawnPoint.y);
                }
            });
        }
    }
    
    // Override render to add portal-specific classes
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add portal-specific class
        element.classList.add('portal', this.isActive ? 'active' : 'inactive');


		// create element
		const portal = document.createElement("div");
		portal.className = "portal-window";
		
        // title
		const title = document.createElement("div");
		title.className = "title";
		title.innerHTML = "&nbsp;";
		
        // content
		const content = document.createElement("div");
		content.className = "content";
		content.style.backgroundImage = "url(red.gif)";
		
        // combine
		portal.appendChild(title);
		portal.appendChild(content);
		
        // add to element
		element.appendChild(portal);
		
        // Add target map hint for debugging
        if (this.targetMap) {
            element.dataset.targetMap = this.targetMap;
        }
        
        return element;
    }
    
    // tickUpdate: proximity check (gameplay trigger, no DOM)
    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        if (this.isActive && !this.getConfig('interactionOnly', false) && this.activeMyte) {
            this.checkProximityActivation(this.activeMyte);
        }
    }

    update(deltaTime) {
        super.update(deltaTime);

        // Particle emission rate is a visual property — stays in update
        if (this.particleSystem?.options) {
            this.particleSystem.options.count = this.isActive ? 1 : 0;
        }
    }
    
    // Clean up resources when removed
    remove() {
        if (this.particleSystem) {
            this.particleSystem.active = false;
            this.particleSystem = null;
        }
        
        super.remove();
    }
}
