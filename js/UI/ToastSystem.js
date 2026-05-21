/**
 * Toast Notification System
 * Provides a way to display temporary popup messages in the game
 */
class ToastSystem {
	constructor(parentElement = document.body) {
	  this.parent = parentElement;
	  this.container = null;
	  this.toasts = new Map(); // Store toast elements by ID
	  this.counter = 0; // For generating unique IDs
	  this.maxToasts = 5;
	  
	  // Toast default configuration
	  this.defaults = {
		duration: 5000, // 5 seconds
		type: 'info', // info, success, warning, error
		title: '',
		content: '',
		closable: true,
		progress: true,
		pauseOnHover: true,
		autoClose: true
	  };
	  
	  // Create CSS animation for progress bar - only do this once
	  this.createAnimationStyles();
	  
	  this.initialize();
	}
	
	createAnimationStyles() {
	  // Check if the styles already exist to avoid duplication
	  if (!document.getElementById('toast-animations')) {
		const style = document.createElement('style');
		style.id = 'toast-animations';
		style.textContent = `
		  @keyframes toast-progress-decrease {
			from { transform: scaleX(1); }
			to { transform: scaleX(0); }
		  }
		`;
		document.head.appendChild(style);
	  }
	}
	
	initialize() {
	  if (!this.container) {
		this.container = document.createElement('div');
		this.container.className = 'toast-container';
		this.parent.appendChild(this.container);
	  }
	}
	
	show(options = {}) {
	  // Merge default options with provided options
	  const config = {...this.defaults, ...options};
	  
	  // Generate unique ID for this toast
	  const id = `toast-${++this.counter}`;
	  
	  // Create toast element - use document fragment for better performance
	  const fragment = document.createDocumentFragment();
	  const toastEl = document.createElement('div');
	  toastEl.className = `toast ${config.type}`;
	  toastEl.id = id;
	  
	  // Set toast content in one operation to minimize DOM reflows
	  toastEl.innerHTML = `
		<div class="toast-header">
		  <div class="toast-title">${config.title}</div>
		  ${config.closable ? '<button class="toast-close">&times;</button>' : ''}
		</div>
		<div class="toast-content">${config.content}</div>
		${config.progress && config.autoClose ? '<div class="toast-progress"><div class="toast-progress-bar"></div></div>' : ''}
	  `;
	  
	  fragment.appendChild(toastEl);
	  
	  // Store handlers for easy cleanup
	  const handlers = {};
	  
	  // Handle close button click
	  if (config.closable) {
		const closeBtn = toastEl.querySelector('.toast-close');
		handlers.closeHandler = () => this.close(id);
		closeBtn.addEventListener('click', handlers.closeHandler);
	  }
	  
	  // Click anywhere on toast to dismiss
	  handlers.clickHandler = (e) => {
		// Don't trigger if clicking the close button
		if (!e.target.classList.contains('toast-close') && !e.target.closest('.toast-close')) {
		  this.close(id);
		}
	  };
	  toastEl.addEventListener('click', handlers.clickHandler);
	  
	  // Store toast data with event handlers for cleanup
	  const toastData = {
		element: toastEl,
		config,
		autoClose: config.autoClose,
		autoCloseTimeout: null,
		created: Date.now(),
		closing: false,
		handlers
	  };
	  
	  // Add individual toast hover behavior
	  if (config.pauseOnHover && config.autoClose) {
		handlers.mouseEnterHandler = () => {
		  // Only pause this specific toast
		  if (toastData.autoCloseTimeout) {
			clearTimeout(toastData.autoCloseTimeout);
			toastData.autoCloseTimeout = null;
			
			// Pause only this progress bar
			const progressBar = toastEl.querySelector('.toast-progress-bar');
			if (progressBar) {
			  progressBar.style.animationPlayState = 'paused';
			}
		  }
		};
		
		handlers.mouseLeaveHandler = () => {
		  // Only resume this specific toast if it should auto-close and isn't already closing
		  if (toastData.autoClose && !toastData.closing) {
			this.setAutoClose(toastData);
			
			// Resume only this progress bar
			const progressBar = toastEl.querySelector('.toast-progress-bar');
			if (progressBar) {
			  progressBar.style.animationPlayState = 'running';
			}
		  }
		};
		
		toastEl.addEventListener('mouseenter', handlers.mouseEnterHandler);
		toastEl.addEventListener('mouseleave', handlers.mouseLeaveHandler);
	  }
	  
	  this.toasts.set(id, toastData);
	  
	  // Add to DOM in one batch operation
	  this.container.appendChild(fragment);
	  
	  // Enforce maximum number of toasts
	  this.enforceMaxToasts();
	  
	  // Trigger visibility after a frame to ensure transition works
	  requestAnimationFrame(() => {
		toastEl.classList.add('is-visible');
		
		// Setup progress bar animation
		if (config.progress && config.autoClose) {
		  const progressBar = toastEl.querySelector('.toast-progress-bar');
		  
		  // Apply will-change for better performance
		  progressBar.style.willChange = 'transform';
		  progressBar.style.animation = `toast-progress-decrease ${config.duration}ms linear forwards`;
		  
		  // Add animation end event listener to close the toast
		  handlers.animationEndHandler = () => {
			// Only close if not already closing and not paused
			if (!toastData.closing && progressBar.style.animationPlayState !== 'paused') {
			  this.close(id);
			}
		  };
		  progressBar.addEventListener('animationend', handlers.animationEndHandler);
		}
		
		// Setup auto-close (as a fallback)
		if (config.autoClose) {
		  this.setAutoClose(toastData);
		}
	  });
	  
	  return id;
	}
	
