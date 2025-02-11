

/**
 * CollisionHandler class
 * - Responsibilities:
 *   - Check for collisions with other elements
 *   - Handle collision responses
 * - Methods to include:
 *   - checkCollisions()
 *   - handleCollision()
 */

/**
 * StateManager class
 * - Responsibilities:
 *   - Manage state transitions
 *   - Update current state
 * - Methods to include:
 *   - setNewState()
 *   - update_frame()
 */

/**
 * AnimationController class
 * - Responsibilities:
 *   - Manage animations and expressions
 * - Methods to include:
 *   - do_expression()
 *   - updateAnimation()
 */

/**
 * HealthManager class
 * - Responsibilities:
 *   - Manage health and damage
 * - Methods to include:
 *   - do_touch_damage()
 *   - updateHealth()
 */

/**
 * UIController class
 * - Responsibilities:
 *   - Manage UI elements (target dot, sprite positioning)
 * - Methods to include:
 *   - createTargetDot()
 *   - update_target_dot()
 *   - setSpritePosition()
 */

/**
 * QueueManager class
 * - Responsibilities:
 *   - Manage action queue
 * - Methods to include:
 *   - addIdle()
 *   - addMoveToElement()
 *   - addRunLaps()
 *   - doCurrentAction()
 */

class MyteInputHandler {

	/**
	 * InputHandler  class
	 * - Responsibilities:
	 *   - Handle user input (mouse events, drag and drop)
	 * - Methods to include:
	 *   - handle_drag_start()
	 *   - handle_drag_move()
	 *   - handle_drag_end()
	 *   - move_drag()
	 */

	constructor(myte) {
		this.myte = myte;
	}
}

class MovementController {

	/**
	 * MovementController 
	 * - Responsibilities:
	 *   - Handle different movement types (follow, free roam, gravity, go home)
	 *   - Update position and target
	 *   - Implement movement logic (move_toward_target, move_gravity, etc.)
	 * - Methods to include:
	 *   - do_movement_logic()
	 *   - move_toward_target()
	 *   - move_gravity()
	 *   - updateTargetToFollowMouse()
	 *   - doFreeRoamLogic()
	 */

	constructor(myte) {
		this.myte = myte;
	}
}

class Myte {

	constructor(id, parent, element) {
		this.id = id;
		this.species = "snail";
		this.health = 100;
		this.name = element.dataset.myteName;

		this.parent = parent;
		this.element = element;
		this.isActive = false;

		this.direction = DIRECTION.SOUTH;
		this.diagonalMovement = false;

		// this character's elements
		this.duplicate;
		this.collider;
		this.sprite;
		this.targetDot;
		this.dropTarget;

		// speed
		this.speed = .5;
		this.velocity = 0;

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
		this.limitToContainer = false;

		this.size = {
			width: 96,
			height: 96
		};

		this.followRadius = {
			min: 192/2,
			max: 192*2
		}

        // gravity-based
        this.isJumping = false;
        this.isFalling = false;
        this.velocity = 0;
		this.gravity = .1;
        this.jumpHeight = 5;
        this.min_gravity_damage_height = 22;

		this.startTime = null;
		
		this.runAway_angle_distance = 300;

		this.movementController = new MovementController(this);

	}

	update_target_dot() {
		this.targetDot.style.left = (this.targetX + this.getRect().width / 2) + 'px';
		this.targetDot.style.top = (this.targetY + this.getRect().height / 2) + 'px';

	}

