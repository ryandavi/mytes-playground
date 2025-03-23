

class Myte {

	constructor(id, parent, element) {
		this.id = id;
		this.species = "snail";
		this.name = element.dataset.myteName;


		this.stats = null;

		this.parent = parent;
		this.element = element;
		this.isActive = false;
		this.isPaused = false;

		this.direction = DIRECTION.SOUTH;
		this.diagonalMovement = false;

		this.elements = {
			wrapper: this.element.closest(".myteWrapper"),
		};


		// this character's elements
		this.duplicate;
		this.sprite;
		this.targetDot;
		this.dropTarget;

		this.dialogue;
		this.battery = null;

		// speed
		this.speed = 1;

		// positions
		this.posX = 0;
		this.posY = 0;
		this.targetX = 0;
		this.targetY = 0;

		this.modes = [MOVE_TYPES.FOLLOW, MOVE_TYPES.FREEROAM, MOVE_TYPES.GRAVITY, MOVE_TYPES.GOHOME, MOVE_TYPES.QUEUE_ONLY];
		this.followModes = [MOVE_FOLLOW_TYPES.NORMAL, MOVE_FOLLOW_TYPES.CIRCLES, MOVE_FOLLOW_TYPES.RUNAWAY];

		// goal vars
		this.atOriginal = true;
		this.isFreeRoam = false;
		this.followMouse = false;
		this.isGravity = false;
		this.isDragging = false;

		// goals
		this.goal = DEFAULT_MODE;
		this.previousGoal = DEFAULT_MODE;
		this.followGoal = DEFAULT_FOLLOW_MODE;

		// systems
		this.queue;
		this.stateMachine;

		// bools
		this.checkForCollisions = true;

		this.size = {
			width: 192,
			height: 192
		};

		this.followRadius = {
			min: 192 / 2,
			max: 192 * 2
		}

		// Add to Myte class constructor
		this.collider = {
			type: 'box', // or 'circle', etc.
			width: this.size.width * 0.5, // Smaller than visual size for more forgiving collisions
			height: this.size.height * 0.3, // Lower height to allow walking behind objects
			offsetX: this.size.width * 0.25, // Center the collider
			offsetY: this.size.height * 0.6 // Position at the bottom for proper z-sorting
		};

		this.physics = {
			gravity: 0.3,                // Gravity acceleration
			terminalVelocity: 12,        // Maximum falling speed
			jumpHeight: 10,               // Initial jump velocity
			airControl: 0.7,             // Horizontal control while airborne (0-1)
			groundFriction: 0.8,         // Friction when on ground (0-1)
			minFallDamageVelocity: 22,   // Minimum velocity to cause damage when landing
			coyoteTime: 80,              // Time in ms when you can still jump after walking off an edge
			jumpBuffer: 150,             // Time in ms to buffer a jump input before landing
			collisionTolerance: 5,       // Tolerance in pixels for collision detection
			stepHeight: 3,                // Maximum height in pixels a character can automatically step up
			velocity: 0                 // Current vertical velocity (starts at 0)
		};

		// Override specific settings based on species
		if (this.species === "snail") {
			this.physics.gravity = 0.25;
			this.physics.jumpHeight = 10;
			this.physics.airControl = 0.5;
		}

		// Initialize jump-related variables
		this.leftGroundTime = undefined;  // Tracks when character left solid ground (for coyote time)
		this.jumpBufferTime = undefined;  // Tracks when jump was attempted (for jump buffering)
		this.stuckFrames = 0;             // Tracks how many frames the character has been stuck

		// gravity-based
		this.isJumping = false;
		this.isFalling = false;

		this.startTime = null;
		this.runAway_angle_distance = 300;
		this.inputHandler;

	}

	get limitToContainer() {
        return this.parent.settings.limitMap;
    }

	initParticleEffects() {
		const particleSystem = this.parent.gameMap.particleSystem;
		
		// Add particle control methods to this Myte
		particleSystem.addParticleMethodsToObject(this);
		

		// Dust for regular movement
		// this.addEffect("SMOKE_SPRITE");
		
	}

	pause() {
		this.isPaused = true;
	}

	resume() {
		this.isPaused = false;
	}


	init() {
		/********************************************
		 * duplicated element
		********************************************/
		this.initInteractiveMyte();

		// create dots
		this.createTargetDot();

		// add functions
		this.queue = new MyteQueue(this);
		this.stateMachine = new StateMachine(this, DEFAULT_STATE, 'snail');
		this.inputHandler = new MyteInputHandler(this);

		this.dialogue = new MyteDialogue(this);
		this.stats = new MyteStats(this);

		// temp - make it a snail
		this.stateMachine.setSnail();

		// position
		let rect = this.parent.getOffset(this.element);
		const offsetX = rect.x - this.parent.getContainerRect().x;
		const offsetY = rect.y - this.parent.getContainerRect().y;
		this.setTarget(offsetX, offsetY);
		this.setPosition(offsetX, offsetY);
		this.setSpritePosition(this.posX, this.posY);

		// Initialize particle effects if the game map has a particle system
		if (this.parent && this.parent.gameMap && this.parent.gameMap.particleSystem) {
			this.initParticleEffects();
		}

		/********************************************
		 * CLICK EVENTS
		********************************************/

		// for dragging - we dont want to allow it for a few seconds
		this.setStartTime();
	}