	setAutoClose(toastData) {
	  if (toastData.autoCloseTimeout) {
		clearTimeout(toastData.autoCloseTimeout);
	  }
	  
	  // We'll use the animation to determine when to close, not the timeout
	  // But keep the timeout as a fallback in case animation fails
	  toastData.autoCloseTimeout = setTimeout(() => {
		// Find the toast ID from the toast data
		let toastId = null;
		for (const [id, data] of this.toasts.entries()) {
		  if (data === toastData) {
			toastId = id;
			break;
		  }
		}
		
		if (toastId && !toastData.closing) {
		  this.close(toastId);
		}
	  }, toastData.config.duration + 100); // Add a small buffer
	}
	
	close(id) {
	  const toastData = this.toasts.get(id);
	  if (!toastData || toastData.closing) return;
	  
	  toastData.closing = true;
	  
	  // Clear any existing timeout
	  if (toastData.autoCloseTimeout) {
		clearTimeout(toastData.autoCloseTimeout);
		toastData.autoCloseTimeout = null;
	  }
	  
	  // Get the current height before starting the animation
	  const toastEl = toastData.element;
	  const height = toastEl.offsetHeight;
	  
	  // Set the exact height so we can animate to zero
	  toastEl.style.height = `${height}px`;
	  
	  // Force a reflow to ensure the height is applied
	  void toastEl.offsetHeight;
	  
	  // Start remove animation
	  toastEl.classList.add('removing');
	  toastEl.style.height = '0';
	  
	  // Remove from DOM after animation completes
	  setTimeout(() => {
		if (toastEl.parentNode) {
		  // Clean up event listeners
		  const { handlers } = toastData;
		  
		  if (handlers.closeHandler) {
			const closeBtn = toastEl.querySelector('.toast-close');
			if (closeBtn) closeBtn.removeEventListener('click', handlers.closeHandler);
		  }
		  
		  if (handlers.clickHandler) {
			toastEl.removeEventListener('click', handlers.clickHandler);
		  }
		  
		  if (handlers.mouseEnterHandler) {
			toastEl.removeEventListener('mouseenter', handlers.mouseEnterHandler);
		  }
		  
		  if (handlers.mouseLeaveHandler) {
			toastEl.removeEventListener('mouseleave', handlers.mouseLeaveHandler);
		  }
		  
		  if (handlers.animationEndHandler) {
			const progressBar = toastEl.querySelector('.toast-progress-bar');
			if (progressBar) {
			  progressBar.removeEventListener('animationend', handlers.animationEndHandler);
			}
		  }
		  
		  toastEl.parentNode.removeChild(toastEl);
		}
		
		this.toasts.delete(id);
	  }, 500); // match the CSS transition duration
	}
	
	closeAll() {
	  this.toasts.forEach((_, id) => {
		this.close(id);
	  });
	}
	
	enforceMaxToasts() {
	  if (this.toasts.size >= this.maxToasts) {
		// Sort toasts by creation time (oldest first)
		const sortedToasts = Array.from(this.toasts.entries())
		  .sort((a, b) => a[1].created - b[1].created);
		
		// Close oldest toasts
		const toastsToRemove = sortedToasts.slice(0, sortedToasts.length - this.maxToasts + 1);
		toastsToRemove.forEach(([id]) => this.close(id));
	  }
	}
	
	info(content, title = 'Information', options = {}) {
	  return this.show({
		type: 'info',
		title,
		content,
		...options
	  });
	}
	
	success(content, title = 'Success', options = {}) {
	  return this.show({
		type: 'success',
		title,
		content,
		...options
	  });
	}
	
	warning(content, title = 'Warning', options = {}) {
	  return this.show({
		type: 'warning',
		title,
		content,
		duration: 8000, // Longer duration for warnings
		...options
	  });
	}
	
	error(content, title = 'Error', options = {}) {
	  return this.show({
		type: 'error',
		title,
		content,
		duration: 10000, // Even longer duration for errors
		...options
	  });
	}
	
	setDefaults(options) {
	  this.defaults = {...this.defaults, ...options};
	}
	
	dispose() {
	  this.closeAll();
	  if (this.container && this.container.parentNode) {
		this.container.parentNode.removeChild(this.container);
	  }
	  this.container = null;
	  this.toasts.clear();
	}
  }
