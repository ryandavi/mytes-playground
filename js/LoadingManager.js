// LoadingManager.js
class LoadingManager {
    constructor() {
		this.loadingScreen = document.getElementById('loading-screen');
		this.window         = this.loadingScreen?.querySelector('#loading-modal')         ?? null;
		this.progressBar    = this.loadingScreen?.querySelector('.loading-progress')       ?? null;
		this.loadingText    = this.loadingScreen?.querySelector('.loading-status')         ?? null;
		this.loadingIcon    = this.loadingScreen?.querySelector('.loading-icon')           ?? null;
		this.skipIcon       = this.loadingScreen?.querySelector('.modal-close-btn')        ?? null;
		this.progressContainer = this.loadingScreen?.querySelector('.loading-progress-container') ?? null;
        this.isLoading = false;
        
        // Debug options
        this.debugOptions = {
            skipLoading: false,     // Skip loading screen entirely (dev only)
            fastLoading: false,     // Show messages immediately without minimum display time
            dontHide: false,        // Keep loading screen visible after completion
            skipLoadingButton: true,
        };

        // Settings
        this.settings = {
            minMessageDisplayTime: 150, // Minimum ms each status message is shown
            finalDelay: 0,              // Delay before hiding once progress hits 100%
            finalMessage: "Ready to play!",
            hideDelay: 100,
            showWindowDelay: 150,
        };
        
        // Loading stages tracking (normalized to 0-1 range)
        this.stages = {
            core: { weight: 0.45, progress: 0 },        // Core initialization
            resources: { weight: 0.1, progress: 0 },   // Resource loading (reduced weight since we have minimal resources)
            container: { weight: 0.45, progress: 0 }    // Container initialization
        };
        
        // Message management
        this.messageQueue = [];
        this.currentMessage = null;
        this.messageTimer = null;
        this.lastMessageTime = 0;

        // Progress tracking
        this.displayProgress = 0;
        this.progressInterval = null;
        this.isComplete = false;
        this.skipClickHandler = null;
        this.showWindowTimer = null;
        this.hideTimer = null;
        this.finalHideTimer = null;
    }
    
