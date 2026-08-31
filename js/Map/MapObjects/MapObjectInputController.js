class MapObjectInputController {
	constructor(object) {
		this.object = object;
	}

	initializeInputComponents() {
		const object = this.object;
		if (!object.element || !object.parent) return;

		if (object.getConfig('interaction.interactive', true) || object.canShowSelectPointer()) object.initClickComponent();
		if (object.getConfig('draggable', false)) object.initDragComponent();
		if (object.getConfig('rubbable', false)) object.initRubbingComponent();

		Object.values(object.inputComponents).forEach(component => {
			if (!component.element) component.element = object.element;
			component.initialize();
		});
	}

	initClickComponent() {
		const object = this.object;
		if (object.inputComponents.click) return;
		object.inputComponents.click = new ClickComponent(object, {
			element: object.element,
			enabled: true,
			doubleClickInterval: object.getConfig('interactionGestures.doubleClickInterval', SiteConfig.interaction.gestures.doubleClickInterval),
			longPressDelay: object.getConfig('interactionGestures.longPressDelay', SiteConfig.interaction.gestures.longPressDelay),
			clickMoveThreshold: object.getConfig('interactionGestures.clickMoveThreshold', SiteConfig.interaction.gestures.clickMoveThreshold),
			canClick: () => object.active,
			onClick: (event) => object.handleSingleClick(event),
			onDoubleClick: (event) => object.handleDoubleClick(event),
			onLongPress: (event) => {
				if (object.canStartSelectModeDrag()) {
					object.parent?.ui?.changeToolMode(UIToolModes.DRAG);
					object.startDrag();
				} else {
					object.handleLongPress(event);
				}
			}
		});
	}

	initDragComponent() {
		const object = this.object;
		if (object.inputComponents.drag) return;
		object.inputComponents.drag = new DragComponent(object, {
			element: object.element,
			enabled: true,
			autoActivate: false,
			canDrag: (event) => object.active && object.canBeDragged() && this.isTopmostAtPointer(event),
			dragThreshold: object.getConfig('dragThreshold', SiteConfig.interaction.mapObject.dragThreshold),
			dragTimeThreshold: 0,
			preventDefaultsForDrag: true,
			onDragStart: (event) => {
				object.isDragging = true;
				object._dragOriginX = object.posX;
				object._dragOriginY = object.posY;
				object._dragOriginDirection = object.getConfig('facingDirection', null);
				object.onPlacementDragStart?.();
				object.syncRenderLayer();
				object.element.classList.add('is-dragging');
				// The drag can end in the inventory, so it must be able to reach it
				// without the map sliding away underneath on the approach.
				object.container?.camera?.beginTemporaryCursorFollow?.(this, {
					blockedEdges: object.container?.inventory?.getBlockedDragEdges?.() ?? null
				});
				const pointerWorld = object.container?.inputHandler?.screenToWorldCoordinates?.(
					event.position.clientX,
					event.position.clientY
				);
				object._dragGrabOffset = pointerWorld
					? { x: pointerWorld.x - object.posX, y: pointerWorld.y - object.posY }
					: { x: 0, y: 0 };
				if (object.container?.ui) object.container.ui.setSelected(object);
				object.playConfiguredSound?.('pickup');
				this._removeStorageDragPreview();
				if (object.getConfig('directionConfigs', null) && SiteConfig.objects.canRotate) {
					object._rotateKeyHandler = (e) => {
						if ((e.key === 'r' || e.key === 'R') && object.isDragging) {
							e.preventDefault();
							object._rotateDuringDrag();
						}
					};
					window.addEventListener('keydown', object._rotateKeyHandler);
				}
			},
			onDragMove: (event) => {
				const clientX = event.originalEvent?.clientX ?? event.position?.clientX;
				const clientY = event.originalEvent?.clientY ?? event.position?.clientY;
				this.placeAtScreenPoint(
					Number.isFinite(clientX) ? clientX : event.position.x,
					Number.isFinite(clientY) ? clientY : event.position.y
				);
			},
			onDragEnd: (event) => {
				object.isDragging = false;
				object._dragGrabOffset = null;
				object.container?.camera?.endTemporaryCursorFollow?.(this);
				object.element.classList.remove('is-dragging');
				object.hideDropTarget();
				object.container?.inventory?.inventoryElement?.classList.remove('is-store-target', 'is-store-target-invalid');
				this._removeStorageDragPreview();
				if (object._rotateKeyHandler) {
					window.removeEventListener('keydown', object._rotateKeyHandler);
					object._rotateKeyHandler = null;
				}
				const originalEvent = event?.originalEvent;
				if (originalEvent && this.canStoreToInventory() &&
					object.container?.inventory?.isPointInside?.(originalEvent.clientX, originalEvent.clientY)) {
					if (object.container.inventory.storeMapObject(object)) {
						// Storing skips the placement path entirely, so anything
						// that latched state on drag start has to be released
						// here or it stays latched forever.
						object.onPlacementStored?.();
						return;
					}
				}
				if (object.getConfig('snapToGrid', false)) object.snapToGrid();
				if (object.container?.clampEntityPosition) {
					const clampedWorld = typeof object.clampPlacementPosition === 'function'
						? object.clampPlacementPosition(object.posX, object.posY)
						: object.container.clampEntityPosition(object, object.posX, object.posY);
					object.posX = clampedWorld.x;
					object.posY = clampedWorld.y;
					object.updatePosition();
				}
				const isValid = object.checkDropValidity(object.posX, object.posY);
				if (!isValid) {
					// Asked here, while the object is still where it was dropped:
					// once it has sprung back to its origin the position it was
					// refused for is gone, and every refusal reads as valid.
					const refusal = object.container?.buildRules?.canPlaceAt(object, object.posX, object.posY);
					const safePosition = object.restoreInvalidDropToOrigin?.() === true ? null : object.gameMap?.gridSystem?.findNearestValidPositionForEntity?.(
						object,
						object.posX,
						object.posY,
						12
					);
					if (safePosition) {
						object.posX = safePosition.x;
						object.posY = safePosition.y;
						object.updatePosition();
						object.playConfiguredSound?.('drop');
					} else {
						object.posX = object._dragOriginX;
						object.posY = object._dragOriginY;
						if (object._dragOriginDirection !== null &&
							object._dragOriginDirection !== object.getConfig('facingDirection', null)) {
							object.applyFacingDirection(object._dragOriginDirection);
						}
						object.updatePosition();
						object.playConfiguredSound?.('drop_error');
						// A thing that springs back to where it started, with a
						// noise, is a thing that has not said why. Wall-mounted
						// objects need this most: "not there" is the whole
						// interaction with a painting or a door.
						object.container?.ui?.showMessage?.(
							refusal?.reason || BuildRules.describePlacementRefusal(),
							'warning',
							'Placement'
						);
					}
				} else {
					object.playConfiguredSound?.('drop');
				}
				object.syncRenderLayer();
				object.onPlacementDragEnd?.();
				object.handleMovedEvent();
				this._pushMoveCommand();
			}
		});
	}

	/**
	 * A completed drag is one undoable move. The origin was already captured on
	 * drag start for the invalid-drop restore; those same values are the inverse.
	 */
	_pushMoveCommand() {
		const object = this.object;
		const history = object.container?.buildHistory;
		if (!history) return;

		const from = { x: object._dragOriginX, y: object._dragOriginY, direction: object._dragOriginDirection };
		const to = { x: object.posX, y: object.posY, direction: object.getConfig('facingDirection', null) };
		if (from.x === to.x && from.y === to.y && from.direction === to.direction) return;

		const place = (state) => {
			if (state.direction !== null && state.direction !== object.getConfig('facingDirection', null)) {
				object.applyFacingDirection(state.direction);
			}
			object.posX = state.x;
			object.posY = state.y;
			object.updatePosition();
			object.syncRenderLayer();
			object.handleMovedEvent();
		};

		history.push({
			label: `Move ${object.getDisplayName()}`,
			undo: () => place(from),
			redo: () => place(to)
		});
	}

	/**
	 * Objects overlap — a bed sits on a rug, a rug spans half a room — and every
	 * one of them whose box contains the pointer offers to be dragged. The drag
	 * claim is first-come, so without this the object underneath can win and the
	 * one you actually clicked never moves. Whatever is drawn on top is what the
	 * player meant.
	 */
	isTopmostAtPointer(event) {
		const clientX = event?.position?.clientX ?? event?.originalEvent?.clientX;
		const clientY = event?.position?.clientY ?? event?.originalEvent?.clientY;
		if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return true;

		const hit = document.elementFromPoint(clientX, clientY);
		if (!hit) return true;
		const owner = hit.closest('.map-object, .world-myte');
		// Nothing of ours under the pointer (a UI overlay, say): leave the
		// existing behaviour alone rather than blocking every drag.
		return !owner || owner === this.object.element;
	}

	// Dropping furniture on the inventory is storing it, so it answers to the
	// same rule the Store button does.
	canStoreToInventory() {
		const object = this.object;
		const container = object.container;
		const rules = container?.buildRules;
		if (rules?.isBuildModeObject(object) && container?.gameMode?.isBuild() !== true) return false;
		return rules ? rules.canStoreObject(object).allowed : object.isInUse?.() !== true;
	}

	_updateStorageDragPreview(clientX, clientY) {
		const object = this.object;
		const inventory = object.container?.inventory;
		const inventoryElement = inventory?.inventoryElement;
		const isOverInventory = Number.isFinite(clientX) && Number.isFinite(clientY) &&
			inventory?.isPointInside?.(clientX, clientY) === true;
		const itemDefinition = ItemRegistry.findItemForWorldObject(object);
		const canStore = !!itemDefinition &&
			this.canStoreToInventory() &&
			inventory?.canAddItem?.(itemDefinition.id, 1) === true;

		inventoryElement?.classList.toggle('is-store-target', isOverInventory && canStore);
		inventoryElement?.classList.toggle('is-store-target-invalid', isOverInventory && !canStore);

		if (!isOverInventory) {
			this._removeStorageDragPreview();
			return;
		}

		if (!object._storageDragPreview) {
			const preview = object.element?.cloneNode?.(true);
			if (!preview) return;
			preview.removeAttribute('data-object-id');
			preview.classList.add('map-object-storage-ghost');
			preview.setAttribute('aria-hidden', 'true');
			Object.assign(preview.style, {
				position: 'fixed',
				width: `${object.size.width}px`,
				height: `${object.size.height}px`,
				pointerEvents: 'none',
				zIndex: 'var(--z-dragged)',
				transformOrigin: 'center'
			});
			document.body.appendChild(preview);
			object._storageDragPreview = preview;
			object.element?.classList.add('is-storage-preview-source');
		}

		const zoom = object.container?.camera?.zoomLevel || 1;
		object._storageDragPreview.style.left = `${clientX}px`;
		object._storageDragPreview.style.top = `${clientY}px`;
		object._storageDragPreview.style.transform = `translate(-50%, -50%) scale(${zoom})`;
	}

	_removeStorageDragPreview() {
		const object = this.object;
		object.element?.classList.remove('is-storage-preview-source');
		object._storageDragPreview?.remove();
		object._storageDragPreview = null;
	}

	initRubbingComponent() {
		const object = this.object;
		if (object.inputComponents.rubbing) return;
		object.inputComponents.rubbing = new RubbingComponent(object, {
			element: object.element,
			enabled: true,
			canRub: () => object.active && object.parent?.ui?.isTool(UIToolModes.PET),
			minTimeBetweenRubs: object.getConfig('rubCooldown', 5000),
			onRubStart: () => object.element.classList.add('being-rubbed'),
			onRubProgress: (event) => {
				if (object.getConfig('rubFeedback')) object.handleRubProgress(event.count);
			},
			onRubComplete: (event) => {
				object.element.classList.remove('being-rubbed');
				if (object.getConfig('onRub')) object.handleRubEvent(event.count);
			},
			onRubOverdone: (event) => {
				object.element.classList.remove('being-rubbed');
				if (object.getConfig('onRubOverdone')) object.handleRubOverdone(event.count);
			}
		});
	}

	/**
	 * Ctrl held during a drag snaps the object to grid cells; free-drag is the
	 * default because placement is pixel-based. The modifier is read per move
	 * rather than latched at drag start, so it can be taken and released
	 * mid-drag. Same top-left snap the inventory placement path uses, so a
	 * dragged object and a freshly placed one land on the same cells.
	 */
	/**
	 * Put the dragged object under a screen point. Both the pointer moving and
	 * the camera moving under a still pointer end up here, because they are the
	 * same question — where in the world is this bit of screen now — and only
	 * one of them used to be asked.
	 */
	placeAtScreenPoint(screenX, screenY) {
		const object = this.object;
		if (!object?.isDragging) return;

		const world = object.container?.inputHandler?.screenToWorldCoordinates
			? object.container.inputHandler.screenToWorldCoordinates(screenX, screenY)
			: { x: object.posX, y: object.posY };
		world.x -= object._dragGrabOffset?.x ?? 0;
		world.y -= object._dragGrabOffset?.y ?? 0;

		const snappedWorld = this.applySnapModifier(object, world);
		const clampedWorld = typeof object.clampPlacementPosition === 'function'
			? object.clampPlacementPosition(snappedWorld.x, snappedWorld.y)
			: object.container?.clampEntityPosition
			? object.container.clampEntityPosition(object, snappedWorld.x, snappedWorld.y)
			: snappedWorld;

		object.posX = clampedWorld.x;
		object.posY = clampedWorld.y;
		object.updatePosition();
		object.onPlacementDragMove?.();
		object.showDropTarget();
		this._updateStorageDragPreview(screenX, screenY);
	}

	// The camera calls this on the owner of its borrow after an edge-scroll step.
	syncToCursor(clientX, clientY) {
		this.placeAtScreenPoint(clientX, clientY);
	}

	applySnapModifier(object, position) {
		if (object.container?.inputHandler?.shouldSnapToGrid?.() !== true) return position;
		const gridSystem = object.gameMap?.gridSystem;
		if (!gridSystem) return position;
		return gridSystem.snapToGrid(
			position.x,
			position.y,
			object.size?.width ?? 0,
			object.size?.height ?? 0,
			gridSystem.config.cellSize,
			{ useCenter: false }
		);
	}

	startDrag() {
		this.startDragAtPosition();
	}

	startDragAtPosition(position = null) {
		const object = this.object;
		if (object.isPickedUp && object.carrier?.queue) {
			object.carrier.queue.clear();
		}
		if (!object.canBeDragged() || !object.inputComponents.drag) return;
		if (position) {
			object.inputComponents.drag.startDragAtPosition(position);
			return;
		}
		object.inputComponents.drag.startDragAtCurrentPosition();
	}

	_initSelectDragHandler() {
		const object = this.object;
		if (!object.element || object._selectDragCleanup || !object.getConfig('dragInSelectMode', false)) {
			return;
		}

		const dragThreshold = object.getConfig('selectDragThreshold', SiteConfig.interaction.mapObject.selectDragThreshold);
		const dragTimeThreshold = object.getConfig('selectDragTimeThreshold', SiteConfig.interaction.mapObject.selectDragTimeThreshold);
		const maxYForPickup = object.getConfig('selectPickupMaxY', SiteConfig.interaction.mapObject.selectPickupMaxY);
		const maxXForPickup = object.getConfig('selectPickupMaxX', SiteConfig.interaction.mapObject.selectPickupMaxX);
		const usePickupGesture = object.getConfig('canPickUp', false);
		const dragModeRestoreDelay = object.getConfig('selectDragModeRestoreDelay', SiteConfig.interaction.mapObject.selectDragModeRestoreDelay);
		const dragStartDelay = object.getConfig('selectDragStartDelay', SiteConfig.interaction.mapObject.selectDragStartDelay);
		let pressStart = null;
		let previousMode = null;
		let pressStartTime = 0;
		let pendingTemporaryDrag = null;

		const onMouseDown = (event) => {
			if (event.button !== 0 || !object.active || object.isDragging || !object.canStartSelectModeDrag()) {
				return;
			}
			const rect = object.element?.getBoundingClientRect?.();
			if (!rect) {
				return;
			}
			const isInside =
				event.clientX >= rect.left &&
				event.clientX <= rect.right &&
				event.clientY >= rect.top &&
				event.clientY <= rect.bottom;
			if (!isInside) {
				return;
			}

			pressStart = {
				x: event.clientX,
				y: event.clientY,
				pageX: event.pageX,
				pageY: event.pageY
			};
			previousMode = UIToolModes.SELECT;
			pressStartTime = Date.now();
		};

		const onMouseMove = (event) => {
			if (!pressStart || object.isDragging || !object.canStartSelectModeDrag()) {
				return;
			}

			const dx = event.clientX - pressStart.x;
			const dy = event.clientY - pressStart.y;
			const distance = Math.hypot(dx, dy);
			const timeElapsed = Date.now() - pressStartTime;
			const passesPickupGesture = !usePickupGesture || (
				distance > dragThreshold &&
				timeElapsed > dragTimeThreshold &&
				event.clientY < pressStart.y &&
				pressStart.y - event.clientY > dragThreshold &&
				pressStart.y - event.clientY < maxYForPickup &&
				Math.abs(pressStart.x - event.clientX) < maxXForPickup
			);

			if (!passesPickupGesture && distance < dragThreshold) {
				return;
			}

			if (usePickupGesture && !passesPickupGesture) {
				return;
			}

			const previousStart = pressStart;
			const pointerPosition = {
				x: event.pageX,
				y: event.pageY,
				clientX: event.clientX,
				clientY: event.clientY
			};
			pressStart = null;
			object._tempSelectDragActive = true;
			pendingTemporaryDrag = {
				previousMode,
				startPosition: previousStart,
				pointerPosition
			};
			object.parent?.ui?.changeToolMode(UIToolModes.DRAG);
			window.setTimeout(() => {
				if (!pendingTemporaryDrag || object.isDragging) {
					return;
				}

				const { previousMode: queuedMode, startPosition, pointerPosition: queuedPointer } = pendingTemporaryDrag;
				pendingTemporaryDrag = null;

				object.startDragAtPosition({
					x: startPosition.pageX ?? startPosition.x,
					y: startPosition.pageY ?? startPosition.y,
					clientX: startPosition.x,
					clientY: startPosition.y
				});

				if (object.isDragging) {
					object.inputComponents.drag?.handleMove?.({
						position: queuedPointer,
						originalEvent: event
					});
					object._restoreToolModeAfterDrag(queuedMode, dragModeRestoreDelay);
				} else {
					object._tempSelectDragActive = false;
					object.parent?.ui?.changeToolMode(queuedMode);
				}
			}, dragStartDelay);
		};

		const onMouseUp = () => {
			pressStart = null;
			previousMode = null;
			pressStartTime = 0;
			pendingTemporaryDrag = null;
			if (!object.isDragging) {
				object._tempSelectDragActive = false;
			}
		};

		const unregister = MapObjectSelectDragManager.getInstance().register(
			object.element, onMouseDown, onMouseMove, onMouseUp
		);

		object._selectDragCleanup = () => {
			unregister();
			object._selectDragCleanup = null;
		};
	}

	_restoreToolModeAfterDrag(mode, delay = 0) {
		const object = this.object;
		const dragComp = object.inputComponents.drag;
		if (!dragComp || !mode) {
			return;
		}

		const savedEnd = dragComp.options.onDragEnd;
		dragComp.options.onDragEnd = (event) => {
			if (savedEnd) {
				savedEnd(event);
			}

			object._tempSelectDragActive = false;
			window.setTimeout(() => {
				object.parent?.ui?.changeToolMode(mode);
			}, delay);
			dragComp.options.onDragEnd = savedEnd;
		};
	}

	_rotateDuringDrag() {
		const object = this.object;
		if (!SiteConfig.objects.canRotate) return;
		const directionConfigs = object.getConfig('directionConfigs', null);
		if (!directionConfigs) return;

		const directions = Object.keys(directionConfigs);
		const currentDir = object.getConfig('facingDirection', directions[0]);
		const currentIdx = directions.indexOf(currentDir);
		const nextDir = directions[(currentIdx + 1) % directions.length];
		object.applyFacingDirection(nextDir);
		object.showDropTarget();
	}

	showDropTarget() {
		const object = this.object;
		const gridSystem = object.gameMap?.gridSystem;
		if (!gridSystem) return;

		if (!object._dropTargetEl) {
			object._dropTargetEl = document.createElement('div');
			object._dropTargetEl.className = 'drop-target';
			object.gameMap.layers.objects.appendChild(object._dropTargetEl);
		}

		const snappedPos = object.getConfig('snapToGrid', false)
			? gridSystem.snapToGrid(
				object.posX,
				object.posY,
				object.size.width,
				object.size.height,
				gridSystem.config.cellSize,
				{ useCenter: false }
			)
			: { x: object.posX, y: object.posY };

		object._dropTargetEl.style.width = `${object.size.width}px`;
		object._dropTargetEl.style.height = `${object.size.height}px`;
		object._dropTargetEl.style.left = `${snappedPos.x}px`;
		object._dropTargetEl.style.top = `${snappedPos.y}px`;

		// Walls have ghosts; objects get the same treatment, from the same
		// query, so a red footprint always means the same thing.
		const rules = object.container?.buildRules;
		const isValid = rules
			? rules.canPlaceAt(object, snappedPos.x, snappedPos.y).allowed
			: object.checkDropValidity(snappedPos.x, snappedPos.y);
		object._dropTargetEl.classList.toggle('is-drop-valid', isValid);
		object._dropTargetEl.classList.toggle('is-drop-invalid', !isValid);
		object.element?.classList.toggle('is-placement-invalid', !isValid);

		if (object.collider) {
			if (!object._dropTargetColliderEl) {
				object._dropTargetColliderEl = document.createElement('div');
				object._dropTargetColliderEl.className = 'drop-target-collider';
				object._dropTargetEl.appendChild(object._dropTargetColliderEl);
			}
			object._dropTargetColliderEl.style.left = `${object.collider.offsetX ?? 0}px`;
			object._dropTargetColliderEl.style.top = `${object.collider.offsetY ?? 0}px`;
			object._dropTargetColliderEl.style.width = `${object.collider.width ?? object.size.width}px`;
			object._dropTargetColliderEl.style.height = `${object.collider.height ?? object.size.height}px`;
		}

		object._dropTargetEl.style.display = '';
	}

	hideDropTarget() {
		if (this.object._dropTargetEl) this.object._dropTargetEl.style.display = 'none';
		this.object.element?.classList.remove('is-placement-invalid');
	}

	getDropValidationBounds(x = this.object.posX, y = this.object.posY) {
		const object = this.object;
		if (object.collider) {
			return {
				x: x + (object.collider.offsetX ?? 0),
				y: y + (object.collider.offsetY ?? 0),
				width: object.collider.width ?? object.size.width,
				height: object.collider.height ?? object.size.height
			};
		}

		return {
			x,
			y,
			width: object.size.width,
			height: object.size.height
		};
	}

	checkDropValidity(x, y) {
		const object = this.object;
		const gridSystem = object.gameMap?.gridSystem;
		if (!gridSystem) return true;

		const thisOverlappable = object.getConfig('visual.overlappable', false);
		const bounds = this.getDropValidationBounds(x, y);
		const startGridX = Math.floor(bounds.x / gridSystem.config.cellSize);
		const startGridY = Math.floor(bounds.y / gridSystem.config.cellSize);
		const endGridX = Math.ceil((bounds.x + bounds.width) / gridSystem.config.cellSize);
		const endGridY = Math.ceil((bounds.y + bounds.height) / gridSystem.config.cellSize);

		for (let gx = startGridX; gx < endGridX; gx++) {
			for (let gy = startGridY; gy < endGridY; gy++) {
				if (gx < 0 || gx >= gridSystem.gridWidth || gy < 0 || gy >= gridSystem.gridHeight) {
					return false;
				}
				const cell = gridSystem.grid[gx][gy];

				if (!cell.tileWalkable) return false;

				if (!thisOverlappable) {
					// Cells hold more than map objects — a myte registers itself
					// in the grid too, and it has no config to ask. Anything
					// without one is not a placement blocker: you can drop a
					// ball on the tile a myte is standing on.
					const hasBlocker = [...cell.objects].some(
						obj => obj !== object &&
							typeof obj.getConfig === 'function' &&
							!obj.getConfig('visual.overlappable', false)
					);
					if (hasBlocker) return false;
				}
			}
		}
		return true;
	}

	enableDragging() {
		const object = this.object;
		if (!object.getConfig('draggable', false)) object.config.draggable = true;
		if (object.inputComponents.drag) object.inputComponents.drag.enable();
		else object.initDragComponent();
	}

	disableDragging() {
		this.object.inputComponents.drag?.disable();
	}

	enableRubbing() {
		const object = this.object;
		if (!object.getConfig('rubbable', false)) object.config.rubbable = true;
		if (object.inputComponents.rubbing) object.inputComponents.rubbing.enable();
		else object.initRubbingComponent();
	}

	disableRubbing() {
		this.object.inputComponents.rubbing?.disable();
	}

	dispose() {
		const object = this.object;
		this._removeStorageDragPreview();
		object.container?.inventory?.inventoryElement?.classList.remove('is-store-target', 'is-store-target-invalid');
		if (object._rotateKeyHandler) {
			window.removeEventListener('keydown', object._rotateKeyHandler);
			object._rotateKeyHandler = null;
		}
		Object.values(object.inputComponents).forEach(component => component.dispose());
		object.inputComponents = {};
		object._selectDragCleanup?.();
		if (object._dropTargetEl) {
			object._dropTargetEl.remove();
			object._dropTargetEl = null;
			object._dropTargetColliderEl = null;
		}
		object._tempSelectDragActive = false;
	}
}
