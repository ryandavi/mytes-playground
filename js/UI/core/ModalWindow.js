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
        autoInit: false,           // Subclasses must call this.init() explicitly after their own state is ready
        animationDuration: 300,    // Animation duration in ms
        position: 'center',        // center, top-right, bottom-left, etc.
        draggable: false,          // Allow dragging the modal
        resizable: false,          // Allow resizing the modal
        fullscreen: null,          // true creates a maximize control; null uses authored markup
        onOpen: null,              // Callback when modal opens
        onClose: null,             // Callback when modal closes
        onMinimize: null,          // Callback when modal is minimized
        onMaximize: null,          // Callback when modal is maximized
		
        closeButtonSelector: '.modal-close-btn', // Selector for close button
		minimizeButtonSelector: '.modal-minimize-btn', // Selector for minimize button
		fullscreenButtonSelector: '.modal-fullscreen-btn', // Selector for maximize button
        
        rememberPosition: true,    // Remember the position when reopening
        allowMultipleWindows: false, // Allow multiple windows to be open at once
        snapToEdges: true,         // Snap windows to screen edges when dragging
        dragBoundsElement: null    // Optional element (or getter) that bounds relative-positioned windows
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
    this.dragPointerId = null;
	this.tabBinding = null;
	this.previouslyFocusedElement = null;

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
				Utility.warnDebug(`Modal element with id '${this.options.id}' not found`);
				return;
			}

			if(this.options.floating) {
				this.modalElement.classList.add('is-floating');
			}

			this.modalElement.inert = true;
			this.modalElement.setAttribute('aria-hidden', 'true');

			if(this.options.buttonId) {
				this.buttonElement = document.getElementById(this.options.buttonId);

				if (!this.buttonElement) {
					Utility.warnDebug(`Button with id '${this.options.id}' for modal element with id '${this.options.id}' not found`);
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
				this.buttonElement.dataset.modalTrigger = 'true';
			}

			// Find or create window controls
			this.headerElement = this.modalElement.querySelector('.window-panel__header');
			if (this.options.fullscreen === true) {
				this.ensureFullscreenButton();
			}
			this.closeButton = this.modalElement.querySelector(this.options.closeButtonSelector);
			this.minimizeButton = this.modalElement.querySelector(this.options.minimizeButtonSelector);
			this.fullscreenButton = this.modalElement.querySelector(this.options.fullscreenButtonSelector);

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
			Utility.warnDebug('No modal ID provided');
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

		// Escape is not handled here. Every window listening for it on its own
		// meant two answers to one keypress: the window closed itself while the
		// layered handler, seeing no window it recognised, went on to undo the
		// next thing down. ContainerInputManager.handleEscape is the only
		// authority, and it closes `ModalWindow.frontMost()`.

		// Outside click handler (will be added/removed when modal opens/closes)
		if (this.options.closeOnOutsideClick) {
			// We'll add this when the modal opens
		}

		// Draggable setup
		if (this.options.draggable && this.modalElement) {
			const header = this.modalElement.querySelector('.window-panel__header') || this.modalElement;
			header.style.cursor = 'move';
			header.style.touchAction = 'none';
			header.addEventListener('pointerdown', this.handleDragStart);
		}
	}

	/**
	 * Handle header double-click event
	 * @param {MouseEvent} e - Mouse event
	 */
	handleHeaderDoubleClick(e) {
		// A title bar should only advertise maximize-by-double-click when the
		// window actually exposes a maximize control.
		if (!this.fullscreenButton) return;

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
	 * The open window nearest the front, or null when none are open.
	 *
	 * Stacking order is the only sensible reading of "the window I meant" —
	 * it is the one the eye is on and the one a click would reach first.
	 */
	static frontMost() {
		let front = null;
		let frontZ = -Infinity;
		for (const window of ModalWindow.activeWindows) {
			if (!window.isVisible || !window.modalElement) continue;
			const z = parseInt(window.modalElement.style.zIndex) || 0;
			if (z >= frontZ) {
				frontZ = z;
				front = window;
			}
		}
		return front;
	}

	/**
	 * Check if this window is the front-most active window
	 * @returns {boolean} True if this is the front-most window
	 */
	isFrontMost() {
		if (!this.modalElement || !this.isVisible) return false;
		return ModalWindow.frontMost() === this;
	}

	/**
	 * Toggle fullscreen state
	 */
	toggleFullscreen() {
		if (!this.modalElement) return;

		// Toggle fullscreen class
		if (this.isFullscreen) {
			this.modalElement.classList.remove('is-fullscreen');
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

			this.modalElement.classList.add('is-fullscreen');

			// When going fullscreen, ensure we're not minimized
			if (this.isMinimized) {
				this.modalElement.classList.remove('is-minimized');
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
			this.modalElement.classList.remove('is-minimized');
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

			this.modalElement.classList.add('is-minimized');

			// When minimizing, ensure we're not fullscreen
			if (this.isFullscreen) {
				this.modalElement.classList.remove('is-fullscreen');
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
		if (e.button !== 0 || e.target.closest('button, input, select, textarea, a, .window-panel__controls')) return;

		this.isDragging = true;
		this.dragPointerId = e.pointerId;

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

		// Convert CSS-positioned windows to explicit viewport coordinates before
		// moving them. This prevents the centering transform from transitioning
		// against the first left/top update and producing a top-left jump.
		this.modalElement.classList.add('is-dragging');
		this.modalElement.classList.remove('position-center', 'position-top-right',
			'position-top-left', 'position-bottom-right', 'position-bottom-left');
		this.modalElement.style.transform = 'none';
		const isViewportPositioned = getComputedStyle(this.modalElement).position === 'fixed';
		const offsetRect = isViewportPositioned
			? { left: 0, top: 0 }
			: this.modalElement.offsetParent?.getBoundingClientRect?.() ?? { left: 0, top: 0 };
		this.modalElement.style.left = `${rect.left - offsetRect.left}px`;
		this.modalElement.style.top = `${rect.top - offsetRect.top}px`;
	
		this.headerElement?.setPointerCapture?.(e.pointerId);
		this.headerElement?.addEventListener('pointermove', this.handleDragMove);
		this.headerElement?.addEventListener('pointerup', this.handleDragEnd);
		this.headerElement?.addEventListener('pointercancel', this.handleDragEnd);
	
		// Prevent text selection during drag
		e.preventDefault();
		
		// Bring this window to the front
		this.bringToFront();
	}
	
	/**
	 * Bring this window to the front of other windows
	 */
	bringToFront() {
		const base = AppConfig?.ui?.modalBaseZIndex ?? 9999;
		let highestZIndex = base;
		ModalWindow.activeWindows.forEach(window => {
			const zIndex = parseInt(window.modalElement.style.zIndex) || 0;
			if (zIndex > highestZIndex) highestZIndex = zIndex;
		});
		this.modalElement.style.zIndex = `${highestZIndex + 1}`;
	}
	
	/**
	 * Handle drag move event
	 */
	handleDragMove(e) {
		if (!this.isDragging || e.pointerId !== this.dragPointerId) return;

		const configuredBounds = typeof this.options.dragBoundsElement === 'function'
			? this.options.dragBoundsElement()
			: this.options.dragBoundsElement;
		const boundsRect = configuredBounds?.getBoundingClientRect?.() || {
			left: 0,
			top: 0,
			width: window.innerWidth,
			height: window.innerHeight
		};
		const isViewportPositioned = getComputedStyle(this.modalElement).position === 'fixed';
		const minX = isViewportPositioned ? boundsRect.left : 0;
		const minY = isViewportPositioned ? boundsRect.top : 0;
		const modalRect = this.modalElement.getBoundingClientRect();
		const maxX = Math.max(minX, minX + boundsRect.width - modalRect.width);
		const maxY = Math.max(minY, minY + boundsRect.height - modalRect.height);

		// Calculate new position based on mouse movement and initial offset
		let x = e.clientX - this.dragOffset.x - (isViewportPositioned ? 0 : boundsRect.left);
		let y = e.clientY - this.dragOffset.y - (isViewportPositioned ? 0 : boundsRect.top);

		// Apply snapping if enabled
		if (this.options.snapToEdges) {
			const snapDistance = 15; // Pixels to trigger snapping

			// Snap to left edge
			if (x < minX + snapDistance) x = minX;

			// Snap to right edge
			if (x > maxX - snapDistance) {
				x = maxX;
			}

			// Snap to top edge
			if (y < minY + snapDistance) y = minY;

			// Snap to bottom edge
			if (y > maxY - snapDistance) {
				y = maxY;
			}
		}
		x = Math.min(maxX, Math.max(minX, x));
		y = Math.min(maxY, Math.max(minY, y));

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
	handleDragEnd(event) {
		if (event?.pointerId !== undefined && event.pointerId !== this.dragPointerId) return;
		if (this.dragPointerId !== null && this.headerElement?.hasPointerCapture?.(this.dragPointerId)) {
			this.headerElement.releasePointerCapture(this.dragPointerId);
		}
		this.isDragging = false;
		this.dragPointerId = null;
		this.modalElement?.classList.remove('is-dragging');

		this.headerElement?.removeEventListener('pointermove', this.handleDragMove);
		this.headerElement?.removeEventListener('pointerup', this.handleDragEnd);
		this.headerElement?.removeEventListener('pointercancel', this.handleDragEnd);
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
		// Ignore the click that triggered open() — its event fires after the listener attaches
		if (e.timeStamp < this._openTime + 16) return;
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
		this.previouslyFocusedElement = document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
		this.modalElement.inert = false;
		this.modalElement.setAttribute('aria-hidden', 'false');
	
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
		this.modalElement.classList.remove('is-fullscreen', 'is-minimized');
		this.isFullscreen = false;
		this.isMinimized = false;

		// Add visible class to show the modal
		this.modalElement.classList.add('is-visible');
		this.isVisible = true;
		this._openTime = performance.now();

		// Add document click listener for outside clicks
		if (this.options.closeOnOutsideClick) {
			document.addEventListener('click', this.handleOutsideClick);
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
		this.handleDragEnd();
		this.restoreFocusBeforeClose();

		// Save the current state for tracking
		const wasFullscreen = this.isFullscreen;
		const wasMinimized = this.isMinimized;
		
		// Update state flags
		this.isVisible = false;
		this.isFullscreen = false;
		this.isMinimized = false;
		
		// Remove visible class to hide the modal (keeping fullscreen/minimize classes for animation)
		this.modalElement.classList.remove('is-visible');
		this.modalElement.inert = true;
		this.modalElement.setAttribute('aria-hidden', 'true');
		
		// Set up a delayed removal of state classes after animation completes
		if (wasFullscreen || wasMinimized) {
			setTimeout(() => {
				// Only remove classes if the modal is still not visible
				if (!this.isVisible) {
					this.modalElement.classList.remove('is-fullscreen', 'is-minimized');
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

	restoreFocusBeforeClose() {
		const activeElement = document.activeElement;
		if (!(activeElement instanceof HTMLElement) || !this.modalElement.contains(activeElement)) return;

		const candidates = [this.previouslyFocusedElement, this.buttonElement];
		for (const candidate of candidates) {
			if (!(candidate instanceof HTMLElement) ||
				!candidate.isConnected ||
				candidate.closest('[inert]') ||
				candidate.disabled) continue;
			candidate.focus({ preventScroll: true });
			if (document.activeElement === candidate) break;
		}
		if (this.modalElement.contains(document.activeElement)) {
			activeElement.blur();
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

	ensureFullscreenButton() {
		if (!this.headerElement || this.modalElement.querySelector(this.options.fullscreenButtonSelector)) return;
		const controls = this.headerElement.querySelector('.window-panel__controls');
		if (!controls) return;

		const button = document.createElement('button');
		button.type = 'button';
		button.className = this.options.fullscreenButtonSelector.replace(/^\./, '');
		button.setAttribute('aria-label', 'Maximize');
		button.appendChild(Utility.createIcon('maximize'));
		const closeButton = controls.querySelector(this.options.closeButtonSelector);
		controls.insertBefore(button, closeButton);
	}

	setupTabs(options = {}) {
		this.disposeTabs();
		if (!options.element) return;
		this.tabBinding = new TabController(options).init();
	}

	syncTabs(activeId) {
		const binding = this.tabBinding;
		if (!binding) return;
		binding.sync(activeId);
	}

	disposeTabs() {
		if (!this.tabBinding) return;
		this.tabBinding.dispose();
		this.tabBinding = null;
	}

	/**
	 * Play a UI sound if sound manager is available
	 * @param {string} soundType - Type of sound to play (open, close, etc.)
	 */
	playSound(soundType) {
		const soundManager = this.getSoundManager();
		const sounds = SiteConfig.ui.interactionSounds;
		const soundId = soundType === 'open'
			? sounds.modalOpen
			: soundType === 'close'
				? sounds.modalClose
				: sounds.click;

		soundManager?.playWhenReady?.(soundId);
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
		this.disposeTabs();
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

		if (this.buttonElement) {
			this.buttonElement.onclick = null;
			this.buttonElement.oncontextmenu = null;
			delete this.buttonElement.dataset.modalTrigger;
		}

		document.removeEventListener('click', this.handleOutsideClick);

		if (this.options.draggable && this.modalElement) {
			const header = this.modalElement.querySelector('.window-panel__header') || this.modalElement;
			header.removeEventListener('pointerdown', this.handleDragStart);
		}

		this.handleDragEnd();
		
		// Remove from active windows array
		const index = ModalWindow.activeWindows.indexOf(this);
		if (index !== -1) {
			ModalWindow.activeWindows.splice(index, 1);
		}
	}
}
