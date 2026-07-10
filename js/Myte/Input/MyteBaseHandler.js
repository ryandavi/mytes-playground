class MyteBaseHandler {
	constructor(myte) {
		this.myte = myte;
		this._listeners = [];
	}

	// Register an event listener and track it for auto-cleanup on dispose().
	_on(target, event, handler, options) {
		target.addEventListener(event, handler, options);
		this._listeners.push({ target, event, handler, options });
		return handler;
	}

	dispose() {
		this._listeners.forEach(({ target, event, handler, options }) => {
			target.removeEventListener(event, handler, options);
		});
		this._listeners = [];
	}
}
