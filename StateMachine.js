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
				[1, 1],
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

		// match states to animation data keys
		this.animations = {
			// name : sprite var name
            'idle': ['idle'],

			// movement
            'idle_N': ['idle_N'],
            'idle_S': ['idle_S'],
            'idle_E': ['idle_E'],
            'idle_W': ['idle_W'],

			// movement
            'moving_N': ['N'],
            'moving_S': ['S'],
            'moving_E': ['E'],
            'moving_W': ['W'],

			// transitions
            'transition_NS': ['verticalTurn'],
            'transition_WE': ['horizontalTurn'],
            'transition_SN': ['verticalTurn'],
            'transition_EW': ['horizontalTurn'],

            'scratch_left': ['scratchLeft'],
            'scratch_right': ['scratchRight'],

			// expressions
			'cry': ['cry_expression'],
			'surprise': ['surprise_expression'],
			'fall': ['fall_expression'],
			'sit': ['sit_expression'],

			// actions
			'dragging': ['dragging'],
			'jumping': ['jumping'],
			'falling': ['falling'],
			'slide_down': ['slide_down'],
			'pickup': ['pickup'],
			'dropping': ['dropping'],
		};

		this.playOnce = ["surprise", "fall", "pickup", "dropping"];

		this.walkingAnimations = ['moving_N', 'moving_S', 'moving_E', 'moving_W'];


		// transition between states
		this.transitionRules = {
            // directional movement
            'moving_N': {
                // from N to S - do NS
                'moving_S': 'transition_NS'
            },
            'moving_S': {
                'moving_N': 'transition_SN'
            },
            'moving_E': {
                'moving_W': 'transition_EW'
            },
            'moving_W': {
                'moving_E': 'transition_WE'
            },

            'pickup': {
				// when pickup is over, do dragging
                'onTransitionEnd': 'dragging'
            },

            'transition_NS': {
                // when NS is over - do S
                'onTransitionEnd': 'moving_S'
            },
            'transition_WE': {
                'onTransitionEnd': 'moving_E'
            },
            'transition_SN': {
                'onTransitionEnd': 'moving_N'
            },
            'transition_EW': {
                'onTransitionEnd': 'moving_W'
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
		return this.walkingAnimations.includes(this.currentState);
	}

	getAnimationKey(){
		return this.animations[this.currentState];
	}

	checkForTransitionRule(direction) {
		return this.transitionRules[this.currentState]?.[direction] || null;
	}

	setState(newState) {


		if(this.isTransitioning){
			// if we're transitioning, keep the state the same
			newState = this.currentState;
		}else{
			// Check for transition rule
			const transitionRule = this.checkForTransitionRule(newState);
			if (transitionRule) {
				newState = transitionRule;
				this.isTransitioning = true;
			}
		}

		// only update if we have a new state
		if (this.currentState !== newState) {
			this.currentState = newState;
			this.currentFrameIndex = 0;
		}


	}

    updateSprite() {

        if (this.isAtLastFrame()) {
            // at the end of animation
			if(this.isTransitioning){
				// transition is over
				this.isTransitioning = false;
				const transitionRule = this.checkForTransitionRule('onTransitionEnd');
				this.setState(transitionRule);
			}else if (this.playOnce.includes(this.currentState)) {
                this.currentFrameIndex = -1; // complete animation
                
                // Check for transition after playOnce animation completes
                const transitionRule = this.checkForTransitionRule('onTransitionEnd');
                if (transitionRule) {
                    this.setState(transitionRule);
                }
            } else {
                this.currentFrameIndex = 0; // start animation over
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
        const spriteFrame = sprite[this.currentFrameIndex];

        this.parent.duplicate.setAttribute("sprite", animationKey);
        this.setSprite(spriteFrame[0], spriteFrame[1]);

        this.updateSprite();
    }

	

}