	init() {
		/********************************************
		 * duplicated element
		********************************************/
		this.duplicate = this.element.cloneNode(true);
		this.duplicate.classList.add("freemode"); // free mode is when it can fly around
		this.duplicate.classList.add("duplicate"); // free mode is when it can fly around
		this.duplicate.id = "duplicate-" + this.duplicate.id;

		// add it
		this.element.parentNode.insertBefore(this.duplicate, this.element.nextSibling); // insert new

		// elements
		this.collider = this.duplicate.querySelector('.collidebox');
		this.sprite = this.duplicate.querySelector('.sprite');
		this.dropTarget = this.element.closest(".myteWrapper");

		this.duplicate.classList.add("deactivated"); // hide the original element
		

		// create dots
		this.createTargetDot();

		// add functions
		this.queue = new MyteQueue(this);
		this.stateMachine = new StateMachine(this, DEFAULT_STATE);

		// temp - make it a snail
		this.stateMachine.setSnail();

		// position
		let rect = this.parent.getOffset(this.element);
		const offsetX = rect.x - this.parent.getContainerRect().x;
		const offsetY = rect.y - this.parent.getContainerRect().y;
		this.setTarget(offsetX, offsetY);
		this.setPosition(offsetX, offsetY);
		this.setSpritePosition(this.posX, this.posY);



        /********************************************
         * MAKE MYTE DRAGGABLE
        ********************************************/
        this.duplicate.addEventListener("mousedown", this.handle_drag_start);
        this.duplicate.addEventListener("touchstart", this.handle_drag_start);

        /********************************************
         * CLICK EVENTS
        ********************************************/
		this.dropTarget.addEventListener("click", (event) => {
			if(this.isActive){
				//return home
				this.setMode(MOVE_TYPES.GOHOME);
			}
		});

		this.element.addEventListener("click", (event) => {
			event.stopPropagation();

			if(!this.isActive){
				this.start();
				this.parent.setActiveMyte(this);
			}
		});
			

		this.duplicate.addEventListener("click", (event) => {
			event.stopPropagation();
		
			if (this.isActiveMyte){
				// if it's active, and not dragging, go home
				if(this.isActive && !this.isDragging && this.parent.getPressDuration() < 100) {
					this.setMode(MOVE_TYPES.GOHOME);
					console.log("home from click this");
				}
			} else {
				// set active myte if its not actvie on click
				this.parent.setActiveMyte(this);
			}
		});

		// for dragging - we dont want to allow it for a few seconds
		this.setStartTime();
		

	}


	
	setStartTime(){
		this.startTime = Date.now();
	}

	canDrag(){
		return Date.now() - this.startTime > 1000;
	}

	stop(){
		console.log('stop inside stop func');
		this.isActive = false;

        var rect = this.parent.getLocalOffset(this.element);
        this.posX = rect.left;
        this.posY = rect.top;
		this.setSpritePosition(this.posX, this.posY);

		
		this.atOriginal = true;
		// this.duplicate.remove();
		this.element.classList.remove("deactivated");
		this.duplicate.classList.remove("active");
		this.duplicate.classList.add('deactivated');
		this.element.closest('.myteContainer').classList.remove('empty');

		// target dot
		console.log('target dot hide at stop');
		this.targetDot.classList.add('hidden');

		// set next as active
		this.parent.setNextMyteAsActive(this);
		if(this.parent.activeMyte == null){
			this.parent.userInterface.disableButtons();
		}
	}

	start() {
		this.isActive = true;

		this.element.classList.add("deactivated"); // hide the original element
		this.element.closest('.myteContainer').classList.add('empty');
		this.duplicate.classList.remove("deactivated"); // show the duplicate element

		// show dot
		this.targetDot.classList.remove('hidden');

		// modes
		this.setMode();
		this.setFollowMode();

		// set start time - we need this to disable dragging for a few seconds at start
		this.setStartTime();

		if(this.parent.userInterface.isActive == false){
			this.parent.userInterface.enableButtons();
		}
		
	}

    setFollowMode(newGoal = null) {

        if (newGoal == null) {
            newGoal = this.followGoal;
        }

        this.followGoal = newGoal;

		this.parent.userInterface.updateFollowMode(document.getElementById("cycleFollowGoal"));

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



		this.parent.userInterface.updateGoal(document.getElementById("cycleGoal"));

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

        var rect = this.parent.getLocalOffset(this.element);

        this.targetX = rect.left;
        this.targetY = rect.top;
    }

	get isActiveMyte(){
		return this == this.parent.activeMyte;
	}

    /********************************************
     * events - hover
    ********************************************/

    do_hover_event = () => {
        return;
    }

    /********************************************
     * events - drag
    ********************************************/
    handle_drag_start = (event) => {

		if(this.isActiveMyte && this.isActive && this.canDrag()){
			this.isDragging = true;
			this.parent.camera.setMode(CAMERA_FOLLOW_MODES.CHARACTER);
			this.reset();
	
			// add drag listeners
			document.addEventListener("mousemove", this.handle_drag_move);
			document.addEventListener("touchmove", this.handle_drag_move);
			document.addEventListener("scroll", this.handle_drag_move);
			document.addEventListener("mouseup", this.handle_drag_end);
			document.addEventListener("touchend", this.handle_drag_end);

			// hide target dot
			this.targetDot.classList.add('hidden');
		}
    }

    handle_drag_move = () => {
        this.move_drag();
    }

