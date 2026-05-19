class MyteInputHandler {
	constructor(myte) {
		this.myte = myte;
		this.touchHandler = new MyteTouchHandler(myte);
		this.rubbingHandler = new MyteRubbingHandler(myte);
		this.clickHandler = new MyteClickHandler(myte);
	}

	dispose() {
		this.touchHandler?.dispose?.();
		this.rubbingHandler?.dispose?.();
		this.clickHandler?.dispose?.();
	}
}

