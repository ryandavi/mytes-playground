class CharacterAI {
    constructor() {
        this.states = {
            IDLE: 'idle',
            EXPLORING: 'exploring',
            RUNNING: 'running',
            INTERACTING: 'interacting'
        };
        this.currentState = this.states.IDLE;
        this.energy = 100;
        this.boredom = 0;
        this.lastActionTime = Date.now();
    }

    updateState() {
        const currentTime = Date.now();
        const timeSinceLastAction = currentTime - this.lastActionTime;

        // Update internal states
        this.energy = Math.max(0, Math.min(100, this.energy - timeSinceLastAction / 1000));
        this.boredom = Math.min(100, this.boredom + timeSinceLastAction / 500);

        // Decide on state transition
        const rand = Math.random();
        switch (this.currentState) {
            case this.states.IDLE:
                if (this.energy > 70 && this.boredom > 50 && rand < 0.6) {
                    this.currentState = this.states.EXPLORING;
                } else if (this.energy > 90 && rand < 0.3) {
                    this.currentState = this.states.RUNNING;
                } else if (this.boredom > 80 && rand < 0.4) {
                    this.currentState = this.states.INTERACTING;
                }
                break;
            case this.states.EXPLORING:
                if (this.energy < 30 || (this.boredom < 20 && rand < 0.4)) {
                    this.currentState = this.states.IDLE;
                } else if (this.energy > 80 && rand < 0.3) {
                    this.currentState = this.states.RUNNING;
                } else if (this.boredom > 70 && rand < 0.3) {
                    this.currentState = this.states.INTERACTING;
                }
                break;
            case this.states.RUNNING:
                if (this.energy < 20 || rand < 0.2) {
                    this.currentState = this.states.IDLE;
                } else if (this.boredom > 60 && rand < 0.4) {
                    this.currentState = this.states.EXPLORING;
                }
                break;
            case this.states.INTERACTING:
                if (this.energy < 40 || this.boredom < 30 || rand < 0.3) {
                    this.currentState = this.states.IDLE;
                } else if (rand < 0.4) {
                    this.currentState = this.states.EXPLORING;
                }
                break;
        }

        this.lastActionTime = currentTime;
    }

    doFreeRoamLogic() {
        this.updateState();

        const inWhere = this.limitToContainer ? this.parent.element : null;

        switch (this.currentState) {
            case this.states.IDLE:
                this.queue.addIdle(1000);
                this.energy += 10;
                break;
            case this.states.EXPLORING:
                const exploreElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addMoveToElement(exploreElement);
                this.queue.addIdle(300);
                this.energy -= 5;
                this.boredom -= 15;
                break;
            case this.states.RUNNING:
                const runElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addRunLaps(runElement);
                this.queue.addIdle(500);
                this.energy -= 15;
                this.boredom -= 5;
                break;
            case this.states.INTERACTING:
                const interactElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addMoveToElement(interactElement);
                this.queue.addInteractWithElement(interactElement);
                this.queue.addIdle(200);
                this.energy -= 10;
                this.boredom -= 25;
                break;
        }
    }
}


class CharacterAI2 {
    constructor() {
        this.states = {
            IDLE: 'idle',
            EXPLORING: 'exploring',
            RUNNING: 'running',
            INTERACTING: 'interacting',
            SOCIALIZING: 'socializing',
            SEARCHING: 'searching',
            RESTING: 'resting',
            WORKING: 'working'
        };
        this.currentState = this.states.IDLE;
        
        // Expanded Markov chain transition probabilities
		this.transitionMatrix = {
			[this.states.IDLE]: {
				[this.states.IDLE]: 0.2,
				[this.states.EXPLORING]: 0.2,
				[this.states.RUNNING]: 0.1,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.1,
				[this.states.RESTING]: 0.1,
				[this.states.WORKING]: 0.1
			},
			[this.states.EXPLORING]: {
				[this.states.IDLE]: 0.1,
				[this.states.EXPLORING]: 0.3,
				[this.states.RUNNING]: 0.1,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.2,
				[this.states.RESTING]: 0.05,
				[this.states.WORKING]: 0.05
			},
			[this.states.RUNNING]: {
				[this.states.IDLE]: 0.05,
				[this.states.EXPLORING]: 0.2,
				[this.states.RUNNING]: 0.3,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.15,
				[this.states.RESTING]: 0.05,
				[this.states.WORKING]: 0.05
			},
			[this.states.INTERACTING]: {
				[this.states.IDLE]: 0.1,
				[this.states.EXPLORING]: 0.1,
				[this.states.RUNNING]: 0.05,
				[this.states.INTERACTING]: 0.3,
				[this.states.SOCIALIZING]: 0.2,
				[this.states.SEARCHING]: 0.1,
				[this.states.RESTING]: 0.1,
				[this.states.WORKING]: 0.05
			},
			[this.states.SOCIALIZING]: {
				[this.states.IDLE]: 0.1,
				[this.states.EXPLORING]: 0.1,
				[this.states.RUNNING]: 0.05,
				[this.states.INTERACTING]: 0.2,
				[this.states.SOCIALIZING]: 0.3,
				[this.states.SEARCHING]: 0.1,
				[this.states.RESTING]: 0.1,
				[this.states.WORKING]: 0.05
			},
			[this.states.SEARCHING]: {
				[this.states.IDLE]: 0.1,
				[this.states.EXPLORING]: 0.2,
				[this.states.RUNNING]: 0.15,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.3,
				[this.states.RESTING]: 0.05,
				[this.states.WORKING]: 0.05
			},
			[this.states.RESTING]: {
				[this.states.IDLE]: 0.2,
				[this.states.EXPLORING]: 0.1,
				[this.states.RUNNING]: 0.05,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.1,
				[this.states.RESTING]: 0.3,
				[this.states.WORKING]: 0.05
			},
			[this.states.WORKING]: {
				[this.states.IDLE]: 0.1,
				[this.states.EXPLORING]: 0.1,
				[this.states.RUNNING]: 0.05,
				[this.states.INTERACTING]: 0.1,
				[this.states.SOCIALIZING]: 0.1,
				[this.states.SEARCHING]: 0.1,
				[this.states.RESTING]: 0.05,
				[this.states.WORKING]: 0.4
			}
		};		

        this.energy = 100;
        this.social = 50;
        this.workEthic = 70;
    }

