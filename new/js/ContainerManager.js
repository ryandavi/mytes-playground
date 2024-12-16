class ContainerManager {

	constructor(elementId, core) {
		this.core = core;
		this.mytes = [];

		this.element = document.getElementById(elementId);
		this.containerWrapper = this.element.closest('.container-wrapper');

		// mouse position
		this.mousePosX = 0;
		this.mousePosY = 0;

		this.activeMyte = null;

        // user activity
        this.lastMovementTime;
        this.inactiveAmount = 8000; // Define the inactive_amount (in milliseconds) after which you consider the user as inactive.
        this.isActive = true;

        // mouse press
        this.isMousePressed = false;
        this.pressStartTime = 0;

		// camera
		this.camera;
		// Setup the canvas
		this.canvas = this.element.querySelector('.canvas');

		this.ui = new UserInterface(this);
		this.mapObjects = new MapObjects(this);
        this.pathfinding = new PathFindingSystem(32);
		this.myteThumbnails = null;




		const itemsArray = [
			{ name: "Acorn", quantity: 1, type: "FOOD" },
			{ name: "Turnip", quantity: 5, type: "FOOD" },
			{ name: "Apple", quantity: 3, type: "FOOD" }
		];

		this.inventory = new Inventory(this, document.getElementById('inventory'));
		this.inventory.loadItems(itemsArray);

        // Add this to track ongoing interactions
        this.activeInteractions = new Map();


	}





	init(){
		console.log('init');
		this.setupMytes();

		// set mouse event for mouse coords
		document.addEventListener("mousemove", (event) => {
			this.set_mouse(event);
			this.set_last_active();
		});

		document.addEventListener("drag", (event) => {
			this.set_mouse(event);
			this.set_last_active();
		});

        document.addEventListener("click", () => {
            this.set_last_active();
        });

		window.addEventListener('scroll', (event) => {
			this.mousePosX += window.scrollX - this.lastScrollX;
			this.mousePosY += window.scrollY - this.lastScrollY;
			this.lastScrollX = window.scrollX;
			this.lastScrollY = window.scrollY;
			this.set_last_active();
		});

		document.addEventListener('mousedown', this.start_tracking_mouse_hold);
        document.addEventListener('touchstart', this.start_tracking_mouse_hold);

        document.addEventListener('mouseup', this.stop_tracking_mouse_hold);
        document.addEventListener('touchend', this.stop_tracking_mouse_hold);

		
		document.addEventListener("click", (event) => {
			// click to move to element
			if(this.activeMyte && this.activeMyte.isActive){
				console.log('container click to move to element');

				// console.log(Utility.findClosestElementToMouse(this.mousePosX, this.mousePosY, null, 1, 250, false));

				if(Utility.isClickableElement(event.target)){

					// choose randomly
					if(Math.random() < 0.5){
						this.activeMyte.queue.addRunLaps(event.target);
					}else{
						this.activeMyte.queue.addMoveToElement(event.target, 200);	
					}
					
				}
				
			}
		});
		

		this.camera = new Camera(this, this.canvas, this.element);

		// add map objects
		this.mapObjects.init();
		this.ui.init();
		this.pathfinding.init();


		this.initActiveMytes();

		// Start the animation loop
		// window.requestAnimationFrame(this.update.bind(this));

	}


	createThumbnail(myte) {
        const thumbnail = document.createElement('div');
        thumbnail.classList.add('myte-thumbnail');

		if(myte === this.activeMyte){
			thumbnail.classList.add('active');
		}
		
		thumbnail.setAttribute('data-myte-id', myte.id);
        
        // Create sprite container
        const spriteContainer = document.createElement('div');
        spriteContainer.className = 'myte-sprite';
        
        const spriteInner = document.createElement('div');
        spriteInner.className = 'myte-sprite-inner';
        spriteContainer.appendChild(spriteInner);

        // Create name element
        const name = document.createElement('span');
        name.className = 'myte-name';
        name.textContent = myte.name;

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(name);


        // Add click handler
        thumbnail.addEventListener('click', () => {
            if (myte !== this.activeMyte) {
                this.setActiveMyte(myte);
            }
        });

        return thumbnail;
    }

    initActiveMytes() {
		// find #all_mytes
		const listContainer = document.getElementById('all_mytes');

        // Add thumbnails
        if (this.mytes && this.mytes.length > 0) {
            this.mytes.forEach(myte => {
                listContainer.appendChild(this.createThumbnail(myte));
            });
        } else {
            const emptyState = document.createElement('div');
			emptyState.className = 'empty';
            emptyState.textContent = 'No Mytes found';
            listContainer.appendChild(emptyState);
        }

    }



    /********************************************
     * events - press down events
    ********************************************/

    // to start tracking when the mouse button is pressed
    start_tracking_mouse_hold = () => {
        this.isMousePressed = true;
        this.pressStartTime = Date.now();
    }

    // to stop tracking when the mouse button is released
    stop_tracking_mouse_hold = () => {
		if(this.getPressDuration() > 0){
			console.log("Held down mouse for " + this.getPressDuration() + "ms");
			this.isMousePressed = false;
			this.pressStartTime = 0;
		}
    }

    // to get the duration the mouse button has been pressed (in milliseconds)
    getPressDuration = () => {
        if (this.isMousePressed) {
            return Date.now() - this.pressStartTime;
        }
        return 0;
    }

    is_holding_down_mouse = () => {
        return this.isMousePressed;
    }

    get isClicking() {
        return this.isMousePressed;
    }

    /********************************************
     * user functions - activity
    ********************************************/

    set_last_active() {
        this.lastMovementTime = Date.now();
    }

    check_inactive() {
        const currentTime = Date.now();

        if (currentTime - this.lastMovementTime >= this.inactiveAmount) {
            if (this.isActive == true) {
                this.isActive = false;
                // User is considered inactive
                console.log('User is inactive.');
                // You can perform any actions you want here when the user is inactive.
            }
        } else {
            if (this.isActive == false) {
                this.isActive = true;
				console.log('User is active.');
            }
        }
    }


	getZIndex(y, height) {
		let maxHeight = this.getMaxDimensions().height;
		return Math.floor(((y + height) / Math.max(maxHeight, 1)) * 100);
	}


	setupMytes() {
		this.element.querySelectorAll('.myteContainer').forEach(container => {
			const wrapper = container.querySelector('.myteWrapper');
			const wrapperId = wrapper.id;
			const idNumber = wrapperId.split('-')[1];

			// create myte
			let myte = new Myte(idNumber, this, wrapper.querySelector('.interactive-myte'));

			myte.init();
			// myte.start();
			console.log(myte.id);

			// set active myte if there isnt one
			/*
			if (this.activeMyte == null) {
				this.setActiveMyte(myte);
			}else{
				myte.isFreeRoam = true;
			}
			*/

			this.mytes.push(myte);
		});
	}

	setNextMyteAsActive(previous){
		let next = null;

		if(this.mytes.length > 1){
			for (let i = 0; i < this.mytes.length; i++) {

				let myte = this.mytes[i];

				// ignore previous
				if (myte == previous) {
					continue;
				}

				// set next active myte
				if(myte.isActive){
					next = myte;
				}
				
				break;
			}
		}

		// change camera mode if there are no other mytes
		if(next == null){
			this.camera.setMode(CAMERA_FOLLOW_MODES.CURSOR_EDGE);
		}

		this.setActiveMyte(next);
	}

	setActiveMyte(myte){

		// make changes to previous active myte
		if(this.activeMyte && myte !== null){
			this.activeMyte.duplicate.classList.remove('active');
		}


		// set active myte
		this.activeMyte = myte;

		// if not setting to null
		if(myte !== null){
			this.activeMyte.duplicate.classList.add('active');
			this.activeMyte.setStartTime();
		}

		// set other mytes to free roam
		
		this.mytes.forEach(myte => {
			if(myte != this.activeMyte){
				myte.setMode(MOVE_TYPES.FREEROAM);
			}	
		});

		
		if(!myte.isActive){
			myte.start();
		}

		

		// mytes list
		const listContainer = document.getElementById('all_mytes');
		listContainer.querySelectorAll('.myte-thumbnail').forEach(thumbnail => {
			thumbnail.classList.remove('active');
		});
		listContainer.querySelector(`[data-myte-id="${myte.id}"]`).classList.add('active');


		this.ui.updateButtons();

	}

    // Add these helper methods
    startInteraction(myte1, myte2, interactionType) {
        const interactionId = `${myte1.id}-${myte2.id}`;
        if (this.activeInteractions.has(interactionId)) return false;

        this.activeInteractions.set(interactionId, {
            mytes: [myte1, myte2],
            type: interactionType,
            startTime: Date.now()
        });
        return true;
    }

    endInteraction(myte1, myte2) {
        const interactionId = `${myte1.id}-${myte2.id}`;
        this.activeInteractions.delete(interactionId);
    }


	draw_target_dot() {
		/********************************************
		 * Cursor Dot - where the cursor is (purple)
		********************************************/
		let mouse = this.getLocalMouse();
		let mousePosX = mouse.x;
		let mousePosY = mouse.y;

		var cursorElement = this.element.querySelector('.cursor-dot');
		cursorElement.style.left = mousePosX + 'px';
		cursorElement.style.top = mousePosY + 'px';

	}

	set_mouse(event) {
		var clientX = event.touches ? event.touches[0].clientX : event.clientX;
		var clientY = event.touches ? event.touches[0].clientY : event.clientY;

		this.mousePosX = clientX + document.body.scrollLeft;
		this.mousePosY = clientY + document.body.scrollTop;
	}

	getMaxDimensions() {
		const container = this.getContainerRect();
		const canvas = this.getCanvasRect();

		return {
			width: this.camera?.isScrollable.x ? canvas.width : container.width,
			height: this.camera?.isScrollable.y ? canvas.height : container.height
		};
	}

	isMouseInContainer() {
		return Utility.isIntersecting(
		  this.mousePosX,
		  this.mousePosY,
		  this.getContainerRect()
		);
	  }
	// mouse within canvas (adds camera)
	getLocalMouse(element = null) {
		const containerRect = this.getContainerRect(); // Cache container rect

		return {
			x: this.mousePosX - containerRect.left - (element ? (element.getRect().width / 2) : 0) - this.camera.posX,
			y: this.mousePosY - containerRect.top - (element ? (element.getRect().height / 2) : 0) - this.camera.posY
		};
	}

	// mouse within container
	getContainerMouse(element = null){
		const containerRect = this.getContainerRect();
		return {
			x: this.mousePosX- (element ? (element.getRect().width / 2) : 0) - containerRect.left,
			y: this.mousePosY- (element ? (element.getRect().height / 2) : 0) - containerRect.top
		}
	}

	getOffset(el) {

		let rect = el.getBoundingClientRect();

		var _x = window.scrollX;
		var _y = window.scrollY;
		while (el && !isNaN(el.offsetLeft) && !isNaN(el.offsetTop)) {
			_x += el.offsetLeft - el.scrollLeft;
			_y += el.offsetTop - el.scrollTop;
			el = el.offsetParent;
		}
		return {
			top: _y,
			left: _x,
			x: _x,
			y: _y,
			width: rect.width,
			height: rect.height,
			right: _x + rect.width,
			bottom: _y + rect.height
		};
	}

	getRect(z) {
		let rect = z.getBoundingClientRect();

		var left = rect.left + window.scrollX;
		var top = rect.top + window.scrollY;

		var width = rect.width;
		var height = rect.height;

		return {
			x: left,
			y: top,
			left: left,
			top: top,
			right: left + width,
			bottom: top + height,
			width: width,
			height: height,
		};
	}

	getCanvasRect() {
		let rect = this.getRect(this.canvas);
		var dimensions = Utility.findLargestChildDimensions(this.canvas);

		return {
			left: rect.left,
			top: rect.top,
			width: dimensions.width,
			height: dimensions.height
		}

	}


	getVisibleElements() {
		// Get all elements on the page
		const allElements = document.getElementsByTagName('*');
		const visibleElements = [];
	
		// Get container and canvas rectangles
		const containerRect = this.getContainerRect();
		const canvasRect = this.getCanvasRect();
	
		// Iterate through all elements
		for (let element of allElements) {
			// Check if the element is within .container>.canvas
			if (this.canvas.contains(element)) {
				// Get element's bounding rectangle
				const elementRect = element.getBoundingClientRect();
	
				// Calculate element's position relative to the canvas
				const relativeLeft = elementRect.left - canvasRect.left + this.camera.posX;
				const relativeTop = elementRect.top - canvasRect.top + this.camera.posY;
	
				// Check if the element is within the view of the camera
				if (
					relativeLeft + elementRect.width > 0 &&
					relativeLeft < containerRect.width &&
					relativeTop + elementRect.height > 0 &&
					relativeTop < containerRect.height
				) {
					// Element is visible, don't add it to the list
					continue;
				}
			}
	
			// If we've reached here, the element is either not in .container>.canvas
			// or not visible within the camera view
			visibleElements.push(element);
		}
	
		return visibleElements;
	}
	
	getContainerRect() {
		return this.getRect(this.element);
	}

	getLocalOffset(el, offsetToCenterElement = null){
		let rect = this.getOffset(el);

		let container = this.getContainerRect();

		rect.y -= container.top;
		rect.x -= container.left;


		return {
			x: rect.x,
			y: rect.y,
			left: rect.x,
			top: rect.y,
			right: rect.x + rect.width,
			bottom: rect.y + rect.height,
			width: rect.width,
			height: rect.height
		}

	}



    update(deltaTime) {

		this.draw_target_dot();

        // Check for user inactivity
        if (Date.now() - this.lastMovementTime > this.core.config.inactiveTimeout) {
            if (this.isActive) {
                this.isActive = false;
                console.log('User is inactive');
            }
        } else if (!this.isActive) {
            this.isActive = true;
            console.log('User is active');
        }

        // Update components
        this.mytes.forEach(myte => {
            if (myte.isActive) {
                myte.update(deltaTime);
            }
        });

        if (this.camera) this.camera.update();
        if (this.ui) this.ui.update();
        if (this.objects) this.objects.update();
    }



    dispose() {
        this.mytes.forEach(myte => {
            myte.dispose();
        });
        this.mytes.clear();
        this.activeMyte = null;
        
        if (this.camera) {
            this.camera.dispose();
            this.camera = null;
        }
        
        if (this.ui) {
            this.ui.dispose();
            this.ui = null;
        }
        
        if (this.objects) {
            this.objects.dispose();
            this.objects = null;
        }
    }



}


/*
window.addEventListener('load', function () {
	let user = new Container(document.getElementById('container-1'));
	user.init();
});
*/