	initInteractiveMyte() {
		// clone myte
		this.duplicate = this.element.cloneNode(true);
		this.duplicate.classList.add("freemode"); // free mode is when it can fly around
		this.duplicate.classList.add("duplicate"); // free mode is when it can fly around
		this.duplicate.id = "duplicate-" + this.duplicate.id;

		// add duplicate to canvas
		this.parent.canvas.appendChild(this.duplicate); // insert new

		// elements
		this.sprite = this.duplicate.querySelector('.sprite');
		this.dropTarget = this.element.closest(".myteWrapper");
		this.battery = this.duplicate.querySelector('.battery');

		// original element
		this.duplicate.classList.add("deactivated"); // hide the original element
	}

	setWrapperPosition(x, y){
		this.elements.wrapper.style.left = x + 'px';
		this.elements.wrapper.style.top = y + 'px';

		this.setPosition(x, y);
		this.setSpritePosition(x, y);
	}

	setStartTime() {
		this.startTime = Date.now();
	}

	canDrag() {
		return Date.now() - this.startTime > 1000;
	}

	stop() {
		this.isActive = false;
		this.atOriginal = true;

		// set position
		var rect = this.parent.getLocalOffset(this.elements.wrapper);
		this.posX = rect.left;
		this.posY = rect.top;
		this.setSpritePosition(this.posX, this.posY);

		// hide it
		this.element.classList.remove("deactivated");
		this.duplicate.classList.remove("active");
		this.duplicate.classList.add('deactivated');
		this.elements.wrapper.classList.remove('empty');

		// target dot
		console.log('target dot hide at stop');
		this.targetDot.classList.add('hidden');

		// set next as active
		this.parent.setNextMyteAsActive(this);
		if (this.parent.activeMyte == null) {
			this.parent.ui.debugMenu.disableButtons();
		}
	}

	start() {

		this.isActive = true;

		this.element.classList.add("deactivated"); // hide the original element
		this.elements.wrapper.classList.add('empty');
		this.duplicate.classList.remove("deactivated"); // show the duplicate element

		// show dot
		this.targetDot.classList.remove('hidden');

		// modes
		this.setMode();
		this.setFollowMode();

		// set start time - we need this to disable dragging for a few seconds at start
		this.setStartTime();


		// start at home wrapper
		this.setPosition(this.elements.wrapper.offsetLeft, this.elements.wrapper.offsetTop);

		this.parent.ui.debugMenu.enableButtons();

	}

	update_target_dot() {
		this.targetDot.style.left = (this.targetX + this.getRect().width / 2) + 'px';
		this.targetDot.style.top = (this.targetY + this.getRect().height / 2) + 'px';

	}

	setFollowMode(newGoal = null) {

		if (newGoal == null) {
			newGoal = this.followGoal;
		}

		this.followGoal = newGoal;

		this.parent.ui.debugMenu.updateFollowMode(document.getElementById("cycleFollowGoal"));

		if (this.followGoal == MOVE_FOLLOW_TYPES.NORMAL) {
			this.runAway = false;
			this.goingInCircles = false;
		} else if (this.followGoal == MOVE_FOLLOW_TYPES.CIRCLES) {
			this.runAway = false;
			this.goingInCircles = true;
		} else if (this.followGoal == MOVE_FOLLOW_TYPES.RUNAWAY) {
			this.runAway = true;
			this.goingInCircles = false;
		}
	}

	isIndependent(){
		return this.isDragging == false;
	}

	setMode(newGoal = null) {


		if (newGoal == null) {
			// set new goal to current go if nothing is set -- this is to set the buttons
			newGoal = this.goal;
		}

		if (newGoal != this.goal) {
			// if the goal is actually changing
			this.previousGoal = this.goal;
			this.goal = newGoal;

			this.unset_target();
			this.queue.clear();
		}


		this.parent.ui.debugMenu.updateGoal(document.getElementById("cycleGoal"));

		if (this.goal == MOVE_TYPES.FOLLOW) {
			this.atOriginal = false;
			this.isFreeRoam = false;
			this.followMouse = true;
			this.isGravity = false;
			this.isDragging = false;
			this.unset_target();
			this.queue.clear();
		} else if (this.goal == MOVE_TYPES.GRAVITY) {
			this.atOriginal = false;
			this.isFreeRoam = false;
			this.followMouse = false;
			this.isGravity = true;
			this.isDragging = false;
			this.unset_target();
			this.queue.clear();
		} else if (this.goal == MOVE_TYPES.FREEROAM) {
			this.atOriginal = false;
			this.isFreeRoam = true;
			this.followMouse = false;
			this.isGravity = false;
			this.isDragging = false;
			this.unset_target();
			this.queue.clear();
		} else if (this.goal == MOVE_TYPES.GOHOME) {
			this.atOriginal = false;
			this.isFreeRoam = false;
			this.followMouse = false;
			this.isGravity = false;
			this.isDragging = false;
			this.unset_target();
			this.queue.clear();
			this.set_target_to_origin();
		}
	}

	unset_target() {
		this.targetX = this.posX;
		this.targetY = this.posY;
	}


	set_target_to_origin() {

		var rect = this.parent.getLocalOffset(this.elements.wrapper);

		this.targetX = rect.left;
		this.targetY = rect.top;
	}

	get isActiveMyte() {
		return this == this.parent.activeMyte;
	}

	/********************************************
	 * events - hover
	********************************************/

