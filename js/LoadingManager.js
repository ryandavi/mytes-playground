// LoadingManager.js
class LoadingManager {
    constructor() {
		this.loadingScreen = document.getElementById('loading-screen');
		if (this.loadingScreen) {
			this.window = this.loadingScreen.querySelector('.mytes-loading-window');
			this.progressBar = this.loadingScreen.querySelector('.mytes-progress');
			this.loadingText = this.loadingScreen.querySelector('#loading-text');
			this.loadingIcon = this.loadingScreen.querySelector('.loading-icon');
			this.isLoading = true;
		}
        
        // Debug options
        this.debugOptions = {
            skipLoading: true,         // Set to true to skip loading screen
            fastLoading: false,         // Set to true for accelerated loading
            logMessages: true,           // Show debug logs for messages
			dontHide: false,
			skipLoadingButton: true
        };
        
        // Settings
        this.settings = {
            minMessageDisplayTime: 150,    // Minimum time to display a message (ms) - for testing
            finalDelay: 0,               // Delay before hiding when complete (ms)
            finalMessage: "Ready to play!",  // Final message to display before hiding
			hideDelay: 100,
			checkMessageDelay: 100,
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
        this.displayProgress = 0;         // The displayed progress (0-100)
        this.progressInterval = null;     // Interval for updating progress
        this.isComplete = false;          // Flag indicating loading is complete
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
        
        // Reset progress for all stages and message counters
        Object.keys(this.stages).forEach(key => {
            this.stages[key].progress = 0;
        });
        
        this.displayProgress = 0;
        this.isComplete = false;
        this.totalMessages = 0;
        this.processedMessages = 0;
        
        this.updateProgressUI(0);
        this.setMessage("Initializing...");
        
        // Position the loading icon at the start
        this.positionLoadingIcon(0);
        
        // Add skip button for debugging
        // Remove existing button if any
		if(this.debugOptions.skipLoadingButton) {
			const existingButton = document.getElementById('loading-skip-button');
			if (existingButton) {

				existingButton.classList.add('visible');
				// Add click event
				existingButton.addEventListener('click', () => {
					this.skipLoading();
				});
			}
		}


		// delay with  showWindowDelay
		setTimeout(() => {
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
        const updateInterval = 40; // Update every 40ms
        this.progressInterval = setInterval(() => {
            // Calculate raw technical progress based on loading stages
            const technicalProgress = this.calculateActualProgress();
            
            // Calculate message-based progress (as a percentage)
            let messageProgress = 0;
            if (this.totalMessages > 0) {
                messageProgress = (this.processedMessages / this.totalMessages) * 100;
            }
            
            // Combine technical and message progress
            // Messages control 70% of the bar, technical progress 30%
            let baseProgress = (messageProgress * 0.7) + (technicalProgress * 0.3);
            
            // If loading is complete but messages are still showing, cap at 95%
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

					this.window.classList.remove('visible');
                    
                    setTimeout(() => this.hide(), this.settings.finalDelay);
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
    
    // Legacy methods for backward compatibility
    updateCoreProgress(percent) {
        this.updateStageProgress('core', percent / 100);
    }
    
    updateContainerProgress(percent) {
        this.updateStageProgress('container', percent);
    }
    
    updateResourceProgress(category, loaded, total = null) {
        // Resource progress is tracked within the 'resources' stage
        if (total !== null && total > 0) {
            this.updateStageProgress('resources', loaded / total);
        } else if (total === null) {
            // If total is not provided, assume it's a direct percentage
            this.updateStageProgress('resources', loaded);
        }
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

		if(this.debugOptions.dontHide) return;

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
        setTimeout(() => {
            const canvas = document.querySelector('.canvas');
            if (canvas) {
                canvas.style.visibility = 'visible';
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
        
        // Find the progress container to get its width
        const container = document.querySelector('.mytes-progress-container');
        if (!container) return;
        
        // Calculate new position
        const containerWidth = container.offsetWidth - this.loadingIcon.offsetWidth;
        const position = (percent / 100) * containerWidth;
        
        // Apply new positioning
        this.loadingIcon.style.left = `${position}px`;
    }
    
    setMessage(message) {
        const now = Date.now();
        const timeSinceLastMessage = now - this.lastMessageTime;
        
        // Increment total message count for progress tracking
        this.totalMessages++;
        
        // Check if we're in fast loading mode
        if (this.debugOptions.fastLoading) {
            // Show message immediately, ignoring timing
            this.showMessage(message);
            this.processedMessages++;
            return;
        }
        
        // If enough time has passed, show the message immediately
        if (timeSinceLastMessage >= this.settings.minMessageDisplayTime) {
            this.showMessage(message);
            this.processedMessages++;
        } else {
            // Otherwise, queue the message
            this.messageQueue.push(message);
            
            // If this is the first queued message, start processing the queue
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
            const nextMessage = this.messageQueue.shift();
            this.showMessage(nextMessage);
            
            // Increment processed messages count for progress tracking
            this.processedMessages++;
            
            // If there are more messages, schedule the next one
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
    
    // Call this when all loading is truly complete
    completeLoading() {
        // Set all stages to 100%
        Object.keys(this.stages).forEach(key => {
            this.stages[key].progress = 1;
        });
        
        // Don't set isComplete to true until all messages are processed
        if (this.messageQueue.length === 0 && !this.messageTimer) {
            // If no messages are pending, complete immediately
            this.isComplete = true;
            // Add the final message sooner
            this.setMessage(this.settings.finalMessage);
        } else {
            // Otherwise, wait for messages to finish before completing
            // Set up a watcher to check when messages are done
            const checkMessages = () => {
                if (this.messageQueue.length === 0 && !this.messageTimer) {
                    this.isComplete = true;
                    // Add the final message
                    this.setMessage(this.settings.finalMessage);

                } else {
                    setTimeout(checkMessages, this.settings.checkMessageDelay);
                }
            };


            
            // Start checking
            setTimeout(checkMessages, this.settings.checkMessageDelay);
        }
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
        this.processedMessages = this.totalMessages; // Mark all messages as processed
        
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
}