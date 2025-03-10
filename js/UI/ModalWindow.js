
class ModalWindow {

	static activeWindows = [];

constructor(parent, options = {}) {
    this.parent = parent;
    this.container = parent.container;
    this.config = parent.config;

    // Default options
    this.options = Object.assign({
        id: null,                  // ID of the modal element
		floating: true, 			// if it's fixed
		buttonId: null,
		title: 'Modal',            // Title of the modal
        closeOnOutsideClick: true, // Close when clicking outside the modal
        autoInit: true,            // Initialize on construction
        animationDuration: 300,    // Animation duration in ms
        position: 'center',        // center, top-right, bottom-left, etc.
        draggable: false,          // Allow dragging the modal
        resizable: false,          // Allow resizing the modal
        onOpen: null,              // Callback when modal opens
        onClose: null,             // Callback when modal closes
        closeButtonSelector: '.modal-close-btn', // Selector for close button
        allowMultipleWindows: false // Allow multiple windows to be open at once
    }, options);

    // Element references
    this.modalElement = null;
    this.closeButton = null;

    // State
    this.isVisible = false;
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = { x: 0, y: 0 };  // Track current position

    // Bind methods to maintain correct 'this' context
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.toggle = this.toggle.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);

    // Initialize if autoInit is true
    if (this.options.autoInit) {
        this.init();
    }
}

	/**
	 * Initialize the modal window
	 */
	init() {
		// Find modal element
		if (this.options.id) {
			this.modalElement = document.getElementById(this.options.id);



			if (!this.modalElement) {
				console.warn(`Modal element with id '${this.options.id}' not found`);
				return;
			}

			if(this.options.floating) {
				this.modalElement.classList.add('floating');
			}

			if(this.options.buttonId) {



				this.buttonElement = document.getElementById(this.options.buttonId);

				if (!this.buttonElement) {
					console.warn(`Button with id '${this.options.id}' for modal element with id '${this.options.id}' not found`);
					return;
				}

				// Clear any existing listeners
				this.buttonElement.onclick = null;
				this.buttonElement.oncontextmenu = null;

				this.buttonElement.oncontextmenu = (e) => {
					this.buttonRightClick(e);
				};
		
				this.buttonElement.onclick = (e) => {
					this.buttonLeftClick(e);
				};
	
			}


			// Find close button
			this.closeButton = this.modalElement.querySelector(this.options.closeButtonSelector);

			// Set up event listeners
			this.setupEventListeners();

			// Apply initial positioning
			this.applyPosition();
		} else {
			console.warn('No modal ID provided');
		}
	}


	buttonLeftClick(e){
		return;
	}

	buttonRightClick(e){
		return;
	}
	/**
	 * Set up event listeners for the modal
	 */
	setupEventListeners() {
		// Close button click handler
		if (this.closeButton) {
			this.closeButton.onclick = () => this.close();
		}

		// Outside click handler (will be added/removed when modal opens/closes)
		if (this.options.closeOnOutsideClick) {
			// We'll add this when the modal opens
		}

		// Draggable setup
		if (this.options.draggable && this.modalElement) {
			const header = this.modalElement.querySelector('.modal-header') || this.modalElement;
			header.style.cursor = 'move';
			header.onmousedown = this.handleDragStart;
		}
	}

	/**
	 * Handle drag start event
	 * @param {MouseEvent} e - Mouse event
	 */

		handleDragStart(e) {
			if (!this.options.draggable) return;
		
			this.isDragging = true;
			
			// Calculate offset relative to the modal element
			const rect = this.modalElement.getBoundingClientRect();
			this.dragOffset = {
				x: e.clientX - rect.left,
				y: e.clientY - rect.top
			};
			
			// Store current modal position
			this.position = {
				x: rect.left,
				y: rect.top
			};
		
			// Add temporary event listeners for dragging
			document.addEventListener('mousemove', this.handleDragMove);
			document.addEventListener('mouseup', this.handleDragEnd);
		
			// Prevent text selection during drag
			e.preventDefault();
			
			// Bring this window to the front
			this.modalElement.style.zIndex = '9999';
		}
		
		// Replace the handleDragMove method
		handleDragMove(e) {
			if (!this.isDragging) return;
		
			// Calculate new position based on mouse movement and initial offset
			const x = e.clientX - this.dragOffset.x;
			const y = e.clientY - this.dragOffset.y;
		
			// Apply new position
			this.modalElement.style.left = `${x}px`;
			this.modalElement.style.top = `${y}px`;
			
			// Remove center transform if it exists
			if (this.modalElement.style.transform) {
				this.modalElement.style.transform = '';
			}
			
			// Update stored position
			this.position = { x, y };
		
			e.preventDefault();
		}

	/**
	 * Handle drag end event
	 */
	handleDragEnd() {
		this.isDragging = false;

		// Remove temporary event listeners
		document.removeEventListener('mousemove', this.handleDragMove);
		document.removeEventListener('mouseup', this.handleDragEnd);
	}

	/**
	 * Apply position to the modal based on options
	 */
	applyPosition() {
		if (!this.modalElement) return;

		const position = this.options.position;

		// Reset any existing positioning
		this.modalElement.style.top = '';
		this.modalElement.style.right = '';
		this.modalElement.style.bottom = '';
		this.modalElement.style.left = '';

		// Apply new positioning
		switch (position) {
			case 'center':
				// Center positioning is handled via CSS
				this.modalElement.style.top = '50%';
				this.modalElement.style.left = '50%';
				this.modalElement.style.transform = 'translate(-50%, -50%)';
				break;
			case 'top-right':
				this.modalElement.style.top = '20px';
				this.modalElement.style.right = '20px';
				break;
			case 'top-left':
				this.modalElement.style.top = '20px';
				this.modalElement.style.left = '20px';
				break;
			case 'bottom-right':
				this.modalElement.style.bottom = '20px';
				this.modalElement.style.right = '20px';
				break;
			case 'bottom-left':
				this.modalElement.style.bottom = '20px';
				this.modalElement.style.left = '20px';
				break;
			// Add more positions as needed
		}
	}

	/**
	 * Handle clicks outside the modal
	 * @param {MouseEvent} e - Mouse event
	 */
	handleOutsideClick(e) {
		if (this.isVisible &&
			this.modalElement &&
			!this.modalElement.contains(e.target) &&
			e.target.id !== this.options.triggerElementId) {
			this.close();
		}
	}

	/**
	 * Open the modal
	 */
	open() {
		if (!this.modalElement || this.isVisible) return;
	
		// Close other windows if multiple windows aren't allowed
		if (!this.options.allowMultipleWindows) {
			ModalWindow.activeWindows.forEach(window => {
				if (window !== this && window.isVisible) {
					window.close();
				}
			});
		}
	
		// Add this window to active windows array
		if (!ModalWindow.activeWindows.includes(this)) {
			ModalWindow.activeWindows.push(this);
		}
	
		// Add visible class to show the modal
		this.modalElement.classList.add('visible');
		this.isVisible = true;
	
		// Add document click listener for outside clicks
		if (this.options.closeOnOutsideClick) {
			setTimeout(() => {
				document.addEventListener('click', this.handleOutsideClick);
			}, 10); // Short delay to avoid immediate close
		}
	
		// Call onOpen callback if provided
		if (typeof this.options.onOpen === 'function') {
			this.options.onOpen();
		}

		if(this.buttonElement){
			this.buttonElement.classList.add('active');
		}
		
	
		// Play sound if sound manager is available
		this.playSound('close');
	}

	/**
	 * Close the modal
	 */
	close() {
		if (!this.modalElement || !this.isVisible) return;
	
		// Remove visible class to hide the modal
		this.modalElement.classList.remove('visible');
		this.isVisible = false;
	
		// Remove document click listener
		if (this.options.closeOnOutsideClick) {
			document.removeEventListener('click', this.handleOutsideClick);
		}
	
		// Call onClose callback if provided
		if (typeof this.options.onClose === 'function') {
			this.options.onClose();
		}
	
		// Play sound if sound manager is available
		this.playSound('close');

		if(this.buttonElement){
			this.buttonElement.classList.remove('active');
		}
		
		// Remove from active windows array
		const index = ModalWindow.activeWindows.indexOf(this);
		if (index !== -1) {
			ModalWindow.activeWindows.splice(index, 1);
		}
	}

	/**
	 * Toggle the modal visibility
	 */
	toggle() {
		if (this.isVisible) {
			this.close();
		} else {
			this.open();
		}
	}

	/**
	 * Play a UI sound if sound manager is available
	 * @param {string} soundType - Type of sound to play (open, close, etc.)
	 */
	playSound(soundType) {
		const soundManager = this.getSoundManager();

		if (soundManager?.soundEnabled && soundManager?.initialized) {
			try {
				switch (soundType) {
					case 'open':
						soundManager.playUISound('select');
						break;
					case 'close':
						soundManager.playUISound('hover');
						break;
					default:
						soundManager.playUISound('click');
				}
			} catch (error) {
				console.warn('Could not play sound:', error);
			}
		}
	}

	/**
	 * Get the sound manager from the parent hierarchy
	 * @returns {object|null} Sound manager object or null if not found
	 */
	getSoundManager() {
		// Navigate up the parent chain to find the core sound manager
		let current = this.parent;
		while (current) {
			if (current.core?.soundManager) {
				return current.core.soundManager;
			}
			if (current.parent) {
				current = current.parent;
			} else {
				break;
			}
		}
		return null;
	}

	/**
	 * Clean up event listeners when the modal is no longer needed
	 */
dispose() {
    // Remove all event listeners
    if (this.closeButton) {
        this.closeButton.onclick = null;
    }

    document.removeEventListener('click', this.handleOutsideClick);

    if (this.options.draggable && this.modalElement) {
        const header = this.modalElement.querySelector('.modal-header') || this.modalElement;
        header.onmousedown = null;
    }

    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);
    
    // Remove from active windows array
    const index = ModalWindow.activeWindows.indexOf(this);
    if (index !== -1) {
        ModalWindow.activeWindows.splice(index, 1);
    }
}
}