	createTargetDot() {
		// Create the target element
		const element = document.createElement('div');
		element.className = 'ignore dot target debug hidden';
		element.id = `target-dot-${this.id}`;

		// Find the .layer.foreground in this.canvas and add the element to it
		const foregroundLayer = this.parent.canvas.querySelector('.layer.controls');
		if (foregroundLayer) {
			foregroundLayer.appendChild(element);
		}

		// give it the name of the myte
		element.dataset.name = this.name;

		// Store the element in this
		this.targetDot = element;
	}


	getRect() {
		return this.parent.getRect(this.duplicate);
	}

	getOffsetRect() {
		return this.parent.getLocalOffset(this.duplicate);
	}


	reset() {
		this.physics.velocity = 0;
		this.isJumping = false;
		this.isFalling = false;
		this.isOnSolidGround = false;
		this.leftGroundTime = undefined;
		this.jumpBufferTime = undefined;
		this.stuckFrames = 0;
	}

	is_moving() {

		if (this.is_at_target()) return false;
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;
		var distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > 0) {
			return true;
		}

		return false;
	}


	is_at_target() {
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;
		var distance = Math.sqrt(dx * dx + dy * dy);
		return distance <= 0.5;
	}

	setDirection(direction) {
		if (direction != this.direction) {
			console.log("set direction", direction);
			this.direction = direction;
		}
	}

	getDirection(directionWeight = 2) {
		let dx = this.targetX - this.posX;
		let dy = this.targetY - this.posY;
		let distance = Math.sqrt(dx * dx + dy * dy);

		const directionX = dx / distance;
		const directionY = dy / distance;

		// Adjust the weights for the X and Y directions
		const weightedDirectionX = directionX * directionWeight;
		const weightedDirectionY = directionY;

		if (Math.abs(weightedDirectionX) > Math.abs(weightedDirectionY)) {
			return weightedDirectionX > 0 ? DIRECTION.EAST : DIRECTION.WEST;
		} else {
			return weightedDirectionY > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH;
		}
	}



	snap_position_to_target(doXAxis = true, doYAxis = true) {
		if (doXAxis) this.posX = this.targetX;
		if (doYAxis) this.posY = this.targetY;
	}
	get distance_from_target() {
		var d = {
			x: this.targetX - this.posX,
			y: this.targetY - this.posY
		};
		var distance2 = Math.sqrt(d.x * d.x + d.y * d.y);
		return distance2.toFixed(2);
	}

	get distance_from_mouse() {
		let mouse = this.parent.getLocalMouse(this);

		var d = {
			x: mouse.x - this.posX,
			y: mouse.y - this.posY
		};

		var distance2 = Math.sqrt(d.x * d.x + d.y * d.y);
		return distance2.toFixed(2);
	}


