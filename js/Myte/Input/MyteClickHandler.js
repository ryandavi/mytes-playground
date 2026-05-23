class MyteClickHandler extends MyteBaseHandler {
	constructor(myte) {
		super(myte);

		this.config = {
			doubleClickTimeout: 300,
			longPressTimeout: 500,
			dragThreshold: 10,
			dragTimeThreshold: 300,
			maxYForPickup: 500,
			maxXForPickup: 300,
			clickPressDuration: 100,
			dragModeRestoreDelay: 100
		};

		this.lastClickTime = 0;
		this.lastHomeClickTime = 0;
		this.longPressTimer = null;
		this._homeLongPressTimer = null;
		this.isPressed = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartTime = 0;
		this.isDragging = false;
		this.previousMode = null;

		this._initListeners();
	}

	_initListeners() {
		this._on(this.myte.element,     'click',       this._onInactiveClick.bind(this));
		this._on(this.myte.duplicate,   'click',       this._onActiveClick.bind(this));
		this._on(this.myte.duplicate,   'mousedown',   this._onPressStart.bind(this));
		this._on(document,              'mouseup',     this._onPressEnd.bind(this));
		this._on(document,              'mousemove',   this._onMouseMove.bind(this));
		this._on(this.myte.dropTarget,  'click',       this._onHomeClick.bind(this));
		this._on(this.myte.dropTarget,  'pointerdown', this._onHomePointerDown.bind(this));
		this._on(this.myte.dropTarget,  'pointerup',   this._onHomePointerUp.bind(this));
		this._on(this.myte.dropTarget,  'pointercancel', this._onHomePointerUp.bind(this));
		this._on(this.myte.duplicate,   'contextmenu', this._onContextMenu.bind(this));
	}

	_onInactiveClick(event) {
		if (!this.myte.isActive) {
			event?.preventDefault?.();
			event?.stopImmediatePropagation?.();
			this._activateFromHomeSlot(event);
		}
	}

	_onActiveClick(event) {
		if (this.myte.isActive && !this.isDragging) {
			// In SELECT mode, prefer map objects that sit under the cursor.
			// The myte sprite is large; without this the myte swallows all
			// clicks within its bounding box even when a map object is the
			// intended target.
			if (this.myte.parent.ui.isTool(UIToolModes.SELECT)) {
				const mapObjectEl = this._findMapObjectAt(event.clientX, event.clientY);
				if (mapObjectEl) {
					mapObjectEl.dispatchEvent(new MouseEvent('click', {
						bubbles: true, cancelable: true,
						clientX: event.clientX, clientY: event.clientY,
						view: window
					}));
					return;
				}
			}

			event.stopPropagation();
			if (!this.myte.isActiveMyte) {
				this.myte.parent.setActiveMyte(this.myte);
			}
			if (this.myte.parent.ui.isTool(UIToolModes.SELECT)) {
				this.myte.parent.ui.setSelected(this.myte);
				if (this.myte.isActiveMyte &&
					!this.myte.isDragging &&
					this.myte.parent.getPressDuration() < this.config.clickPressDuration) {
					this._onClick(event);
				}
			}
		}
	}

	_findMapObjectAt(clientX, clientY) {
		const elements = document.elementsFromPoint(clientX, clientY);
		for (const el of elements) {
			if (this.myte.duplicate?.contains(el)) continue;
			const mapEl = el.classList?.contains('map-object') ? el
			            : el.closest?.('.map-object');
			if (mapEl) return mapEl;
		}
		return null;
	}

	_onContextMenu(event) {
		event.preventDefault();
	}

	_sendMyteHome() {
		if (this.myte.isAtHomePosition?.(1)) {
			this.myte.stop?.();
			return;
		}
		this.myte.clearHomeSlotHold?.();
		this.myte.queue.clear();
		this.myte.setMode(MOVE_TYPES.GOHOME);
	}

	_onHomeClick(event) {
		event?.stopPropagation?.();

		if (!this.myte.isActive) {
			this._activateFromHomeSlot(event);
			return;
		}

		if (!this.myte.isActiveMyte) {
			this.myte.parent.setActiveMyte(this.myte);
			return;
		}

		// Double click or long press → go home immediately
		const now = Date.now();
		if (now - this.lastHomeClickTime < this.config.doubleClickTimeout) {
			this.lastHomeClickTime = 0;
			this._sendMyteHome();
			return;
		}
		this.lastHomeClickTime = now;

		// Single click → show slot info in sidebar (click the myte sprite for myte info)
		this.myte.parent.ui?.setSelected?.(this.myte.dropTarget);
	}

	_onHomePointerDown(event) {
		if (!this.myte.isActive || !this.myte.isActiveMyte) return;
		this._homeLongPressTimer = setTimeout(() => {
			this._homeLongPressTimer = null;
			this._sendMyteHome();
		}, this.config.longPressTimeout);
	}

	_onHomePointerUp(event) {
		if (this._homeLongPressTimer) {
			clearTimeout(this._homeLongPressTimer);
			this._homeLongPressTimer = null;
		}
	}

	_activateFromHomeSlot(event) {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		this.myte.startWithOptions({
			goal: DEFAULT_MODE,
			followGoal: this.myte.followGoal,
			autonomyGoal: this.myte.autonomyGoal
		});
		this.myte.parent.setActiveMyte(this.myte);
		this.myte.holdInHomeSlotUntilPointerLeaves?.();
	}

	_onClick(event) {
		const now = Date.now();
		if (now - this.lastClickTime < this.config.doubleClickTimeout) {
			this._onDoubleClick(event);
		}
		this.lastClickTime = now;
	}

	_onDoubleClick() {
		this.myte.queue.addExpression('surprise');
		this.myte.queue.addExpression('dance');
	}

	_onPressStart(event) {
		if (!this.myte.isActiveMyte) return;

		this.isPressed = true;
		this.dragStartX = event.clientX;
		this.dragStartY = event.clientY;
		this.dragStartTime = Date.now();
		this.isDragging = false;

		this.longPressTimer = setTimeout(() => {
			if (this.isPressed) this._onLongPress(event);
		}, this.config.longPressTimeout);
	}

	_onMouseMove(event) {
		if (!this.isPressed || !this.myte.isActiveMyte || this.myte.isDragging) return;
		if (!this.myte.parent.ui.isTool(UIToolModes.SELECT)) return;

		const dx = event.clientX - this.dragStartX;
		const dy = event.clientY - this.dragStartY;
		const distance = Math.sqrt(dx * dx + dy * dy);
		const timeElapsed = Date.now() - this.dragStartTime;

		if (
			distance > this.config.dragThreshold &&
			timeElapsed > this.config.dragTimeThreshold &&
			!this.isDragging &&
			event.clientY < this.dragStartY &&
			this.dragStartY - event.clientY > this.config.dragThreshold &&
			this.dragStartY - event.clientY < this.config.maxYForPickup &&
			Math.abs(this.dragStartX - event.clientX) < this.config.maxXForPickup
		) {
			this.isDragging = true;
			this.previousMode = UIToolModes.SELECT;
			this._switchToDragMode();

			if (this.longPressTimer) {
				clearTimeout(this.longPressTimer);
				this.longPressTimer = null;
			}
		}
	}

	_switchToDragMode() {
		this.myte.parent.ui.changeToolMode(UIToolModes.DRAG);
		if (!this.myte.isActiveMyte) {
			this.myte.parent.setActiveMyte(this.myte);
		}

		const touchHandler = this.myte.inputHandler?.touchHandler;
		if (!touchHandler) return;

		touchHandler.handleStart({
			preventDefault: () => {},
			clientX: this.dragStartX,
			clientY: this.dragStartY,
			type: 'mousedown'
		});

		// If the mouse was released before we got here, end immediately
		const inputSystem = InputSystem.getInstance();
		if (!inputSystem.isMouseButtonPressed()) {
			touchHandler.handleEnd({ type: 'mouseup', changedTouches: null });
		}
	}

	_onPressEnd(event) {
		if (!this.isPressed) return;

		this.isPressed = false;

		// Safety valve: if the touch handler is still dragging (e.g. setTimeout race),
		// force-end it now so the myte doesn't get stuck in drag state.
		const touchHandler = this.myte.inputHandler?.touchHandler;
		if (this.isDragging && touchHandler?.isDragging) {
			touchHandler.handleEnd({ type: 'mouseup', changedTouches: null });
		}

		this.isDragging = false;

		if (this.previousMode && this.myte.parent.ui.isTool(UIToolModes.DRAG)) {
			setTimeout(() => {
				this.myte.parent.ui.changeToolMode(this.previousMode);
				this.previousMode = null;
			}, this.config.dragModeRestoreDelay);
		}

		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
			this.longPressTimer = null;
		}
	}

	_onLongPress() {
		if (this.myte.isActiveMyte) {
			this.myte.queue.addExpression('surprise');
		}
	}

	dispose() {
		if (this.longPressTimer) {
			clearTimeout(this.longPressTimer);
		}
		if (this._homeLongPressTimer) {
			clearTimeout(this._homeLongPressTimer);
		}
		super.dispose();
	}
}
