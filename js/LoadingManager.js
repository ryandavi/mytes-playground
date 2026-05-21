// LoadingManager.js
class LoadingManager {
    static STAGES = Object.freeze({
        CORE: 'core',
        RESOURCES: 'resources',
        CONTAINER: 'container',
    });

	constructor(options = {}) {
		this.loadingScreen = document.getElementById('loading-screen');
		this.window         = this.loadingScreen?.querySelector('#loading-modal')         ?? null;
		this.titleText      = this.loadingScreen?.querySelector('.modal-title .text')     ?? null;
		this.descriptionText = this.loadingScreen?.querySelector('.loading-message p')    ?? null;
		this.progressBar    = this.loadingScreen?.querySelector('.loading-progress')       ?? null;
		this.loadingText    = this.loadingScreen?.querySelector('.loading-status')         ?? null;
		this.tipText        = this.loadingScreen?.querySelector('.loading-tip')            ?? null;
		this.loadingIcon    = this.loadingScreen?.querySelector('.loading-icon')           ?? null;
		this.skipIcon       = this.loadingScreen?.querySelector('.modal-close-btn')        ?? null;
		this.progressContainer = this.loadingScreen?.querySelector('.loading-progress-container') ?? null;
        this.isLoading = false;

        const params = new URLSearchParams(window.location.search);

        // Debug options
        this.debugOptions = {
            skipLoading: params.has('skipLoading'),
            fastLoading: params.has('fastLoading'),
            dontHide: params.has('dontHide'),
            skipLoadingButton: true,
            ...options.debugOptions,
        };

        // Settings
        this.settings = {
            minMessageDisplayTime: 150, // Minimum ms each status message is shown
            finalDelay: 0,              // Delay before hiding once progress hits 100%
            finalMessage: "Ready to play!",
            hideDelay: 100,
            showWindowDelay: 150,
            transitionFadeDuration: 450,
            ...options.settings,
        };

        this.stages = this.createStages(options.stages);

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
        this.manualProgress = null;
        this.overlayShownAt = 0;
        this.overlayMinVisibleTime = 0;
        this._containerWidth = 0;
        this.boundHandleResize = null;
        this.currentVariant = 'default';
        this.defaultOverlayCopy = {
            title: this.titleText?.textContent || 'Loading Mytes...',
            description: this.descriptionText?.textContent || 'Please wait while your Mytes are being prepared.',
            tip: ''
        };
    }

    createStages(stageDefinitions = null) {
        const fallbackStages = {
            [LoadingManager.STAGES.CORE]: { weight: 1 },
            [LoadingManager.STAGES.RESOURCES]: { weight: 1 },
            [LoadingManager.STAGES.CONTAINER]: { weight: 1 },
        };
        const definitions = stageDefinitions ?? fallbackStages;

        return Object.fromEntries(
            Object.entries(definitions).map(([stageName, config = {}]) => [
                stageName,
                {
                    weight: Number.isFinite(config.weight) ? Math.max(0, config.weight) : 1,
                    progress: 0,
                },
            ])
        );
    }

    resetStages() {
        Object.values(this.stages).forEach(stage => {
            stage.progress = 0;
        });
    }

    cacheProgressMeasurements() {
        const containerWidth = this.progressContainer?.offsetWidth ?? 0;
        const iconWidth = this.loadingIcon?.offsetWidth ?? 0;
        this._containerWidth = Math.max(0, containerWidth - iconWidth);
    }

    beginOverlay(options = {}) {
        const {
            progress = 0,
            message = null,
            variant = 'default',
            title = null,
            description = null,
            tip = null,
            minVisibleTime = 0,
        } = options;

        if (this.messageTimer) {
            clearTimeout(this.messageTimer);
            this.messageTimer = null;
        }

        this.messageQueue = [];
        this.currentMessage = null;
        this.overlayShownAt = Date.now();
        this.overlayMinVisibleTime = Math.max(0, minVisibleTime);

        this.applyOverlayVariant({
            variant,
            title,
            description,
            tip
        });

        this.manualProgress = Math.min(100, Math.max(0, progress));
        this.show();
        this.cacheProgressMeasurements();
        this.updateProgressUI(this.manualProgress);

        if (variant === 'transition') {
            this.showMessage(message || title || 'Traveling...');
        } else if (message) {
            this.setMessage(message);
        }

        if (this.window) {
            this.window.classList.add('visible');
        }

        this.cacheProgressMeasurements();
        this.updateProgressUI(this.manualProgress);
        this.startProgressAnimation();
    }

    setManualProgress(percent) {
        this.manualProgress = Math.min(100, Math.max(0, percent));
    }
    