// Add this defensive check to the move_toward_target method
move_toward_target(doXAxis = true, doYAxis = true) {
    var dx = this.targetX - this.posX;
    var dy = this.targetY - this.posY;
    var distance = Math.sqrt(dx * dx + dy * dy);

    // Store original position
    const originalX = this.posX;
    const originalY = this.posY;

    if (distance !== 0) {
        const moveX = (dx / distance) * this.stats.getSpeed();
        const moveY = (dy / distance) * this.stats.getSpeed();

        // Try to move on each axis separately - preserving original behavior
        if (doXAxis) {
            this.posX += moveX;

            // Check for collisions on X axis - using original collision approach
            if (this.checkForCollisions) {
                // Add defensive check for gameMap and gridSystem
                if (this.parent && this.parent.gameMap && this.parent.gameMap.gridSystem) {
                    const potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
                    for (const collider of potentialColliders) {
                        if (this.parent.checkCollision(this, collider)) {
                            // Simply revert to original X position
                            this.posX = originalX;
                            break;
                        }
                    }
                }
            }
        }

        if (doYAxis) {
            this.posY += moveY;

            // Check for collisions on Y axis - using original collision approach
            if (this.checkForCollisions) {
                // Add defensive check for gameMap and gridSystem
                if (this.parent && this.parent.gameMap && this.parent.gameMap.gridSystem) {
                    const potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
                    for (const collider of potentialColliders) {
                        if (this.parent.checkCollision(this, collider)) {
                            // Simply revert to original Y position
                            this.posY = originalY;
                            break;
                        }
                    }
                }
            }
        }
    }

    // If the distance is small enough, snap to the target
    if (distance < this.stats.getSpeed()) {
        this.snap_position_to_target(doXAxis, doYAxis);
    }

    this.setDirection(this.getDirection());
    this.setSpritePosition(this.posX, this.posY);
}



	move_toward_target_new(doXAxis = true, doYAxis = true) {
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;
		var distance = Math.sqrt(dx * dx + dy * dy);
	
		// Store original position
		const originalX = this.posX;
		const originalY = this.posY;
	
		if (distance !== 0) {
			const moveX = (dx / distance) * this.stats.getSpeed();
			const moveY = (dy / distance) * this.stats.getSpeed();
			
			let xBlocked = false;
			let yBlocked = false;
	
			// Try to move on X axis
			if (doXAxis) {
				const newX = this.posX + moveX;
				
				if (this.canMoveToPosition(newX, this.posY)) {
					this.posX = newX;
					
					if (this.checkForCollisions) {
						const potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
						for (const collider of potentialColliders) {
							if (this.parent.checkCollision(this, collider)) {
								this.posX = originalX;
								xBlocked = true;
								break;
							}
						}
					}
				} else {
					xBlocked = true;
				}
			}
	
			// Try to move on Y axis
			if (doYAxis) {
				const newY = this.posY + moveY;
				
				if (this.canMoveToPosition(this.posX, newY)) {
					this.posY = newY;
					
					if (this.checkForCollisions) {
						const potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
						for (const collider of potentialColliders) {
							if (this.parent.checkCollision(this, collider)) {
								this.posY = originalY;
								yBlocked = true;
								break;
							}
						}
					}
				} else {
					yBlocked = true;
				}
			}
			
			// If both directions are blocked, try to slide along the wall
			if (xBlocked && yBlocked && Math.abs(moveX) > 0.1 && Math.abs(moveY) > 0.1) {
				// Try sliding horizontally if vertical movement is blocked
				if (Math.abs(moveX) > Math.abs(moveY) * 0.5) {
					const slideX = this.posX + moveX * 1.2; // Slightly increase slide speed for better feel
					if (this.canMoveToPosition(slideX, originalY)) {
						this.posX = slideX;
					}
				} 
				// Try sliding vertically if horizontal movement is blocked
				else if (Math.abs(moveY) > Math.abs(moveX) * 0.5) {
					const slideY = this.posY + moveY * 1.2; // Slightly increase slide speed for better feel
					if (this.canMoveToPosition(originalX, slideY)) {
						this.posY = slideY;
					}
				}
			}
		}
	
		// If the distance is small enough, snap to the target
		if (distance < this.stats.getSpeed()) {
			this.snap_position_to_target(doXAxis, doYAxis);
		}
	
		this.setDirection(this.getDirection());
		this.setSpritePosition(this.posX, this.posY);
	}
	
	// Add this helper method to check if a position is valid
	canMoveToPosition(newX, newY) {
		const gridSystem = this.parent.gameMap.gridSystem;
		const cellSize = gridSystem.config.cellSize;
		
		// Get collider bounds at the new position
		const left = newX + this.collider.offsetX;
		const top = newY + this.collider.offsetY;
		const right = left + this.collider.width;
		const bottom = top + this.collider.height;
		
		// Convert to grid coordinates
		const startGridX = Math.floor(left / cellSize);
		const startGridY = Math.floor(top / cellSize);
		const endGridX = Math.ceil(right / cellSize);
		const endGridY = Math.ceil(bottom / cellSize);
		
		// Check each grid cell that the collider would overlap
		for (let gridX = startGridX; gridX < endGridX; gridX++) {
			for (let gridY = startGridY; gridY < endGridY; gridY++) {
				// Check if this grid cell is within bounds and walkable
				if (gridX < 0 || gridX >= gridSystem.gridWidth || 
					gridY < 0 || gridY >= gridSystem.gridHeight ||
					!gridSystem.grid[gridX][gridY].walkable) {
					return false;
				}
			}
		}
		
		return true;
	}

	setSpritePosition(x = null, y = null, limit = false) {

		let setX = (x == null ? false : true);
		let setY = (y == null ? false : true);

		if (x == null) {
			x = this.posX;
		}

		if (y == null) {
			y = this.posY;
		}


		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();

		let container = this.parent.getContainerRect();

		if (limit) {
			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		} else {
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top);
		}


		// offset parent wrapper
		//x -= this.elements.wrapper.offsetLeft;
		//y -= this.elements.wrapper.offsetTop;


		if (setX) this.duplicate.style.left = x.toFixed(0) + 'px';
		if (setY) {
			this.duplicate.style.top = y.toFixed(0) + 'px';
			this.setZIndex(y);
		}
	}


	getZIndex(y) {
		let offset = 0; // -(192/2);
		let extra = this.isCurrentlyJumping() ? this.physics.velocity : 0;

		return this.parent.getZIndex(y, extra + this.size.height - offset);
	}

	setZIndex(y) {
		this.duplicate.style.zIndex = this.getZIndex(y);
	}

	setTarget(x = null, y = null, limit = false) {

		let setX = (x == null ? false : true);
		let setY = (y == null ? false : true);

		if (x == null) {
			x = this.targetX;
		}

		if (y == null) {
			y = this.targetY;
		}

		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();
		let container = this.parent.getContainerRect();

		if (limit) {
			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		} else {
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top - 100);
		}


		if (setX) this.targetX = x;
		if (setY) this.targetY = y;
	}

	setPosition(x = null, y = null, limit = false) {


		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();
		let container = this.parent.getContainerRect();

		let setX = (x == null ? false : true);
		let setY = (y == null ? false : true);

		if (x == null) {
			x = this.posX;
		}

		if (y == null) {
			y = this.posY;
		}


		if (limit) {

			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		} else {
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top);
		}

		if (setX) this.posX = x;
		if (setY) this.posY = y;
	}

	is_doing_action(action) {
		return this.queue.count() >= 1 && this.queue.getCurrentAction().action == action;
	}


	move_drag() {

		var rect = this.getRect();

		let mouse = this.parent.getLocalMouse();
		var newMousePosX = mouse.x;
		var newMousePosY = mouse.y;

		// offset where you're holding the myte from
		var x = newMousePosX - (rect.width / 2);
		var y = newMousePosY - (rect.height / 4);

		// set positions
		this.setTarget(x, y, this.limitToContainer);
		this.setPosition(x, y, this.limitToContainer);
		this.setSpritePosition(x, y, this.limitToContainer);

		// Add the "dragging" class to the draggable element when dragging
		this.duplicate.classList.add("dragging");

		// Check if the draggable element is touching the drop target
		const dropTargetRect = this.parent.getRect(this.dropTarget);
		if (Utility.is_coord_touching_element(this.parent.mousePosX, this.parent.mousePosY, dropTargetRect)) {
			this.dropTarget.classList.add("on-target");
		} else {
			this.dropTarget.classList.remove("on-target");
		}

		this.dropTarget.classList.add("valid-drop-target");

	}




	doFreeRoamLogic() {

		var inWhere = this.limitToContainer ? this.parent.element : null;

		let random = Math.random();

		if (random < 0.1 && this.startTime > 10000) {
			// idle
			// this.queue.addIdle(500);

		} else if (random < 0.3) {
			// jump
			this.do_jump();

		} else if (random < 0.5) {
			// move to random element
			console.log("random move");

			let e = Utility.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);

			if (e) {
				this.queue.addMoveToElement(e);
			} else {
				// go somewhere random (optional logic here)
			}

			// take a rest after moving
			// this.queue.addIdle(500);

		} else if (random < 0.7) {
			// get random mapObject
			let e = this.getRandomNearbyObject(500, true);
			if (e) {
				e.press(this.parent);
			}


		} else {
			// run laps
			console.log("run laps");
			let e = Utility.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);

			if (e) {
				this.queue.addRunLaps(e);
				this.queue.addMoveToElement(e);
			} else {
				// go somewhere random (optional logic here)
			}

			// take a longer rest after moving
			// this.queue.addIdle(1000);
		}
	}


	getRandomNearbyObject(range, returnClosest = false) {
		const nearbyObjects = this.parent.mapArea.objects.filter(obj => {
			const distanceX = Math.abs(this.posX - obj.posX);
			const distanceY = Math.abs(this.posY - obj.posY);
			return obj !== this && obj.active && distanceX <= range && distanceY <= range;
		});

		if (nearbyObjects.length > 0) {
			if (returnClosest) {
				let closestObject = nearbyObjects[0];
				let closestDistance = Math.hypot(this.posX - closestObject.posX, this.posY - closestObject.posY);

				nearbyObjects.forEach(obj => {
					const distance = Math.hypot(this.posX - obj.posX, this.posY - obj.posY);
					if (distance < closestDistance) {
						closestDistance = distance;
						closestObject = obj;
					}
				});

				return closestObject;
			} else {
				const randomIndex = Math.floor(Math.random() * nearbyObjects.length);
				return nearbyObjects[randomIndex];
			}
		}

		return null; // If no nearby object is found
	}





	/********************************************
	 * movement - gravity
	********************************************/

	// Add a method to adjust physics based on character type
	adjustPhysicsForCharacter() {
		// Base values are already set in initPhysicsConfig

		// Apply any stat-based modifications
		if (this.stats) {
			// Example: Adjust jump height based on stats
			const jumpStat = this.stats.getJumpStat ? this.stats.getJumpStat() : 1.0;
			this.physics.jumpHeight *= jumpStat;

			// Adjust movement and control based on agility
			const agilityStat = this.stats.getAgilityStat ? this.stats.getAgilityStat() : 1.0;
			this.physics.airControl *= agilityStat;
		}
	}


	getFeetPosition() {
		return this.posY + (this.collider?.offsetY || 0) + (this.collider?.height || this.size.height);
	}

	getColliderTopEdge(collider) {
		return collider.posY + (collider.collider?.offsetY || 0);
	}

	isStandingOnCollider(collider) {
		const feetY = this.getFeetPosition();
		const platformY = this.getColliderTopEdge(collider);
		return Math.abs(feetY - platformY) < 2; // 2px tolerance
	}

	createCollisionEntity(x, y) {
		return {
			posX: x,
			posY: y,
			collider: this.collider,
			size: this.size
		};
	}