    handle_drag_end = () => {
        this.queue.clear();

		this.parent.camera.setToPreviousMode();

        this.isDragging = false;
        this.sprite.style.transform = '';
        this.duplicate.classList.remove("dragging");

        if (this.goal == MOVE_TYPES.GOHOME) this.setMode(this.previousGoal);

		this.dropTarget.classList.remove("valid-drop-target");
		this.dropTarget.classList.remove("on-target");

		// remove drag listeners
        document.removeEventListener("mousemove", this.handle_drag_move);
        document.removeEventListener("touchmove", this.handle_drag_move);
		document.removeEventListener("scroll", this.handle_drag_move);
        document.removeEventListener("mouseup", this.handle_drag_end);
        document.removeEventListener("touchend", this.handle_drag_end);

		// target dot
		console.log('show target dot drag end')
		this.targetDot.classList.remove('hidden');

        if (this.dropTarget.classList.contains("on-target")) {
            // place it into drop target slot
            console.log('deactivate');
			this.stop();
        }


    }


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

		
		element.dataset.name = this.name;

		// Store the element in this
		this.targetDot = element;
	}


	getRect() {
		return this.parent.getRect(this.duplicate);
	}

	reset() {
		this.velocity = 0; // Reset velocity to zero once it stops falling
		this.isJumping = false;
		this.isFalling = false;
	}

	is_moving() {

		if(this.is_at_target()) return false;
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;
		var distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > 0) { // this.get_speed();
			return true;
		}

		return false;
	}


	is_at_target() {
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;
		var distance = Math.sqrt(dx * dx + dy * dy);
		return distance <= 0.5; // this.get_speed();
	}

	setDirection(direction){
		if(direction != this.direction){
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

	get_speed() {
		return this.speed;
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
	move_toward_target(doXAxis = true, doYAxis = true) {
		var dx = this.targetX - this.posX;
		var dy = this.targetY - this.posY;

		var distance = Math.sqrt(dx * dx + dy * dy);

		var tempPosX = this.posX;
		var tempPosY = this.posY;

		let extraX = 0;
		let extraY = 0;

		if (distance !== 0) {
			extraX = (dx / distance) * this.get_speed();
			extraY = (dy / distance) * this.get_speed();

			tempPosX += extraX;
			tempPosY += extraY;
		}

		var collidedX = false;
		var collidedY = false;
		var closestColliderX = null;
		var closestColliderY = null;

		// check colliders
		if (this.checkForCollisions) {
			var colliders = document.querySelectorAll('.collider');
			var myte = this.parent.getRect(this.collider);
			var myteX = { ...myte, left: myte.left + extraX, right: myte.right + extraX };
			var myteY = { ...myte, top: myte.top + extraY, bottom: myte.bottom + extraY };

			for (var i = 0; i < colliders.length; i++) {
				var collider = colliders[i];

				// Skip collision check if collider is a child of this.duplicate
				if (Utility.isDescendant(collider, this.duplicate)) {
					continue;
				}

				var colliderRect = this.parent.getRect(collider);

				if (Utility.isCollision(myteX, colliderRect)) {
					collidedX = true;
					closestColliderX = closestColliderX || colliderRect;
					closestColliderX = Math.abs(myteX.left - colliderRect.right) < Math.abs(myteX.left - closestColliderX.right) ? colliderRect : closestColliderX;
				}

				if (Utility.isCollision(myteY, colliderRect)) {
					collidedY = true;
					closestColliderY = closestColliderY || colliderRect;
					closestColliderY = Math.abs(myteY.top - colliderRect.bottom) < Math.abs(myteY.top - closestColliderY.bottom) ? colliderRect : closestColliderY;
				}
			}
		}

		// Update position and snap to edge if colliding
		if (!collidedX && doXAxis) {
			this.posX = tempPosX;
		} else if (collidedX && closestColliderX) {
			// Snap to the edge of the collider
			// this.posX = extraX > 0 ? closestColliderX.left - myte.width : closestColliderX.right;
		}

		if (!collidedY && doYAxis) {
			this.posY = tempPosY;
		} else if (collidedY && closestColliderY) {
			// Snap to the edge of the collider
			// this.posY = extraY > 0 ? closestColliderY.top - myte.height : closestColliderY.bottom;
		}

		// If the distance is small enough, snap to the original position
		if (distance < this.get_speed()) {
			this.snap_position_to_target(doXAxis, doYAxis);
		}

		this.setDirection(this.getDirection());
		
		// set element position
		this.setSpritePosition(this.posX, this.posY);
	}


	setSpritePosition(x = null, y = null, limit = false) {

		let setX = (x ==null ? false : true);
		let setY = (y ==null ? false : true);

		if(x == null){
			x = this.posX;
		}

		if(y == null){
			y = this.posY;
		}


		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();

		let container = this.parent.getContainerRect();

		if(limit){
			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		}else{
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top);
		}

		
		
		if(setX) this.duplicate.style.left = x.toFixed(0) + 'px';
		if(setY){
			this.duplicate.style.top = y.toFixed(0) + 'px';
			this.setZIndex(y);
		}
	}

	setZIndex(y){
		let offset = -(192/2);
		let extra = this.isCurrentlyJumping() ? this.velocity : 0;

		this.duplicate.style.zIndex = this.parent.getZIndex(y, extra+this.size.height-offset);

	}

	setTarget(x = null, y = null, limit = false) {

		let setX = (x ==null ? false : true);
		let setY = (y ==null ? false : true);

		if(x == null){
			x = this.targetX;
		}

		if(y == null){
			y = this.targetY;
		}

		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();
		let container = this.parent.getContainerRect();

		if(limit){
			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		}else{
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top - 100);
		}


		if(setX) this.targetX = x;
		if(setY) this.targetY = y;
	}

	setPosition(x = null, y = null, limit = false) {
		let maxDimensions = this.parent.getMaxDimensions();
		let rect = this.getRect();
		let container = this.parent.getContainerRect();

		let setX = (x ==null ? false : true);
		let setY = (y ==null ? false : true);

		if(x == null){
			x = this.posX;
		}

		if(y == null){
			y = this.posY;
		}


		if(limit){

			x = Math.max(x, 0);
			y = Math.max(y, 0);
			x = Math.min(x, maxDimensions.width - rect.width);
			y = Math.min(y, maxDimensions.height - rect.height);
		}else{
			// full page
			x = Math.max(x, -container.left);
			y = Math.max(y, -container.top);
			x = Math.min(x, window.outerWidth - rect.width - container.left);
			y = Math.min(y, document.documentElement.scrollHeight - rect.height - container.top);
		}

		if(setX) this.posX = x;
		if(setY) this.posY = y;
	}

	is_doing_action(action) {
		return this.queue.count() >= 1 && this.queue.getCurrentAction().action == action;
	}

	



	setNewState() {
		// default
		let newState = 'idle_' + this.direction;
	
		// Handle movement
		if (this.is_moving() && !this.isDragging) {

			newState = 'moving_' + this.direction; // this.getDirection();
		}
	
		// Handle gravity effects
		if (this.isGravity) {
			if (this.isFalling) {
				newState = 'falling';
			} else if (this.isJumping) {
				newState = 'jumping';
			}
		}
	
		// Handle expressions
		if (this.is_doing_action('do_expression')) {
			const currentAction = this.queue.getCurrentAction();
			if (this.stateMachine.currentFrameIndex === -1) {
				this.queue.removeCurrentAction();
			} else {
				newState = currentAction.action_type;
			}
		}
	
		// Handle slide down action
		if (this.is_doing_action('slide_down') && this.queue.getCurrentAction().current_target_index > 0) {
			newState = 'slide_down';
		}
	
		// Handle dragging
		if (this.isDragging) {
			if (this.stateMachine.currentState !== 'pickup' && this.stateMachine.currentState !== 'dragging') {
				newState = 'pickup';
			} else if (this.stateMachine.currentState === 'pickup' && this.stateMachine.currentFrameIndex === -1) {
				newState = 'dragging';
			} else {
				newState = this.stateMachine.currentState;
			}
		}
		
		// handle dropping
		if(!this.isDragging && (this.stateMachine.currentState == 'dropping' || this.stateMachine.currentState == 'dragging' || this.stateMachine.currentState == 'pickup')) {

			if(this.isGravity && this.isFalling){
				// if gravity is enabled and the character is falling
				newState = 'falling';
			}else{
				// if gravity is not enabled, transition to dropping
				newState = 'dropping';
				// Check if dropping animation has completed
				if (this.stateMachine.currentState === 'dropping' && this.stateMachine.isAnimationComplete()) {
					newState = 'idle';  // Or any other appropriate state after dropping
				}
			}

		}
	
		// Ensure idle state is respected when explicitly set
		if (this.is_doing_action('idle')) {
			newState = 'idle';
		}


		// Set the new state
		this.stateMachine.setState(newState);
	}

	update_frame() {
		this.setNewState();
		this.stateMachine.update();
	}


    move_drag() {
        // this.do_drag_swinging();

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
			this.queue.addIdle(500);
	
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
			this.queue.addIdle(500);
	
		} else if (random < 0.7) {
			// get random mapObject
			let e = this.getRandomNearbyObject(500, true);
			if(e){
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
			this.queue.addIdle(1000);
		}
	}
	

	getRandomNearbyObject(range, returnClosest = false) {
		const nearbyObjects = this.parent.mapArea.objects.filter(obj => {
			const distanceX = Math.abs(this.posX - obj.position.x);
			const distanceY = Math.abs(this.posY - obj.position.y);
			return obj !== this && obj.active && distanceX <= range && distanceY <= range;
		});
		
		if (nearbyObjects.length > 0) {
			if (returnClosest) {
				let closestObject = nearbyObjects[0];
				let closestDistance = Math.hypot(this.posX - closestObject.position.x, this.posY - closestObject.position.y);
	
				nearbyObjects.forEach(obj => {
					const distance = Math.hypot(this.posX - obj.position.x, this.posY - obj.position.y);
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

    move_gravity() {

        var rect = this.getRect();
        let limit_height = this.parent.getCanvasRect().height;


		let pixelPositionY = this.posY;

        // Apply gravity to the velocity (limited by maxGravity)
        this.velocity += this.gravity;

        // Update the pixel-based position
        pixelPositionY += this.velocity;

        // Check if the element has reached the bottom of the screen
        if (pixelPositionY >= limit_height - rect.height) {
            pixelPositionY = limit_height - rect.height;
            this.do_land_from_fall();
        } else {
            // falling or jumping
            this.isFalling = this.velocity > 0;
            this.isJumping = this.velocity < 0;
        }

        // set position (Y only)
		this.setPosition(null, pixelPositionY);

        // set sprite position (Y only)
		this.setSpritePosition(null, pixelPositionY);

        // move toward target (all directions)
		this.updateTargetToFollowMouse();
		this.move_toward_target(true, false);
    }

    isCurrentlyJumping() {
        return (this.isJumping || this.isFalling);
    }

    do_touch_damage(i = 0) {
        this.health -= i;
        this.queue.addExpression("fall"); 
        this.queue.addIdle(50);
    }

    do_jump() {
        this.velocity = -this.jumpHeight; // Adjust jump velocity as needed
        this.isJumping = true;
        console.log("jump");
    }

    do_land_from_fall() {

        if (this.velocity >= this.min_gravity_damage_height) {
            this.do_touch_damage();
        }

        this.reset();
    }


	do_movement_logic() {
        if (this.isDragging) {
            return;
        }

		if (this.goal == MOVE_TYPES.GRAVITY) {
            /********************************************
             * GRAVITY
            ********************************************/
            if (!this.queue.isEmpty()) {
                // if we have a queue item, do it
                this.queue.doCurrentAction();
            } else {

                // Jumping
                if (!this.isCurrentlyJumping()) {
                    // Simulate a jump (randomly)
                    if (Math.random() < 0.01) { // Adjust the probability of jumping

						// Check if the mouse is in the container and above character
						if(this.parent.isMouseInContainer() && this.parent.getLocalMouse().y < this.posY){
							this.do_jump();
						}
                        
                    }
                }

                this.move_gravity();
            }

		}else if (this.goal == MOVE_TYPES.FREEROAM) {
            /********************************************
             * FREE ROAM - CHOOSE ITS OWN MOVEMENTS
            ********************************************/
            if (this.queue.isEmpty()) {
                // no current queue item - do random roaming
                this.doFreeRoamLogic();
				if(!this.queue.isDoingAction){
					this.queue.prepCurrentAction();
				}
            }else{
				var current_queue = this.queue.getCurrentAction();
				if (current_queue !== null) {
					this.queue.doCurrentAction();
				}
			}


		} else if (this.goal == MOVE_TYPES.FOLLOW){
            /********************************************
             * FOLLOW USER MOUSE
            ********************************************/
			if (this.queue.isEmpty()) {
				this.updateTargetToFollowMouse();
				this.move_toward_target();

			} else {

				if(!this.queue.isDoingAction){
					this.queue.prepCurrentAction();
				}

				this.queue.doCurrentAction();
			}
        } else if (this.goal == MOVE_TYPES.GOHOME) {
            /********************************************
             * NO MODE - it should be at its home
            ********************************************/
            if (this.atOriginal == false) {
                // if it's not at original position, do_current_queue_element it back
                this.move_toward_target();

                if (this.is_at_target()) {
                    this.stop();
                }
            }
        } else if (this.goal == MOVE_TYPES.QUEUE_ONLY) {
			// do nothing
            if (this.queue.isEmpty()) {
				this.watchCursor();
            }else{
				if(!this.queue.isDoingAction){
					this.queue.prepCurrentAction();
				}
				
                // if we have a queue item, do it
                this.queue.doCurrentAction();
			}

		}else{
			// do nothing
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
        }else{
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
			var dy3 = mouse.y  - currentY;

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

	update(time) {
		// personal target dot
		this.update_target_dot();



		// movement logic
		this.do_movement_logic();

	}
}