    initialize() {
        // Check if we should skip loading screen for debugging
        if (!this.debugOptions.dontHide && this.debugOptions.skipLoading) {
            console.log("DEBUG: Skipping loading screen");
            this.isComplete = true;
            this.hide();


			this.loadingScreen.style.transition = 'none'; // Disable transition
			this.loadingScreen.style.opacity = '0'; // Instantly show it
	
			// Restore transition after a short delay to avoid affecting future animations
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					this.loadingScreen.style.transition = ''; // Restore original transition
				});
			});


            return;
        }
        
        // Reset the loading screen
        this.show();
        
        // Reset progress for all stages
        Object.keys(this.stages).forEach(key => {
            this.stages[key].progress = 0;
        });

        this.displayProgress = 0;
        this.isComplete = false;
        
        this.updateProgressUI(0);
        this.setMessage("Initializing...");
        
        // Position the loading icon at the start
        this.positionLoadingIcon(0);
        
        // Add skip button for debugging
        // Remove existing button if any
		if(this.debugOptions.skipLoadingButton) {

			if (this.skipIcon) {

				this.skipIcon.classList.add('visible');
				if (!this.skipClickHandler) {
					this.skipClickHandler = () => {
						this.skipLoading();
					};
				}
				this.skipIcon.removeEventListener('click', this.skipClickHandler);
				this.skipIcon.addEventListener('click', this.skipClickHandler);
			}
		}


		// delay with  showWindowDelay
		this.showWindowTimer = setTimeout(() => {
			this.window.classList.add('visible');
			// Start progress animation
			this.startProgressAnimation();
		}, this.settings.showWindowDelay)

    }
    
    startProgressAnimation() {
        // Clear any existing interval
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        
        // Update progress at regular intervals
        const updateInterval = 40;
        this.progressInterval = setInterval(() => {
            let baseProgress = this.calculateActualProgress();

            // Don't reach 100% while message queue is still draining
            if (this.isComplete && (this.messageQueue.length > 0 || this.messageTimer)) {
                baseProgress = Math.min(baseProgress, 95);
            }
            
            // Smoothly approach the calculated progress
            let newProgress = this.displayProgress;
            if (baseProgress > this.displayProgress) {
                // Move toward the target progress - gentle animation
                const gap = baseProgress - this.displayProgress;
                const step = Math.max(0.1, Math.min(0.5, gap * 0.05));
                newProgress = Math.min(baseProgress, this.displayProgress + step);
            }
            
            // If the progress has changed, update UI
            if (newProgress !== this.displayProgress) {
                this.displayProgress = newProgress;
                this.updateProgressUI(this.displayProgress);
            }
            
            // Check if we're done - only when everything is loaded AND message queue is empty
            if (this.isComplete && 
                this.messageQueue.length === 0 && 
                !this.messageTimer) {
                
                // Progress to 100% over a short duration
                if (this.displayProgress < 100) {
                    // Accelerate to 100%
                    const remainingGap = 100 - this.displayProgress;
                    const finalStep = Math.max(0.5, remainingGap * 0.1);
                    this.displayProgress = Math.min(100, this.displayProgress + finalStep);
                    this.updateProgressUI(this.displayProgress);
                } else {
                    // At 100%, clean up and finish
                    clearInterval(this.progressInterval);
                    this.progressInterval = null;


                    
                    if (this.finalHideTimer) {
                        clearTimeout(this.finalHideTimer);
                    }
                    this.finalHideTimer = setTimeout(() => this.hide(), this.settings.finalDelay);
                }
            }
        }, updateInterval);
    }
    
    calculateActualProgress() {
        // Calculate combined progress based on stage weights
        let totalProgress = 0;
        let totalWeight = 0;
        
        for (const [key, stage] of Object.entries(this.stages)) {
            totalProgress += stage.progress * stage.weight;
            totalWeight += stage.weight;
        }
        
        // Normalize to 0-100 range
        return (totalWeight > 0) ? (totalProgress / totalWeight) * 100 : 0;
    }
    
    // Unified method to update progress for any stage (percent as decimal 0-1)
    updateStageProgress(stage, percent) {
        if (!this.stages[stage]) {
            console.warn(`Unknown loading stage: ${stage}`);
            return;
        }
        
        // Ensure percent is between 0-1
        this.stages[stage].progress = Math.min(1, Math.max(0, percent));
    }
    
    show() {
        this.isLoading = true;
        this.isComplete = false;
        if (this.loadingScreen) {
            this.loadingScreen.classList.remove('hidden');
        }
        
        const canvas = document.querySelector('.canvas');
        if (canvas) {
            canvas.style.visibility = 'hidden';
        }
    }
    
    hide() {

		if(this.debugOptions.dontHide) return false;

        this.isLoading = false;

        if (this.loadingScreen) {
            this.loadingScreen.classList.add('hidden');
        }
        
        // Cancel any pending timers
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
            this.messageTimer = null;
        }


        // Clear message queue
        this.messageQueue = [];
        
        // Wait for transition to complete before making canvas visible
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }

        this.hideTimer = setTimeout(() => {
            const canvas = document.querySelector('.canvas');
            if (canvas) {
                canvas.style.visibility = 'visible';
                this.window.classList.remove('visible');
            }
        }, this.settings.hideDelay);
    }
    
    updateProgressUI(percent) {
        // Ensure progress is between 0-100
        const safePercent = Math.min(100, Math.max(0, percent));
        
        // Update progress bar width
        if (this.progressBar) {
            this.progressBar.style.width = `${safePercent}%`;
        }
        
        // Update loading icon position
        this.positionLoadingIcon(safePercent);
    }
    
    positionLoadingIcon(percent) {
        if (!this.loadingIcon) return;
        
        // Calculate new position
        const containerWidth = this.progressContainer.offsetWidth - this.loadingIcon.offsetWidth;
        const position = (percent / 100) * containerWidth;
        
        // Apply new positioning
        this.loadingIcon.style.left = `${position}px`;
    }
    
    setMessage(message) {
        if (this.debugOptions.fastLoading) {
            this.showMessage(message);
            return;
        }

        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        if (timeSinceLastMessage >= this.settings.minMessageDisplayTime) {
            this.showMessage(message);
        } else {
            this.messageQueue.push(message);
            if (this.messageQueue.length === 1 && !this.messageTimer) {
                const delay = this.settings.minMessageDisplayTime - timeSinceLastMessage;
                this.messageTimer = setTimeout(() => this.processNextQueuedMessage(), delay);
            }
        }
    }
    
    showMessage(message) {
        if (this.loadingText) {
            this.loadingText.textContent = message;
        }
        this.currentMessage = message;
        this.lastMessageTime = Date.now();
    }
    
    processNextQueuedMessage() {
        if (this.messageQueue.length > 0) {
            this.showMessage(this.messageQueue.shift());
            if (this.messageQueue.length > 0) {
                this.messageTimer = setTimeout(
                    () => this.processNextQueuedMessage(),
                    this.settings.minMessageDisplayTime
                );
            } else {
                this.messageTimer = null;
            }
        } else {
            this.messageTimer = null;
        }
    }
    
    completeLoading() {
        if (this.isComplete) return; // Guard against multiple calls
        Object.keys(this.stages).forEach(key => {
            this.stages[key].progress = 1;
        });
        this.isComplete = true;
        this.setMessage(this.settings.finalMessage);
        // The progress animation loop caps at 95% while the message queue drains,
        // then accelerates to 100% and hides.
    }
    

    
    skipLoading() {
        // Clear all timers
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
            this.messageTimer = null;
        }
        
        // Clear message queue
        this.messageQueue = [];
        
        // Set all progress to 100%
        Object.keys(this.stages).forEach(key => {
            this.stages[key].progress = 1;
        });
        
        // Force progress to 100%
        this.displayProgress = 100;
        this.updateProgressUI(100);
        
        // Mark as complete and hide
        this.isComplete = true;
        this.hide();

        // Make canvas visible immediately
        const canvas = document.querySelector('.canvas');
        if (canvas) {
            canvas.style.visibility = 'visible';
        }
    }

    dispose() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }

        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
            this.messageTimer = null;
        }

        if (this.showWindowTimer) {
            clearTimeout(this.showWindowTimer);
            this.showWindowTimer = null;
        }

        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
            this.hideTimer = null;
        }

        if (this.finalHideTimer) {
            clearTimeout(this.finalHideTimer);
            this.finalHideTimer = null;
        }

        if (this.skipIcon && this.skipClickHandler) {
            this.skipIcon.removeEventListener('click', this.skipClickHandler);
        }
    }
}