// Update checkMovementCollision to handle potential null values
checkMovementCollision(newX, newY, colliders) {
    // Default results - no collisions
    const result = {
        x: newX,
        y: newY,
        hitPlatform: false,
        hitWall: false,
        hitCeiling: false,
        didLand: false,
        standingOn: null
    };

    // Safety checks
    if (!this.collider) {
        console.warn('Myte missing collider, collision detection skipped');
        return result;
    }

    // Skip if collision checking is disabled
    if (!this.checkForCollisions || !colliders || colliders.length === 0) {
        return result;
    }

    const wasJumping = this.isJumping;
    const wasFalling = this.isFalling;

    // Check each collider for various collision types
    for (const collider of colliders) {
        // Skip if collider is invalid
        if (!collider) continue;
        
        // 1. Check for platform landing when falling
        // Platform landing when falling
        if (this.physics.velocity > 0) {
            const verticalEntity = this.createCollisionEntity(this.posX, newY);

            if (this.parent && this.parent.checkCollision(verticalEntity, collider)) {
                const colliderTop = this.getColliderTopEdge(collider);
                // Position the Myte so its collider's bottom aligns with platform top
                result.y = colliderTop - this.collider.height - this.collider.offsetY;

                result.hitPlatform = true;
                result.standingOn = collider;

                if (wasFalling || wasJumping) {
                    result.didLand = true;
                }
                continue;
            }
        }

        // 2. Check for ceiling collision when jumping upward
        if (this.physics.velocity < 0) {
            // Create collision entity that correctly represents the Myte's collision area
            const ceilingEntity = this.createCollisionEntity(newX, newY);

            if (this.parent && this.parent.checkCollision(ceilingEntity, collider)) {
                result.hitCeiling = true;

                // Calculate correct position considering collider offset
                // The collider's top is at: newY + this.collider.offsetY
                // We want this to be just below the obstacle's bottom
                const colliderBottom = collider.posY + collider.size.height;
                // Set the Myte's position so its collider top is at the obstacle bottom
                result.y = colliderBottom - this.collider.offsetY;

                continue;
            }
        }

        // 3. Check for wall collision with step-up handling
        if (newX !== this.posX && !result.hitWall) {
            // Skip wall check if we're standing on this platform
            if (!this.isStandingOnCollider(collider)) {
                const horizontalEntity = this.createCollisionEntity(newX, this.posY);

                if (this.parent && this.parent.checkCollision(horizontalEntity, collider)) {
                    // Check if we can step up onto this platform
                    const stepUpY = this.posY - this.physics.stepHeight;
                    const stepEntity = this.createCollisionEntity(newX, stepUpY);

                    if (this.isOnSolidGround && // Only allow step up if on ground
                        this.parent && !this.parent.checkCollision(stepEntity, collider)) {
                        // We can step up onto this platform
                        result.y = stepUpY;
                    } else {
                        // Can't step up, treat as wall collision
                        result.hitWall = true;
                        result.x = this.posX;
                    }
                }
            }
        }
    }

    return result;
}


	handleTrappedState(newX, newY, isTrapped) {
		if (!isTrapped) return { x: newX, y: newY };

		// If we haven't moved in several frames, we might be trapped
		if (this.stuckFrames > 5) {
			// Try to move the character up slightly to escape
			return {
				x: this.posX,
				y: this.posY - this.physics.stepHeight
			};
		}

		// Count frames where we're not moving despite trying to
		if (Math.abs(newX - this.posX) < 0.1 && Math.abs(newY - this.posY) < 0.1) {
			this.stuckFrames++;
		} else {
			this.stuckFrames = 0;
		}

		return { x: newX, y: newY };
	}


	applyGravity() {
		// Apply gravity with slight adjustments for rising/falling
		let newVelocity = this.physics.velocity;

		if (this.isOnSolidGround) {
			// On ground, reset velocity
			newVelocity = 0;
		} else {
			// In air, apply gravity
			const gravityMultiplier = newVelocity > 0 ? 1.1 : 0.9; // Faster falling than rising
			newVelocity += this.physics.gravity * gravityMultiplier;

			// Apply terminal velocity
			if (newVelocity > this.physics.terminalVelocity) {
				newVelocity = this.physics.terminalVelocity;
			}
		}

		return newVelocity;
	}



