class StateMachine {
	constructor(parent, state) {
		this.currentState = state;
		this.currentFrameIndex = 0;

		this.parent = parent;

		this.isTransitioning = false;

		this.sprite = this.parent.duplicate.querySelector('.sprite');

		/********************************************
		 * VISUAL
		********************************************/
	
		this.size = {
			width: 64,
			height: 64
		}

		this.feetBox = {
			x: 0,
			y: 32,
			width: 64 - 6 - 6,
			height: 64 - 32 - 4
		}

		this.spriteSets = {
			S: [
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0]
			],
			W: [
				[0, 1],
				[1, 1],
				[2, 1],
				[3, 1]
			],
			E: [
				[0, 2],
				[1, 2],
				[2, 2],
				[3, 2]
			],
			N: [
				[0, 3],
				[1, 3],
				[2, 3],
				[3, 3]
			],

			dance: [
				[0, 0],
				[0, 1],
				[0, 2],
				[0, 3]
			],
			
			horizontalTurn: [
				[0, 0]
			],
			verticalTurn: [
				[1, 2],
			],
			idle: [
				[0, 4],
				[1, 4]
			],
			dragging: [
				[0, 4],
				[1, 4]
			],

			scratchLeft: [
				[0, 1],
				[0, 1],
				[2, 1],
				[3, 1]
			],
			scratchRight: [
				[0, 2],
				[1, 2],
				[2, 2],
				[3, 2]
			],

			cry_expression: [
				[0, 5],
				[1, 5],
				[2, 5]
			],
			fall_expression: [
				[1, 5],
				[2, 5]
			],
			sit_expression: [
				[0, 5],
				[1, 5],
				[2, 5]
			],
			surprise_expression: [
				[0, 5],
				[1, 5],
				[2, 5]
			],

			kiss_expression: [
				[1, 4]
			],	

			jumping: [
				[0, 4]
			],
			falling: [
				[1, 4]
			],
			slide_down: [
				[0, 3]
			],
		};


