class MarkovChain {
	constructor(states, transitionConfig) {
		this.states = states;
		this.transitionConfig = transitionConfig;
		this.currentState = this.states[0]; // Initialize to the first state
	}

	getNextState() {
		const currentStateTransitions = this.transitionConfig[this.currentState];
		if (!currentStateTransitions) {
			throw new Error('Invalid current state');
		}

		// Generate a random number between 0 and 1
		const randomValue = Math.random();

		// Determine the next state based on transition probabilities
		let cumulativeProbability = 0;
		for (const nextState in currentStateTransitions) {
			cumulativeProbability += currentStateTransitions[nextState];
			if (randomValue <= cumulativeProbability) {
				this.currentState = nextState;
				return this.currentState;
			}
		}
	}

	getCurrentState() {
		return this.currentState;
	}
}

/*

// Create a MarkovChain instance
const actionSystem = new MarkovChain(actions, actionConfig);

// Example usage
for (let i = 0; i < 10; i++) {
	console.log(`Step ${i + 1}: ${actionSystem.getCurrentState()}`);
	actionSystem.getNextState();
}

*/