// Add similar defensive checks to move_gravity
move_gravity() {
    // Get current dimensions and positions
    const limit_ground = this.parent.getCanvasRect().height;
    const limit_ceiling = 0;

    // Cache collider values to avoid repeated conditionals
    const colliderOffsetY = this.collider.offsetY || 0;
    const colliderHeight = this.collider.height;

    // Remember previous state
    const wasJumping = this.isJumping;
    const wasFalling = this.isFalling;

    // Calculate the POTENTIAL new position based on gravity
    this.physics.velocity = this.applyGravity();
    let newY = this.posY + this.physics.velocity;

    // Handle horizontal movement (with air control)
    // This could be optimized further if expensive
    this.updateTargetToFollowMouse(true, true);
    const dx = this.targetX - this.posX;
    const controlFactor = this.isOnSolidGround ? 1.0 : this.physics.airControl;
    const moveDistance = this.stats.getSpeed() * controlFactor;

    // Calculate potential new horizontal position
    let newX = this.posX;
    if (Math.abs(dx) > 0.1) {
        const directionX = dx > 0 ? 1 : -1;
        newX = this.posX + directionX * Math.min(Math.abs(dx), moveDistance);
    }

    // Check container bounds - ceiling and floor
    const myteTop = newY + colliderOffsetY;
    const myteBottom = myteTop + colliderHeight;
    const isAtCeiling = newY < limit_ceiling && this.physics.velocity < 0; //  we were using myteTop here but it went over
    const isAtGround = myteBottom >= limit_ground;

    // Handle ceiling collision with container
    if (isAtCeiling) {
        newY = limit_ceiling; // original -colliderOffsetY but it was going over; // Align top edge with container ceiling
        this.physics.velocity = 0;
    }

    // Handle floor collision with container
    if (isAtGround) {
        newY = limit_ground - colliderHeight - colliderOffsetY;

        // Only trigger landing if we were actually falling or jumping
        if (wasFalling || wasJumping) {
            this.do_land_from_fall();
        }
    }

    // Get all potential colliders ONCE - with defensive check
    let potentialColliders = [];
    if (this.parent && this.parent.gameMap && this.parent.gameMap.gridSystem) {
        potentialColliders = this.parent.gameMap.gridSystem.getPotentialColliders(this);
    }

    // For fast-moving objects, consider intermediate collision checks
    // (This step is optional and depends on your game's needs)
    if (potentialColliders.length > 0 && (Math.abs(this.physics.velocity) > 10 || Math.abs(newX - this.posX) > 10)) {
        // Use ray-casting or multi-step collision checking for fast movement
        // This is a simplified example - a full implementation would check 
        // several intermediate positions
        const midY = this.posY + (this.physics.velocity / 2);
        const midCollisionResult = this.checkMovementCollision(
            this.posX + (newX - this.posX) / 2,
            midY,
            potentialColliders
        );

        if (midCollisionResult.hitCeiling || midCollisionResult.hitPlatform) {
            // Handle intermediate collision
            newY = midCollisionResult.y;
            newX = midCollisionResult.x;
            if (midCollisionResult.hitCeiling) {
                this.physics.velocity = 0;
            }
        }
    }

    // Check collisions at final position
    const collisionResult = this.checkMovementCollision(newX, newY, potentialColliders);

    // Apply the collision-adjusted positions
    newX = collisionResult.x;
    newY = collisionResult.y;

    // Consolidate velocity adjustments based on collision results
    if (collisionResult.hitCeiling) {
        this.physics.velocity = 0;
    }

    // Handle landing from platform collision
    if (collisionResult.didLand) {
        this.do_land_from_fall();
        // We've landed, so we're on solid ground
        this.isOnSolidGround = true;
    }

    // Handle being trapped between colliders if needed
    const isTrapped = this.stuckFrames > 0;
    const escapeResult = this.handleTrappedState(newX, newY, isTrapped);
    newX = escapeResult.x;
    newY = escapeResult.y;

    // Update state based on collision results and container bounds
    // Use a single consolidated check for ground state
    const isOnGround = isAtGround || collisionResult.hitPlatform;

    if (isOnGround) {
        this.isJumping = false;
        this.isFalling = false;
        this.isOnSolidGround = true;
        this.physics.velocity = 0;
    } else {
        this.isFalling = this.physics.velocity > 0;
        this.isJumping = this.physics.velocity < 0;
        this.isOnSolidGround = false;

        // Track when we left the ground for coyote time
        if (this.isOnSolidGround && this.leftGroundTime === undefined) {
            this.leftGroundTime = Date.now();
        }
    }

    // FINALLY apply the new positions after all checks and adjustments
    this.setPosition(newX, newY);
    this.setSpritePosition(newX, newY);

    // Update character direction based on movement
    if (Math.abs(dx) > 0.1) {
        this.setDirection(dx > 0 ? DIRECTION.EAST : DIRECTION.WEST);
    }

    // Reset coyote time if we're back on ground
    if (this.isOnSolidGround) {
        this.leftGroundTime = undefined;
    }
}

	isCurrentlyJumping() {
		return (this.isJumping || this.isFalling);
	}

	playSound(sound) {
		this.parent.core.soundManager.playMyteSound(sound, {
			species: this.species
		});
	}

	do_jump() {





		// Only allow jump if on solid ground OR within coyote time window
		const canJump = this.isOnSolidGround ||
			(this.leftGroundTime &&
				Date.now() - this.leftGroundTime < this.physics.coyoteTime);

		// Or if jump was buffered recently
		const hasBufferedJump = this.jumpBufferTime &&
			Date.now() - this.jumpBufferTime < this.physics.jumpBuffer;

		if (!canJump && !hasBufferedJump) {
			// Buffer this jump input for a short time
			this.jumpBufferTime = Date.now();
			return false;
		}

		// Reset jump buffer
		this.jumpBufferTime = undefined;
		this.leftGroundTime = undefined;

		// Apply initial jump velocity
		this.physics.velocity = -this.physics.jumpHeight;
		this.isJumping = true;
		this.isFalling = false;
		this.isOnSolidGround = false;

		// Apply a small horizontal boost in the direction of movement
		const dx = this.targetX - this.posX;
		if (Math.abs(dx) > 10) { // Only if we have significant horizontal movement
			const jumpBoost = this.stats.getSpeed() * 0.5;
			this.posX += (dx > 0 ? 1 : -1) * jumpBoost;
		}

		return true;
	}

	do_land_from_fall() {

		// this.playSound('land');

        this.addEffect("LANDING_DUST", {
            count: 6,              // Override: create more particles for a bigger effect
            positionAtFeet: true,  // Position at character's feet
            emitWhenMoving: false, // Override: emit regardless of movement
            oneTimeEmission: true,  // Important: emit just once instead of continuously
			loop: false
        });


		if (this.physics.velocity >= this.physics.minFallDamageVelocity) {
			this.do_touch_damage();
		}

		this.reset();
	}

	do_movement_logic() {
		if (this.isDragging) {
			return;
		}

		if (this.goal == MOVE_TYPES.GRAVITY) {
			if (!this.queue.isEmpty()) {
				this.queue.update();
			} else {
				// Handle random jumping when appropriate
				if (!this.isCurrentlyJumping()) {
					if (Math.random() < 0.2 &&
						this.parent.isMouseInContainer() &&
						this.parent.getLocalMouse().y < this.posY) {
						this.do_jump();
					}
				}
				this.move_gravity();
			}
		}
		else if (this.goal == MOVE_TYPES.FREEROAM) {
			if (this.queue.isEmpty()) {
				// Add new random actions to the queue when empty
				//this.doFreeRoamLogic();

				this.updateTargetToFollowMouse();
				this.move_toward_target();

			}
			this.queue.update();
		}
		else if (this.goal == MOVE_TYPES.FOLLOW) {
			if (this.queue.isEmpty()) {
				// If no other actions, follow the mouse
				this.updateTargetToFollowMouse();
				this.move_toward_target();


			}
			this.queue.update();
		}
		else if (this.goal == MOVE_TYPES.GOHOME) {
			if (this.atOriginal == false) {
				if (this.queue.isEmpty()) {
					// Add a move action to return home if not already moving
					const rect = this.parent.getLocalOffset(this.elements.wrapper);
					this.queue.add('move', {
						target: [{
							x: rect.left,
							y: rect.top
						}],
						onComplete: () => this.stop()
					});
				}
				this.queue.update();

			}
		}
		else if (this.goal == MOVE_TYPES.QUEUE_ONLY) {
			if (this.queue.isEmpty()) {
				this.watchCursor();
			} else {
				this.queue.update();
			}
		}
	}

	watchCursor() {
		const mouse = this.parent.getLocalMouse(this);
		const dx = mouse.x - this.posX;
		const dy = mouse.y - this.posY;
		const distanceFromMouse = Math.sqrt(dx * dx + dy * dy);

		// Configuration
		const innerRadius = 80;
		const outerRadius = 300;
		const diagonalThreshold = 0.5;

		if (distanceFromMouse >= outerRadius) {
			// Outside the outer radius, do nothing
			return;
		}

		let newDirection;

		if (distanceFromMouse < innerRadius) {
			newDirection = DIRECTION.SOUTH;
		} else {
			const absX = Math.abs(dx);
			const absY = Math.abs(dy);

			if (this.diagonalMovement &&
				absX > absY * diagonalThreshold &&
				absY > absX * diagonalThreshold) {
				// Diagonal movement
				if (dx > 0 && dy > 0) newDirection = DIRECTION.SOUTHEAST;
				else if (dx > 0 && dy < 0) newDirection = DIRECTION.NORTHEAST;
				else if (dx < 0 && dy > 0) newDirection = DIRECTION.SOUTHWEST;
				else newDirection = DIRECTION.NORTHWEST;
			} else if (absX > absY) {
				// Horizontal movement
				newDirection = dx > 0 ? DIRECTION.EAST : DIRECTION.WEST;
			} else {
				// Vertical movement
				newDirection = dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH;
			}
		}

		this.setDirection(newDirection);
	}

	getDistanceFromMouse() {
		const mouse = this.parent.getLocalMouse(this);
		const dx = mouse.x - this.posX;
		const dy = mouse.y - this.posY;
		return Math.sqrt(dx * dx + dy * dy).toFixed(2);
	}

	get_move_type(i) {
		return Utility.get_key_by_value(MOVE_TYPES, i);
	}

	get_move_follow_type(i) {
		return Utility.get_key_by_value(MOVE_FOLLOW_TYPES, i);
	}


	updateTargetToFollowMouse(doXAxis = true, doYAxis = true) {
		const mouseDistance = this.getDistanceFromMouse();

		if (this.runAway == true) {
			this.doRunAway(doXAxis, doYAxis);
		} else {
			if (mouseDistance > this.followRadius.min && mouseDistance < this.followRadius.max) {
				const mouse = this.parent.getLocalMouse(this);
				this.setTarget(
					doXAxis ? mouse.x : null,
					doYAxis ? mouse.y : null,
					this.limitToContainer
				);
			}
		}
	}

	doRunAway(doXAxis = true, doYAxis = true) {

		const mouseDistance = this.getDistanceFromMouse();
		let rect = this.getRect();

		if (mouseDistance < this.runAway_angle_distance) { // don't move target unless we're a little far away

			let currentX = this.posX;
			let currentY = this.posY;

			const mouse = this.parent.getLocalMouse(this);

			var dx3 = mouse.x - currentX;
			var dy3 = mouse.y - currentY;

			var angle = Math.atan2(dy3, dx3) + Math.PI; // Calculate the angle between the mouse cursor and the element
			mouse.x += this.runAway_angle_distance * Math.cos(angle);
			mouse.y += this.runAway_angle_distance * Math.sin(angle);

			this.setTarget(
				doXAxis ? mouse.x : null,
				doYAxis ? mouse.y : null,
				true
			);

		}
	}


	dispose() {
		// ... existing dispose code ...
		if (this.rubbingDetector) {
			this.rubbingDetector.dispose();
		}
	}

	update_frame() {
		if (!this.isActive) return;
		this.stateMachine.update();



	}