    initialize() {
        // Check if we should skip loading screen for debugging
        if (!this.debugOptions.dontHide && this.debugOptions.skipLoading) {
            console.log("DEBUG: Skipping loading screen");
            this.isComplete = true;
            this.hide();


			if (this.loadingScreen) {
				this.loadingScreen.style.transition = 'none'; // Disable transition
				this.loadingScreen.style.opacity = '0'; // Instantly show it
			}
	
			// Restore transition after a short delay to avoid affecting future animations
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					if (this.loadingScreen) {
						this.loadingScreen.style.transition = ''; // Restore original transition
					}
				});
			});


            return;
        }
        
        // Reset the loading screen
        this.show();
        
        // Reset progress for all stages
        this.resetStages();
        this.manualProgress = null;

        this.displayProgress = 0;
        this.isComplete = false;
        this.cacheProgressMeasurements();

        if (!this.boundHandleResize) {
            this.boundHandleResize = () => this.cacheProgressMeasurements();
        }
        window.removeEventListener('resize', this.boundHandleResize);
        window.addEventListener('resize', this.boundHandleResize);
        
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
			this.window?.classList.add('visible');
            this.cacheProgressMeasurements();
            this.updateProgressUI(this.displayProgress);
			// Start progress animation
			this.startProgressAnimation();
		}, this.settings.showWindowDelay)

    }
    
    startProgressAnimation() {
        // Clear any existing interval
        if (this.progressInterval) {
            return;
        }
        
        // Update progress at regular intervals
        const updateInterval = 40;
        this.progressInterval = setInterval(() => {
            let baseProgress = this.manualProgress ?? this.calculateActualProgress();

            // Don't reach 100% while message queue is still draining
            if (this.manualProgress === null &&
                this.isComplete &&
                (this.messageQueue.length > 0 || this.messageTimer)) {
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
            if (this.currentVariant === 'transition') {
                this.loadingScreen.style.transition = 'none';
                this.loadingScreen.style.opacity = '1';
            } else {
                this.loadingScreen.style.transition = '';
                this.loadingScreen.style.opacity = '';
            }
            this.loadingScreen.classList.remove('hidden');

            if (this.currentVariant === 'transition') {
                requestAnimationFrame(() => {
                    if (this.loadingScreen && this.currentVariant === 'transition') {
                        this.loadingScreen.style.transition = '';
                    }
                });
            }
        }
        
        const canvas = document.querySelector('.canvas');
        if (canvas) {
            canvas.style.visibility = 'hidden';
        }
    }
    
	hide() {

		if(this.debugOptions.dontHide) return false;

        this.isLoading = false;
        this.manualProgress = null;
        const isTransition = this.currentVariant === 'transition';
        const fadeDuration = isTransition
            ? Math.max(0, this.settings.transitionFadeDuration)
            : Math.max(0, this.settings.hideDelay);

        const canvas = document.querySelector('.canvas');
        if (isTransition && canvas) {
            canvas.style.visibility = 'visible';
        }

        if (this.loadingScreen) {
            if (isTransition) {
                this.loadingScreen.style.transition = `opacity ${fadeDuration}ms ease-out`;
            } else {
                this.loadingScreen.style.transition = '';
            }
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

        const elapsed = this.overlayShownAt ? Date.now() - this.overlayShownAt : 0;
        const remainingVisibleTime = Math.max(0, this.overlayMinVisibleTime - elapsed);

        this.hideTimer = setTimeout(() => {
            if (!isTransition && canvas) {
                canvas.style.visibility = 'visible';
            }
            this.window?.classList.remove('visible');
            this.applyOverlayVariant({ variant: 'default' });
            if (this.loadingScreen) {
                this.loadingScreen.style.transition = '';
                this.loadingScreen.style.opacity = '';
            }
            this.overlayShownAt = 0;
            this.overlayMinVisibleTime = 0;
        }, remainingVisibleTime + fadeDuration);
    }

    applyOverlayVariant(options = {}) {
        const {
            variant = 'default',
            title = null,
            description = null,
            tip = null
        } = options;

        const isTransition = variant === 'transition';
        this.currentVariant = variant;
        this.loadingScreen?.classList.toggle('transition-mode', isTransition);
        this.window?.classList.toggle('transition-mode', isTransition);

        if (this.titleText) {
            this.titleText.textContent = title || this.defaultOverlayCopy.title;
        }

        if (this.descriptionText) {
            this.descriptionText.textContent = description || this.defaultOverlayCopy.description;
        }

        if (this.tipText) {
            this.tipText.textContent = isTransition ? (tip || '') : this.defaultOverlayCopy.tip;
        }
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

        if (this._containerWidth <= 0) {
            this.cacheProgressMeasurements();
        }
        
        // Calculate new position
        const position = (percent / 100) * this._containerWidth;
        
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
        Object.values(this.stages).forEach(stage => {
            stage.progress = 1;
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
        Object.values(this.stages).forEach(stage => {
            stage.progress = 1;
        });
        this.manualProgress = 100;
        
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

        if (this.boundHandleResize) {
            window.removeEventListener('resize', this.boundHandleResize);
        }

        if (this.skipIcon && this.skipClickHandler) {
            this.skipIcon.removeEventListener('click', this.skipClickHandler);
        }
    }
}