    updateState() {
        // Update internal states
        this.energy = Math.max(0, Math.min(100, this.energy - 1));
        this.social = Math.max(0, Math.min(100, this.social - 0.5));
        this.workEthic = Math.max(0, Math.min(100, this.workEthic - 0.2));

        // Adjust probabilities based on internal states
        if (this.energy < 30) {
            this.transitionMatrix[this.currentState][this.states.RESTING] += 0.3;
        }
        if (this.social < 30) {
            this.transitionMatrix[this.currentState][this.states.SOCIALIZING] += 0.2;
        }
        if (this.workEthic > 80) {
            this.transitionMatrix[this.currentState][this.states.WORKING] += 0.2;
        }

        // Normalize probabilities
        let total = Object.values(this.transitionMatrix[this.currentState]).reduce((a, b) => a + b, 0);
        for (let state in this.transitionMatrix[this.currentState]) {
            this.transitionMatrix[this.currentState][state] /= total;
        }

        // Choose next state
        const rand = Math.random();
        let cumulativeProbability = 0;
        for (let nextState in this.transitionMatrix[this.currentState]) {
            cumulativeProbability += this.transitionMatrix[this.currentState][nextState];
            if (rand <= cumulativeProbability) {
                this.currentState = nextState;
                break;
            }
        }
    }

    doFreeRoamLogic() {
        this.updateState();

        const inWhere = this.limitToContainer ? this.parent.element : null;

        switch (this.currentState) {
            case this.states.IDLE:
                this.queue.addIdle(1000);
                this.energy += 5;
                break;
            case this.states.EXPLORING:
                const exploreElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addMoveToElement(exploreElement);
                this.queue.addIdle(300);
                this.energy -= 5;
                break;
            case this.states.RUNNING:
                const runElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addRunLaps(runElement);
                this.queue.addIdle(500);
                this.energy -= 15;
                break;
            case this.states.INTERACTING:
                const interactElement = this.parent.findClosestElementToMouse(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250, true);
                this.queue.addMoveToElement(interactElement);
                this.queue.addInteractWithElement(interactElement);
                this.queue.addIdle(200);
                this.energy -= 5;
                break;
            case this.states.SOCIALIZING:
                const socialElement = this.parent.findClosestCharacter(this.parent.mousePosX, this.parent.mousePosY, inWhere, 3, 250);
                this.queue.addMoveToElement(socialElement);
                this.queue.addSocializeWithCharacter(socialElement);
                this.social += 20;
                this.energy -= 5;
                break;
            case this.states.SEARCHING:
                const searchArea = this.parent.findRandomArea(inWhere);
                this.queue.addSearchArea(searchArea);
                this.energy -= 10;
                break;
            case this.states.RESTING:
                const restSpot = this.parent.findRestSpot(inWhere);
                this.queue.addMoveToElement(restSpot);
                this.queue.addRest(2000);
                this.energy += 30;
                break;
            case this.states.WORKING:
                const workstation = this.parent.findWorkstation(inWhere);
                this.queue.addMoveToElement(workstation);
                this.queue.addWork(1500);
                this.workEthic += 10;
                this.energy -= 20;
                break;
        }
    }
}