// Add defensive check to canMoveToPosition method
canMoveToPosition(newX, newY) {
    // Check if gridSystem exists
    if (!this.parent || !this.parent.gameMap || !this.parent.gameMap.gridSystem) {
        return true; // Allow movement if we can't check grid
    }
    
    const gridSystem = this.parent.gameMap.gridSystem;
    const cellSize = gridSystem.config.cellSize;
    
    // Get collider bounds at the new position
    const left = newX + this.collider.offsetX;
    const top = newY + this.collider.offsetY;
    const right = left + this.collider.width;
    const bottom = top + this.collider.height;
    
    // Convert to grid coordinates
    const startGridX = Math.floor(left / cellSize);
    const startGridY = Math.floor(top / cellSize);
    const endGridX = Math.ceil(right / cellSize);
    const endGridY = Math.ceil(bottom / cellSize);
    
    // Check each grid cell that the collider would overlap
    for (let gridX = startGridX; gridX < endGridX; gridX++) {
        for (let gridY = startGridY; gridY < endGridY; gridY++) {
            // Check if this grid cell is within bounds and walkable
            if (gridX < 0 || gridX >= gridSystem.gridWidth || 
                gridY < 0 || gridY >= gridSystem.gridHeight ||
                !gridSystem.grid[gridX][gridY].walkable) {
                return false;
            }
        }
    }
    
    return true;
}



	update(deltaTime) {
		if (!this.isActive) return;
		
		// personal target dot
		this.update_target_dot();
	
		// movement logic
		this.do_movement_logic();
	
		// update frame
		if (this.parent && this.parent.core && deltaTime >= this.parent.core.config.frameInterval) {
			this.stats.update(deltaTime);
			this.update_frame();
			
			// Add defensive check before updating tile
			if (this.parent && this.parent.gameMap && this.parent.gameMap.gridSystem) {
				this.parent.gameMap.gridSystem.updateMyteFrontTile(this);
			}
		}
	}



}
