class PatrolGuardMapObject extends MovingMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        // Check for required patrol points
        if (!options.patrolPoints || options.patrolPoints.length === 0) {
            console.warn('PatrolGuard requires patrol points. Using default position as fallback.');
            options.patrolPoints = [{ x: posX, y: posY }];
        }
        
        // Call parent constructor
        super(parent, type, variant, posX, posY, config, options);
        
        // Patrol state
        this.currentPointIndex = 0;
        this.waitTime = this.getConfig('waitTime', 1000);
        this.waitElapsed = 0;   // accumulated ms since we started waiting
        this.isWaiting = false;
        this.detectionRadius = this.getConfig('detectionRadius', 150);
        this.detectInterval  = this.getConfig('detectInterval', 250);
        
        // Set patrol path
        this.patrolPoints = options.patrolPoints || [];
        
        // Detection state
        this.hasDetectedTarget = false;
        this.targetEntity = null;
        this.pursuitDuration = this.getConfig('pursuitDuration', 5000);
        this.pursuitTimer = 0;
        this.alertStatus = 'normal'; // normal, alert, pursuit
        
        // Alert visual state
        this.alertIndicator = null;
        
        // Initialize with first patrol point
        this.initializePatrol();
    }

    shouldSimulateOffScreen() { return true; }
    
    // Set up initial patrol state
    initializePatrol() {
        if (this.patrolPoints.length > 0) {
            this.setTarget(this.patrolPoints[0].x, this.patrolPoints[0].y);
        }
    }
    
    // Set patrol path
    setPatrolPath(points) {
        this.patrolPoints = points;
        this.currentPointIndex = 0;
        this.initializePatrol();
    }
    
    // Add a point to the patrol path
    addPatrolPoint(x, y) {
        this.patrolPoints.push({ x, y });
    }
    
    // Check for targets in detection radius
    detectTargets() {
        // Skip detection if already in pursuit
        if (this.alertStatus === 'pursuit') return;
        
        // Find mytes within detection radius
        if (this.mytes.length) {
            const target = this.mytes.find(myte => {
                if (!myte.isActive) return false;
                
                const distance = this.getDistanceTo(myte);
                return distance <= this.detectionRadius;
            });
            
            if (target) {
                this.onTargetDetected(target);
            } else if (this.alertStatus === 'alert') {
                // Gradually return to normal if no targets nearby
                this.alertStatus = 'normal';
                this.updateAlertVisual();
            }
        }
    }
    
    // Handle target detection
    onTargetDetected(target) {
        this.targetEntity = target;
        
        if (this.alertStatus === 'normal') {
            // Just spotted target - go on alert
            this.alertStatus = 'alert';
            this.updateAlertVisual();
            
            // Optional: Play alert animation
            if (this.hasAnimation('alert')) {
                this.playAnimation('alert', () => {
                    this.playAnimation(this.getDirectionAnimation());
                });
            }
        } else {
            // Already alerted, start pursuit if configured to do so
            if (this.getConfig('canPursue', true)) {
                this.startPursuit();
            }
        }
    }
    
    // Start pursuing a target
    startPursuit() {
        if (!this.targetEntity) return;
        
        this.alertStatus = 'pursuit';
        this.pursuitTimer = this.pursuitDuration;
        this.updateAlertVisual();
        
        // Optional: Play pursuit animation
        if (this.hasAnimation('pursuit_start')) {
            this.playAnimation('pursuit_start', () => {
                this.playAnimation(this.getDirectionAnimation());
            });
        }
    }
    
    // Update visual indicator for alert status
    updateAlertVisual() {
        if (!this.element) return;
        
        // Remove previous status
        this.element.classList.remove('alert-normal', 'alert-alert', 'alert-pursuit');
        
        // Add current status
        this.element.classList.add(`alert-${this.alertStatus}`);
        
        // Create or update alert indicator
        this.updateAlertIndicator();
    }
    
    // Create/update alert indicator element
    updateAlertIndicator() {
        if (!this.element) return;
        
        // Create indicator if it doesn't exist
        if (!this.alertIndicator) {
            this.alertIndicator = document.createElement('div');
            this.alertIndicator.className = 'alert-indicator';
            this.element.appendChild(this.alertIndicator);
        }
        
        // Update indicator appearance
        this.alertIndicator.className = `alert-indicator ${this.alertStatus}`;
    }
    
    // Get animation name based on direction
    getDirectionAnimation() {
        const direction = this.getMovementDirection() || 'S';
        return this.alertStatus === 'pursuit' ? `pursuit_${direction}` : direction;
    }
    
    // updatePatrol receives tickDelta so wait timing is game-loop-accurate
    updatePatrol(tickDelta) {
        if (this.patrolPoints.length === 0) return;

        if (this.isWaiting) {
            this.waitElapsed += tickDelta;
            if (this.waitElapsed >= this.waitTime) {
                this.isWaiting = false;
                this.waitElapsed = 0;
                this.advanceToNextPatrolPoint();
            }
        } else {
            if (this.isAtTarget()) {
                this.isWaiting = true;
                this.waitElapsed = 0;
                this.stopMoving();
                if (this.hasAnimation('idle')) this.playAnimation('idle');
            } else {
                this.moveToward(this.targetX, this.targetY);
                const direction = this.getMovementDirection();
                if (direction && this.hasAnimation(direction)) this.playAnimation(direction);
            }
        }
    }
    
    // Advance to the next patrol point
    advanceToNextPatrolPoint() {
        if (this.patrolPoints.length === 0) return;
        
        // Move to next point index
        this.currentPointIndex = (this.currentPointIndex + 1) % this.patrolPoints.length;
        
        // Get coordinates of next point
        const nextPoint = this.patrolPoints[this.currentPointIndex];
        
        // Check if point is within bounds
        const boundedX = Math.max(this.bounds.left, Math.min(this.bounds.right - this.size.width, nextPoint.x));
        const boundedY = Math.max(this.bounds.top, Math.min(this.bounds.bottom - this.size.height, nextPoint.y));
        
        // Set as target
        this.setTarget(boundedX, boundedY);
    }
    
    // Update pursuit logic
    updatePursuit(deltaTime) {
        if (!this.targetEntity || this.alertStatus !== 'pursuit') return;
        
        // Update pursuit timer
        this.pursuitTimer -= deltaTime;
        
        // Check if pursuit has timed out
        if (this.pursuitTimer <= 0) {
            this.endPursuit();
            return;
        }
        
        // Move toward target entity
        const targetX = this.targetEntity.posX;
        const targetY = this.targetEntity.posY;
        
        // Set as current target
        this.setTarget(targetX, targetY);
        
        // Move toward target
        this.moveToward(this.targetX, this.targetY);
        
        // Play appropriate movement animation
        const direction = this.getMovementDirection();
        if (direction) {
            const animName = `pursuit_${direction}`;
            if (this.hasAnimation(animName)) {
                this.playAnimation(animName);
            } else if (this.hasAnimation(direction)) {
                this.playAnimation(direction);
            }
        }
    }
    
    // End pursuit and return to patrol
    endPursuit() {
        this.alertStatus = 'normal';
        this.targetEntity = null;
        this.updateAlertVisual();
        
        // Return to patrol
        if (this.patrolPoints.length > 0) {
            const currentPoint = this.patrolPoints[this.currentPointIndex];
            this.setTarget(currentPoint.x, currentPoint.y);
        }
    }
    
    // tickUpdate: AI, detection, patrol/pursuit logic (no DOM)
    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        this._detectAccum = (this._detectAccum || 0) + tickDelta;
        if (this._detectAccum >= this.detectInterval) {
            this._detectAccum = 0;
            this.detectTargets();
        }

        if (this.alertStatus === 'pursuit') {
            this.updatePursuit(tickDelta);
        } else {
            this.updatePatrol(tickDelta);
        }
    }

    // update: visual only (animation handled by parent chain)
    update(deltaTime) {
        super.update(deltaTime);
    }
    
    // Override render method
    render(container, parent) {
        const element = super.render(container, parent);
        
        // Add guard-specific classes
        element.classList.add('patrol-guard');
        element.classList.add(`alert-${this.alertStatus}`);
        
        return element;
    }
}
