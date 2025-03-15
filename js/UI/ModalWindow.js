class ModalWindow {

	static activeWindows = [];
	static allowMultipleWindows = false;

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
        onMinimize: null,          // Callback when modal is minimized
        onMaximize: null,          // Callback when modal is maximized
		
        closeButtonSelector: '.modal-close-btn', // Selector for close button
		minimizeButtonSelector: '.modal-minimize-btn', // Selector for minimize button
		fullscreenButtonSelector: '.modal-fullscreen-btn', // Selector for maximize button
        
        rememberPosition: true,    // Remember the position when reopening
        allowMultipleWindows: false, // Allow multiple windows to be open at once
        enableKeyboardShortcuts: true, // Enable keyboard shortcuts (Escape to close)
        snapToEdges: true          // Snap windows to screen edges when dragging
    }, options);

    // Element references
    this.modalElement = null;
    this.closeButton = null;
    this.minimizeButton = null;
    this.fullscreenButton = null;
    this.headerElement = null;

    // State
    this.isVisible = false;
    this.isDragging = false;
    this.isFullscreen = false;
    this.isMinimized = false;
    this.dragOffset = { x: 0, y: 0 };
    this.position = { x: 0, y: 0 };  // Track current position
    this.originalSize = { width: 0, height: 0 }; // Store original size for restoring
    this.lastClickTime = 0; // For double-click detection

    // Bind methods to maintain correct 'this' context
    this.open = this.open.bind(this);
    this.close = this.close.bind(this);
    this.toggle = this.toggle.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleDragMove = this.handleDragMove.bind(this);
    this.handleDragEnd = this.handleDragEnd.bind(this);
    this.toggleFullscreen = this.toggleFullscreen.bind(this);
    this.toggleMinimize = this.toggleMinimize.bind(this);
    this.handleHeaderDoubleClick = this.handleHeaderDoubleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);

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

			// Find control buttons
			this.closeButton = this.modalElement.querySelector(this.options.closeButtonSelector);
			this.minimizeButton = this.modalElement.querySelector(this.options.minimizeButtonSelector);
			this.fullscreenButton = this.modalElement.querySelector(this.options.fullscreenButtonSelector);
            this.headerElement = this.modalElement.querySelector('.modal-header');

			// Store original size for restoring from fullscreen/minimize
			const rect = this.modalElement.getBoundingClientRect();
			this.originalSize = {
				width: rect.width,
				height: rect.height
			};

			// Set up event listeners
			this.setupEventListeners();

			// Apply initial positioning
			this.applyPosition();
		} else {
			console.warn('No modal ID provided');
		}
	}

	buttonLeftClick(e) {
		return;
	}

	buttonRightClick(e) {
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

		// Minimize button click handler
		if (this.minimizeButton) {
			this.minimizeButton.onclick = this.toggleMinimize;
		}

		// Fullscreen button click handler
		if (this.fullscreenButton) {
			this.fullscreenButton.onclick = this.toggleFullscreen;
		}

		// Header double-click handler
		if (this.headerElement) {
			this.headerElement.ondblclick = this.handleHeaderDoubleClick;
		}

		// Global keyboard event listener for shortcuts
		if (this.options.enableKeyboardShortcuts) {
			document.addEventListener('keydown', this.handleKeyDown);
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
	 * Handle header double-click event
	 * @param {MouseEvent} e - Mouse event
	 */
	handleHeaderDoubleClick(e) {
		// If minimized, restore to normal
		if (this.isMinimized) {
			this.toggleMinimize();
		}
		// If normal, go to fullscreen
		else if (!this.isFullscreen) {
			this.toggleFullscreen();
		}
		// If fullscreen, restore to normal
		else {
			this.toggleFullscreen();
		}
	}

	/**
	 * Handle keyboard events
	 * @param {KeyboardEvent} e - Keyboard event
	 */
	handleKeyDown(e) {
		// Only handle events when this is the front-most window
		if (!this.isVisible || !this.isFrontMost()) return;

		// Escape key to close the front-most window
		if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
		}
	}

	/**
	 * Check if this window is the front-most active window
	 * @returns {boolean} True if this is the front-most window
	 */
	isFrontMost() {
		if (!this.modalElement) return false;
		
		const thisZIndex = parseInt(this.modalElement.style.zIndex) || 0;
		
		// Check if any other window has a higher z-index
		return !ModalWindow.activeWindows.some(window => {
			if (window === this) return false;
			const otherZIndex = parseInt(window.modalElement.style.zIndex) || 0;
			return window.isVisible && otherZIndex > thisZIndex;
		});
	}

	/**
	 * Toggle fullscreen state
	 */
	toggleFullscreen() {
		if (!this.modalElement) return;

		// Toggle fullscreen class
		if (this.isFullscreen) {
			this.modalElement.classList.remove('fullscreen');
			this.isFullscreen = false;
			
			// Restore original position if we had one
			if (this.options.rememberPosition && this.position.x !== 0 && this.position.y !== 0) {
				this.modalElement.style.left = `${this.position.x}px`;
				this.modalElement.style.top = `${this.position.y}px`;
			}
			
			// Callback
			if (typeof this.options.onMaximize === 'function') {
				this.options.onMaximize(false); // false = exited fullscreen
			}
		} else {
			// Save current position before going fullscreen
			if (!this.isFullscreen && !this.isMinimized) {
				const rect = this.modalElement.getBoundingClientRect();
				this.position = { 
					x: rect.left, 
					y: rect.top 
				};
			}
			
			this.modalElement.classList.add('fullscreen');
			
			// When going fullscreen, ensure we're not minimized
			if (this.isMinimized) {
				this.modalElement.classList.remove('minimize');
				this.isMinimized = false;
			}
			
			this.isFullscreen = true;
			
			// Callback
			if (typeof this.options.onMaximize === 'function') {
				this.options.onMaximize(true); // true = entered fullscreen
			}
		}

		// Play UI sound
		this.playSound('click');
	}

	/**
	 * Toggle minimize state
	 */
	toggleMinimize() {
		if (!this.modalElement) return;

		// Toggle minimize class
		if (this.isMinimized) {
			this.modalElement.classList.remove('minimize');
			this.isMinimized = false;
			
			// Restore original position if we had one
			if (this.options.rememberPosition && this.position.x !== 0 && this.position.y !== 0) {
				this.modalElement.style.left = `${this.position.x}px`;
				this.modalElement.style.top = `${this.position.y}px`;
			}
			
			// Callback
			if (typeof this.options.onMinimize === 'function') {
				this.options.onMinimize(false); // false = unminimized
			}
		} else {
			// Save current position before minimizing
			if (!this.isFullscreen && !this.isMinimized) {
				const rect = this.modalElement.getBoundingClientRect();
				this.position = { 
					x: rect.left, 
					y: rect.top 
				};
			}
			
			this.modalElement.classList.add('minimize');
			
			// When minimizing, ensure we're not fullscreen
			if (this.isFullscreen) {
				this.modalElement.classList.remove('fullscreen');
				this.isFullscreen = false;
			}
			
			this.isMinimized = true;
			
			// Callback
			if (typeof this.options.onMinimize === 'function') {
				this.options.onMinimize(true); // true = minimized
			}
		}

		// Play UI sound
		this.playSound('click');
	}

	/**
	 * Handle drag start event
	 * @param {MouseEvent} e - Mouse event
	 */
	handleDragStart(e) {
		// Don't allow dragging in fullscreen mode
		if (!this.options.draggable || this.isFullscreen) return;
	
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
		this.bringToFront();
	}
	
	/**
	 * Bring this window to the front of other windows
	 */
	bringToFront() {
		// Find highest z-index among active windows
		let highestZIndex = 9999;
		ModalWindow.activeWindows.forEach(window => {
			const zIndex = parseInt(window.modalElement.style.zIndex) || 0;
			if (zIndex > highestZIndex) highestZIndex = zIndex;
		});
		
		// Set this window's z-index higher
		this.modalElement.style.zIndex = `${highestZIndex + 1}`;
	}
	
	/**
	 * Handle drag move event
	 */
	handleDragMove(e) {
		if (!this.isDragging) return;
	
		// Calculate new position based on mouse movement and initial offset
		let x = e.clientX - this.dragOffset.x;
		let y = e.clientY - this.dragOffset.y;
		
		// Apply snapping if enabled
		if (this.options.snapToEdges) {
			const windowWidth = window.innerWidth;
			const windowHeight = window.innerHeight;
			const modalRect = this.modalElement.getBoundingClientRect();
			const snapDistance = 15; // Pixels to trigger snapping
			
			// Snap to left edge
			if (x < snapDistance) x = 0;
			
			// Snap to right edge
			if (x + modalRect.width > windowWidth - snapDistance) {
				x = windowWidth - modalRect.width;
			}
			
			// Snap to top edge
			if (y < snapDistance) y = 0;
			
			// Snap to bottom edge
			if (y + modalRect.height > windowHeight - snapDistance) {
				y = windowHeight - modalRect.height;
			}
		}
	
		// Apply new position with inline styles (necessary for dragging)
		this.modalElement.style.left = `${x}px`;
		this.modalElement.style.top = `${y}px`;
		
		// Remove position classes when manually dragging
		this.modalElement.classList.remove('position-center', 'position-top-right', 
			'position-top-left', 'position-bottom-right', 'position-bottom-left');
		
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

		// Remove all position classes first
		this.modalElement.classList.remove('position-center', 'position-top-right', 'position-top-left', 'position-bottom-right', 'position-bottom-left');

		// Apply position class based on option
		this.modalElement.classList.add(`position-${position}`);
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
		
		// Reset window state to normal before showing
		// (ensures we don't have remnants of previous minimize/fullscreen state)
		this.modalElement.classList.remove('fullscreen', 'minimize');
		this.isFullscreen = false;
		this.isMinimized = false;
	
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
		
		// Bring this window to the front
		this.bringToFront();
	
		// Play sound if sound manager is available
		this.playSound('open');
	}

	/**
	 * Close the modal
	 */
	close() {
		if (!this.modalElement || !this.isVisible) return;
	
		// Save the current state for tracking
		const wasFullscreen = this.isFullscreen;
		const wasMinimized = this.isMinimized;
		
		// Update state flags
		this.isVisible = false;
		this.isFullscreen = false;
		this.isMinimized = false;
		
		// Remove visible class to hide the modal (keeping fullscreen/minimize classes for animation)
		this.modalElement.classList.remove('visible');
		
		// Set up a delayed removal of state classes after animation completes
		if (wasFullscreen || wasMinimized) {
			setTimeout(() => {
				// Only remove classes if the modal is still not visible
				if (!this.isVisible) {
					this.modalElement.classList.remove('fullscreen', 'minimize');
				}
			}, this.options.animationDuration);
		}
	
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
		
		if (this.minimizeButton) {
			this.minimizeButton.onclick = null;
		}
		
		if (this.fullscreenButton) {
			this.fullscreenButton.onclick = null;
		}
		
		if (this.headerElement) {
			this.headerElement.ondblclick = null;
		}

		document.removeEventListener('click', this.handleOutsideClick);
		document.removeEventListener('keydown', this.handleKeyDown);

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