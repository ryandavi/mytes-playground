class MyteClickHandler extends MyteBaseHandler {
	constructor(myte) {
		super(myte);

		const gestureConfig = SiteConfig?.interaction?.gestures ?? {};
		const myteControlConfig = SiteConfig?.interaction?.myte ?? {};

		this.config = {
			doubleClickTimeout: gestureConfig.doubleClickInterval ?? 300,
			longPressTimeout: gestureConfig.longPressDelay ?? 500,
			dragThreshold: myteControlConfig.dragThreshold ?? 10,
			dragTimeThreshold: myteControlConfig.dragTimeThreshold ?? 300,
			maxYForPickup: myteControlConfig.pickupMaxY ?? 500,
			maxXForPickup: myteControlConfig.pickupMaxX ?? 300,
			clickPressDuration: myteControlConfig.clickPressDuration ?? 100,
			dragModeRestoreDelay: myteControlConfig.dragModeRestoreDelay ?? 100
		};

		this.lastClickTime = 0;
		this.lastHomeClickTime = 0;
		this.lastInactiveClickTime = 0;
		this.longPressTimer = null;
		this._homeLongPressTimer = null;
		this._inactiveLongPressTimer = null;
		this.isPressed = false;
		this.dragStartX = 0;
		this.dragStartY = 0;
		this.dragStartTime = 0;
		this.isDragging = false;
		this.previousMode = null;
		this._homePressState = null;
		this._suppressNextInactiveClick = false;
		this._suppressNextHomeClick = false;

		this._initListeners();
	}

	_initListeners() {
		this._on(this.myte.element,     'click',       this._onInactiveClick.bind(this));
		this._on(this.myte.element,     'mousedown',   this._onInactivePressStart.bind(this));
		this._on(this.myte.element,     'pointerdown', this._onInactivePointerDown.bind(this));
		this._on(this.myte.element,     'pointerup',   this._onInactivePointerUp.bind(this));
		this._on(this.myte.element,     'pointercancel', this._onInactivePointerUp.bind(this));
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
		if (this.myte.isActive) return;

		event?.preventDefault?.();
		event?.stopImmediatePropagation?.();

		if (this._suppressNextInactiveClick) {
			this._suppressNextInactiveClick = false;
			return;
		}

		const now = Date.now();
		if (now - this.lastInactiveClickTime < this.config.doubleClickTimeout) {
			this.lastInactiveClickTime = 0;
			this._activateFromHomeSlot(event);
			return;
		}

		this.lastInactiveClickTime = now;
		this.myte.parent.ui?.setSelected?.(this.myte);
	}

	_onInactivePressStart(event) {
		if (this.myte.isActive || event?.button !== 0) return;

		this.isPressed = true;
		this.isDragging = false;
		this.dragStartX = event.clientX;
		this.dragStartY = event.clientY;
		this.dragStartTime = Date.now();
		this._homePressState = {
			startX: event.clientX,
			startY: event.clientY,
			startTime: this.dragStartTime
		};
	}

	_onInactivePointerDown(event) {
		if (this.myte.isActive || event?.pointerType === 'mouse') return;

		this._inactiveLongPressTimer = setTimeout(() => {
			this._inactiveLongPressTimer = null;
			this._suppressNextInactiveClick = true;
			this._activateFromHomeSlot(event);
		}, this.config.longPressTimeout);
	}

	_onInactivePointerUp() {
		if (this._inactiveLongPressTimer) {
			clearTimeout(this._inactiveLongPressTimer);
			this._inactiveLongPressTimer = null;
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

		if (this._suppressNextHomeClick) {
			this._suppressNextHomeClick = false;
			return;
		}

		if (!this.myte.isActive) {
			this.myte.parent.ui?.setSelected?.(this.myte.dropTarget);
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
			this._suppressNextHomeClick = true;
			this._sendMyteHome();
		}, this.config.longPressTimeout);
	}

	_onHomePointerUp(event) {
		if (this._homeLongPressTimer) {
			clearTimeout(this._homeLongPressTimer);
			this._homeLongPressTimer = null;
		}
	}

	_activateFromHomeSlot(event, { holdInSlot = true } = {}) {
		event?.preventDefault?.();
		event?.stopPropagation?.();
		this.myte.startWithOptions({
			goal: DEFAULT_MODE,
			followGoal: this.myte.followGoal,
			autonomyGoal: this.myte.autonomyGoal
		});
		this.myte.parent.setActiveMyte(this.myte);
		if (holdInSlot) {
			this.myte.holdInHomeSlotUntilPointerLeaves?.();
		} else {
			this.myte.clearHomeSlotHold?.();
		}
	}

	_onClick(event) {
		const now = Date.now();
		if (now - this.lastClickTime < this.config.doubleClickTimeout) {
			this._onDoubleClick(event);
		}
		this.lastClickTime = now;
	}

	_onDoubleClick() {
		this.myte.queue.interrupt('expression', { actionType: 'surprise' });
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
		if (this._homePressState &&
			!this.myte.isActive &&
			!this.myte.isDragging &&
			this.myte.parent.ui.isTool(UIToolModes.SELECT)) {
			const dx = event.clientX - this._homePressState.startX;
			const dy = event.clientY - this._homePressState.startY;
			const distance = Math.sqrt(dx * dx + dy * dy);
			const timeElapsed = Date.now() - this._homePressState.startTime;

			const passesPickupGesture =
				distance > this.config.dragThreshold &&
				timeElapsed > this.config.dragTimeThreshold &&
				event.clientY < this._homePressState.startY &&
				this._homePressState.startY - event.clientY > this.config.dragThreshold &&
				this._homePressState.startY - event.clientY < this.config.maxYForPickup &&
				Math.abs(this._homePressState.startX - event.clientX) < this.config.maxXForPickup;

			if (passesPickupGesture) {
				this._suppressNextInactiveClick = true;
				this._activateFromHomeSlot(null, { holdInSlot: false });
				this.isDragging = true;
				this.previousMode = UIToolModes.SELECT;
				this._switchToDragMode(
					{ x: this._homePressState.startX, y: this._homePressState.startY },
					{ x: event.clientX, y: event.clientY }
				);
				this._homePressState = null;
				this._onInactivePointerUp();
				return;
			}
		}

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

	_switchToDragMode(startPosition = null, currentPosition = null) {
		this.myte.parent.ui.changeToolMode(UIToolModes.DRAG);
		if (!this.myte.isActiveMyte) {
			this.myte.parent.setActiveMyte(this.myte);
		}

		const touchHandler = this.myte.inputHandler?.touchHandler;
		if (!touchHandler) return;

		const dragStart = {
			x: startPosition?.x ?? this.dragStartX,
			y: startPosition?.y ?? this.dragStartY
		};

		touchHandler.autoPickup = true;
		touchHandler.handleStart({
			preventDefault: () => {},
			clientX: dragStart.x,
			clientY: dragStart.y,
			type: 'mousedown'
		});

		if (currentPosition) {
			touchHandler.handleMove({
				preventDefault: () => {},
				clientX: currentPosition.x,
				clientY: currentPosition.y,
				type: 'mousemove'
			});
		}

		// If the mouse was released before we got here, end immediately
		const inputSystem = InputSystem.getInstance();
		if (!inputSystem.isMouseButtonPressed()) {
			touchHandler.handleEnd({ type: 'mouseup', changedTouches: null });
		}
	}

	_onPressEnd(event) {
		if (!this.isPressed) return;

		this.isPressed = false;
		this._homePressState = null;
		this._onInactivePointerUp();

		// Safety valve: if the touch handler is still dragging (e.g. setTimeout race),
		// force-end it now so the myte doesn't get stuck in drag state.
		const touchHandler = this.myte.inputHandler?.touchHandler;
		if (this.isDragging && touchHandler?.isDragging) {
			touchHandler.handleEnd({ type: 'mouseup', changedTouches: null });
		}

		this.isDragging = false;

		if (this.previousMode && this.myte.parent.ui.isTool(UIToolModes.DRAG)) {
			const modeToRestore = this.previousMode;
			this.previousMode = null;
			setTimeout(() => {
				this.myte.parent.ui.changeToolMode(modeToRestore);
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
		if (this._inactiveLongPressTimer) {
			clearTimeout(this._inactiveLongPressTimer);
		}
		super.dispose();
	}
}