		this.stateConfig = {
            // Idle states
            'idle': {
                spriteSet: ['idle'],
                repeat: true
            },
            'idle_N': {
                spriteSet: ['idle_N'],
                repeat: true
            },
            'idle_S': {
                spriteSet: ['idle_S'],
                repeat: true
            },
            'idle_E': {
                spriteSet: ['idle_E'],
                repeat: true
            },
            'idle_W': {
                spriteSet: ['idle_W'],
                repeat: true
            },

            // Movement states
            'moving_N': {
                spriteSet: ['N'],
                repeat: true,
                transitions: {
                    'moving_S': 'transition_NS'
                }
            },
            'moving_S': {
                spriteSet: ['S'],
                repeat: true,
                transitions: {
                    'moving_N': 'transition_SN'
                }
            },
            'moving_E': {
                spriteSet: ['E'],
                repeat: true,
                transitions: {
                    'moving_W': 'transition_EW'
                }
            },
            'moving_W': {
                spriteSet: ['W'],
                repeat: true,
                transitions: {
                    'moving_E': 'transition_WE'
                }
            },

            // Transition states
            'transition_NS': {
                spriteSet: ['verticalTurn'],
                repeat: true,
                onTransitionEnd: 'moving_S'
            },
            'transition_SN': {
                spriteSet: ['verticalTurn'],
                repeat: true,
                onTransitionEnd: 'moving_N'
            },
            'transition_WE': {
                spriteSet: ['horizontalTurn'],
                repeat: true,
                onTransitionEnd: 'moving_E'
            },
            'transition_EW': {
                spriteSet: ['horizontalTurn'],
                repeat: true,
                onTransitionEnd: 'moving_W'
            },

            // Action states
            'scratch_left': {
                spriteSet: ['scratchLeft'],
                repeat: true
            },
            'scratch_right': {
                spriteSet: ['scratchRight'],
                repeat: true
            },

            // Expression states
            'cry': {
                spriteSet: ['cry_expression'],
                repeat: false
            },
            'surprise': {
                spriteSet: ['surprise_expression'],
                repeat: false
            },
            'fall': {
                spriteSet: ['fall_expression'],
                repeat: false
            },
            'sit': {
                spriteSet: ['sit_expression'],
                repeat: false
            },
			'kiss': {
				spriteSet: ['kiss_expression'],
				repeat: false
			},

            // Special states
            'dragging': {
                spriteSet: ['dragging'],
                repeat: true
            },
            'pickup': {
                spriteSet: ['pickup'],
                repeat: false,
                onTransitionEnd: 'dragging'
            },
            'dropping': {
                spriteSet: ['dropping'],
                repeat: false
            },
            'jumping': {
                spriteSet: ['jumping'],
                repeat: true
            },
            'falling': {
                spriteSet: ['falling'],
                repeat: true
            },
            'slide_down': {
                spriteSet: ['slide_down'],
                repeat: true
            }
        };

	}

	setSnail(){

		this.parent.duplicate.classList.add('snail');	

		this.size = {
			width: 192,
			height: 192
		}

		this.spriteSets = {
			E: [
				[0, 0],
				[1, 0],
				[2, 0],
				[3, 0],
				[4, 0],
				[5, 0],
				[6, 0],
				[7, 0]
			],
			W: [
				[0, 1],
				[1, 1],
				[2, 1],
				[3, 1],
				[4, 1],
				[5, 1],
				[6, 1],
				[7, 1]
			],
			N: [
				[0, 2],
				[1, 2],
				[2, 2],
				[3, 2],
				[4, 2],
				[5, 2],
				[6, 2],
				[7, 2]
			],
			S: [
				[0, 3],
				[1, 3],
				[2, 3],
				[3, 3],
				[4, 3],
				[5, 3],
				[6, 3],
				[7, 3]
			],
			horizontalTurn: [
				[3, 3],
			],
			verticalTurn: [
				[4, 0],
			],

			// IDLE
			idle: [
				[0, 3]
			],

			idle_E: [
				[0, 0]
			],
			idle_W: [
				[0, 1]
			],
			idle_N: [
				[0, 2]
			],
			idle_S: [
				[0, 3]
			],

			dragging: [
				[0, 5]
			],
			pickup: [
				[0, 4],
				//[1, 4],
				[2, 4],
				//[3, 4],
				[4, 4],
				//[5, 4],
				[6, 4]
				//[7, 4]
			],

			dropping: [
				//[7, 4],
				[6, 4],
				//[5, 4],
				[4, 4],
				//[3, 4],
				[2, 4],
				//[1, 4],
				[0, 4]
			],

			scratchLeft: [
				[0, 3]
			],
			scratchRight: [
				[0, 3]
			],

			cry_expression: [
				[0, 3]
			],
			fall_expression: [
				[0, 3]
			],
			sit_expression: [
				[0, 3]
			],
			surprise_expression: [
				[0, 3]
			],

			jumping: [
				[7, 4]
			],
			falling: [
				[7, 4]
			],
			slide_down: [
				[0, 3]
			],
		};
	}


	isWalking(){
		return ['moving_N', 'moving_S', 'moving_E', 'moving_W'].includes(this.currentState);
	}

    getAnimationKey() {
        return this.stateConfig[this.currentState]?.spriteSet[0];
    }

    checkForTransitionRule(direction) {
        return this.stateConfig[this.currentState]?.transitions?.[direction];
    }

    setState(newState) {
        if (this.isTransitioning) {
            newState = this.currentState;
        } else {
            const transitionRule = this.checkForTransitionRule(newState);
            if (transitionRule) {
                newState = transitionRule;
                this.isTransitioning = true;
            }
        }

        if (this.currentState !== newState) {
            this.currentState = newState;
            this.currentFrameIndex = 0;
        }
    }

    updateSprite() {
        if (this.isAtLastFrame()) {
            if (this.isTransitioning) {
                this.isTransitioning = false;
                const nextState = this.stateConfig[this.currentState]?.onTransitionEnd;
                if (nextState) {
                    this.setState(nextState);
                }
            } else if (!this.stateConfig[this.currentState]?.repeat) {
                this.currentFrameIndex = -1;
                const nextState = this.stateConfig[this.currentState]?.onTransitionEnd;
                if (nextState) {
                    this.setState(nextState);
                }
            } else {
                this.currentFrameIndex = 0;
            }
        } else {
            this.currentFrameIndex++;
        }
    }

	isAtLastFrame(){
		return this.currentFrameIndex == this.getCurrentSprite().length - 1;
	}

	isAnimationComplete(){
		return this.currentFrameIndex == -1;
	}

	setSprite(x, y){
		this.sprite.style.backgroundPosition = `${(x) * -this.size.width}px ${(y) * -this.size.height}px`;
	}

	getCurrentSprite(){
		return this.spriteSets[this.getAnimationKey()];
	}
	

    update(){
        const animationKey = this.getAnimationKey();
        const sprite = this.getCurrentSprite();

		if(animationKey && sprite){
			const spriteFrame = sprite[this.currentFrameIndex];

			this.parent.duplicate.setAttribute("sprite", animationKey);
			this.setSprite(spriteFrame[0], spriteFrame[1]);

			this.updateSprite();
		}else{
			console.log("Error with " + animationKey + " ("+this.currentState+") sprite");
		}
    }

	

}