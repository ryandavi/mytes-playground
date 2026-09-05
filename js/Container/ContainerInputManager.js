class ContainerInputManager {
  /**
   * Create a new ContainerInputManager
   * @param {ContainerManager} containerManager The parent container manager
   */
  constructor(containerManager) {
    this.container = containerManager;
    this.inputSystem = InputSystem.getInstance();
    this.subscriptions = [];
    this.interactionConfig = SiteConfig.interaction;

    // Track input state
    this.isEnabled = true;
    this.inactivityTimeout = SiteConfig.myte.inactiveTimeout;
    this.longTapTimer = null;
    this.longTapStartX = 0;
    this.longTapStartY = 0;
    this.longTapEligibleTarget = false;

    // Set up event handlers
    this.setupKeyboardShortcuts();
    this.setupClickHandling();
    this.setupLongTapHandling();

    // Track inactivity
    this.inactivityCheckInterval = setInterval(() => {
      this.checkInactivity();
    }, 10000); // Check every 10 seconds
  }

  //==================================================
  // INPUT ENABLE/DISABLE METHODS
  //==================================================
  
  /**
   * Disable all input handling
   * This is called during map transitions or other moments when input should be ignored
   */
  disable() {
    if (!this.isEnabled) return; // Already disabled

    this.isEnabled = false;
    Utility.logDebug('Input manager disabled');
    this.clearLongTapTimer();

    // You might want to add a visual indicator that inputs are disabled
    document.body.classList.add('inputs-disabled');
  }

  /**
   * Re-enable input handling
   * This is called after map transitions or when input should be allowed again
   */
  enable() {
    if (this.isEnabled) return; // Already enabled

    this.isEnabled = true;
    Utility.logDebug('Input manager enabled');

    // Remove visual indicator if you added one
    document.body.classList.remove('inputs-disabled');

    // Reset last active time when re-enabling
    this.setLastActive();
    this.container?.handleUserActive?.();
  }

  //==================================================
  // ACTIVITY TRACKING METHODS
  //==================================================
  
  /**
   * Set the last active time to now
   * This is used to track user activity
   */
  setLastActive() {
    this.inputSystem.recordActivity?.();
  }

  /**
   * Check if the user has been inactive for the specified duration
   * @param {number} timeout The timeout in milliseconds
   * @returns {boolean} Whether the user's status has changed
   */
  checkInactive(timeout = this.inactivityTimeout) {
    if (!this.isEnabled) {
      return false;
    }

    if (Number.isFinite(timeout) && timeout > 0) {
      this.inactivityTimeout = timeout;
    }

    return this.inputSystem.checkInactivity(this.inactivityTimeout);
  }

  /**
   * Check if the user is currently considered active
   * @returns {boolean} Whether the user is active
   */
  isUserActive() {
    return this.inputSystem.isUserActive();
  }

  /**
   * Check for user inactivity and notify container
   */
  checkInactivity() {
    if (!this.isEnabled) {
      return;
    }

    const wasActive = this.inputSystem.isUserActive();
    this.inputSystem.checkInactivity(this.inactivityTimeout);
    const isActive = this.inputSystem.isUserActive();

    if (wasActive !== isActive) {
      if (isActive) {
        // User became active
        this.container.handleUserActive();
      } else {
        // User became inactive
        this.container.handleUserInactive();
      }
    }
  }

  //==================================================
  // EVENT SETUP METHODS
  //==================================================
  
  /**
   * Set up keyboard shortcuts
   */
  /**
   * The whole keyboard map lives here, in one place, each binding gated on the
   * mode it belongs to. Anything mode-specific checks `gameMode` rather than
   * relying on the CSS that hides its button — a shortcut bypasses CSS.
   */
  setupKeyboardShortcuts() {
    this.subscribe('keyboard.down', (event) => {
      if (!this.isEnabled) return;
      if (event.meta) return;

      const ui = this.container.ui;
      const gameMode = this.container.gameMode;
      const isBuild = gameMode?.isBuild() === true;

      if (event.ctrl) {
        if (!isBuild) return;
        if (event.key === 'z') {
          event.originalEvent?.preventDefault();
          if (event.shift) this.container.buildHistory?.redo();
          else this.container.buildHistory?.undo();
        } else if (event.key === 'y') {
          event.originalEvent?.preventDefault();
          this.container.buildHistory?.redo();
        }
        return;
      }

      // Tool shortcuts, from the same config that names the buttons. Only the
      // current mode's tools claim a key, which frees S and D to pan while
      // building.
      const toolManager = ui?.toolManager;
      for (const [mode, config] of Object.entries(toolManager?.toolConfig || {})) {
        if (config?.shortcut === event.key && toolManager.canUseTool(mode)) {
          ui.changeToolMode(mode);
          return;
        }
      }

      // Nudging what is selected. One cell a press, and the same transaction a
      // drag uses, so it undoes as one step and refuses the same moves.
      if (isBuild && ui?.buildMarqueeSelection?.nudge) {
        const nudges = {
          arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1]
        };
        const nudge = nudges[event.key];
        if (nudge && ui.buildMarqueeSelection.nudge(nudge[0], nudge[1])) {
          event.originalEvent?.preventDefault();
          return;
        }
      }

      switch (event.key) {
        case 'b':
          gameMode?.toggle();
          return;
        case 'm':
          ui?.worldMapPanel?.toggle();
          return;
        case 'l':
          ui?.gameLogManager?.toggle();
          return;
        case 'n':
          ui?.soundPanel?.toggleSounds?.();
          return;
        case 'escape':
          this.handleEscape();
          return;
        // How the walls are drawn is not a build-mode question — the control
        // for it is on screen while playing too, so its keys are as well.
        case 'home':
        case 'end':
          event.originalEvent?.preventDefault();
          this.stepWallPresentation(event.key === 'home' ? -1 : 1);
          return;
      }

      if (event.key.length === 1 && 'wasd'.includes(event.key)) {
        event.originalEvent?.preventDefault();
        this.panCamera(event.key);
        return;
      }

      if (event.key.startsWith('arrow')) {
        this.nudgeSelectedObject(event);
        return;
      }

      if (!isBuild) return;

      switch (event.key) {
        case 'g':
          event.originalEvent?.preventDefault();
          this.container.setBuildGridEnabled(this.container.settings?.buildGrid === false);
          return;
        // macOS labels Backspace as Delete; forward-delete (Fn+Delete) reports
        // "Delete". Both keys mean the same thing in the build selection.
        case 'backspace':
        case 'delete':
          event.originalEvent?.preventDefault();
          this.storeSelectedObject();
          return;
        case 'r':
        case ',':
        case '.':
          event.originalEvent?.preventDefault();
          this.rotateSelectedObject(event.key === ',' ? -1 : 1);
          return;
      }
    });
  }

  // The keys and the buttons are one state: there is a single wall-view control
  // and it is always on screen, so this drives it rather than hunting for
  // whichever panel happens to be open.
  stepWallPresentation(direction) {
    this.container.ui?.stageViewBar?.wallView?.step(direction);
  }

  storeSelectedObject() {
    const selectedObjects = this.container.ui?.getSelectedObjects?.() || [];
    const wallCells = this.container.ui?.buildMarqueeSelection?.getSelectedWallCells?.() || [];
    if (wallCells.length > 0) {
      this.container.ui?.buildMarqueeSelection?.confirmDemolition?.();
      return;
    }
    if (selectedObjects.length > 1) {
      this.container.ui?.buildMarqueeSelection?.storeSelection?.();
      return;
    }
    const selected = this.container.ui?.getSelected?.();
    const storage = this.container.ui?.actionSidebarManager?.getInventoryStorageState?.(selected);
    if (!storage) return;
    if (!storage.canStore) {
      this.container.ui?.showMessage?.(storage.unavailableReason || "That can't be stored.", 'warning', 'Build');
      return;
    }
    storage.store();
    this.container.ui?.actionSidebarManager?.updateActions?.(null);
  }

  rotateSelectedObject(direction) {
    const selected = this.container.ui?.getSelected?.();
    if (selected?.rotateToNextDirection?.(direction) === false) {
      this.container.ui?.showMessage?.("It doesn't fit that way round.", 'warning', 'Rotate');
    }
  }

  // Arrows nudge the selection while building; with nothing selected they pan,
  // which is what they do in play mode too.
  nudgeSelectedObject(event) {
    const selected = this.container.ui?.getSelected?.();
    const step = event.shift ? (this.container.gameMap?.gridSystem?.config?.cellSize || 32) : 1;
    const delta = {
      arrowleft: [-step, 0], arrowright: [step, 0],
      arrowup: [0, -step], arrowdown: [0, step]
    }[event.key];
    if (!delta) return;

    event.originalEvent?.preventDefault();
    if (!(selected instanceof MapObject)) {
      this.container.camera?.panBy(delta[0], delta[1]);
      return;
    }
    if (this.container.buildRules?.canMoveObject(selected).allowed === false) return;
    selected.nudgeBy?.(delta[0], delta[1]);
  }

  panCamera(key) {
    const step = SiteConfig.camera.keyboardPanStep;
    const delta = { w: [0, -step], a: [-step, 0], s: [0, step], d: [step, 0] }[key];
    if (delta) this.container.camera?.panBy(delta[0], delta[1]);
  }

  // Ctrl held inverts whatever the snap setting says, and raises the grid
  // overlay either way — it is the "do the other thing, just this once" key,
  // the same job it does for the Walls tool's add/remove.
  isSnapModifierHeld() {
    return this.inputSystem?.isKeyPressed?.('control') === true;
  }

  /**
   * Whether a dragged object should land on grid cells right now.
   *
   * Snapping is the default in build mode: a room laid out by hand is a room
   * with everything a pixel off, and the grid is the thing the walls and floors
   * are already built on. Ctrl inverts it for the cases the grid gets wrong.
   */
  shouldSnapToGrid() {
    const enabled = this.container?.settings?.buildSnap !== false &&
      this.container?.gameMode?.isBuild() === true;
    return this.isSnapModifierHeld() ? !enabled : enabled;
  }

  /**
   * Set up click handling
   */
  setupClickHandling() {
    // Handle clicks on the container
    this.subscribe('mouse.click', (event) => {
      if (!this.isEnabled) return;
      if (event.originalEvent && event.originalEvent.defaultPrevented) return;

      // Clicking bare map means "not that one" in every tool, not just Select.
      // Build mode's Select tool retains the internal Move mode id, so a selected object stayed selected
      // — and kept the sidebar open — no matter where you clicked.
      const target = event.originalEvent?.target;
      if (this.canStartWorldGestureFromTarget(target)) {
        this.container.ui.setSelected(null);
        return;
      }

      // Handle element click for active Myte
      if (this.container.activeMyte &&
        this.container.activeMyte.isActive &&
        this.container.ui.isTool(UIToolModes.SELECT)) {

        const element = target;
        if (element && this.isClickableElement(element)) {
          // this.container.ui.setSelected(element);
        }
      }
    });

    // Double-click on the map → A* move active myte to clicked world position.
    // Uses native dblclick (separate DOM event) so it fires reliably even when
    // individual click events are stopped by child elements (e.g. myte overlay).
    this.subscribe('mouse.dblclick', (event) => {
      if (!this.isEnabled) { Utility.logDebug('[dblclick] blocked: ContainerInputManager disabled'); return; }
      if (event.originalEvent && event.originalEvent.defaultPrevented) { Utility.logDebug('[dblclick] blocked: defaultPrevented'); return; }
      const target = event.originalEvent?.target;
      Utility.logDebug('[dblclick] target:', target?.className || target?.tagName);
      if (!this.canStartWorldGestureFromTarget(target)) { Utility.logDebug('[dblclick] blocked: non-world target'); return; }
      this._tryAStarToClick(event.position.x, event.position.y);
    });
  }

  /**
   * Set up long-press on mobile to A* move the active myte
   */
  setupLongTapHandling() {
    const worldGestureConfig = this.interactionConfig?.world ?? {};
    const longPressDelay = worldGestureConfig.longPressMoveDelay ?? 500;
    const cancelDistance = worldGestureConfig.longPressMoveCancelDistance ?? 10;

    this.subscribe('touch.start', (event) => {
      if (!this.isEnabled) return;
      this.clearLongTapTimer();
      this.longTapEligibleTarget = this.canStartWorldGestureFromTarget(event.originalEvent?.target);
      if (!this.longTapEligibleTarget) {
        return;
      }
      this.longTapStartX = event.position.x;
      this.longTapStartY = event.position.y;
      this.longTapTimer = setTimeout(() => {
        this.longTapTimer = null;
        this._tryAStarToClick(this.longTapStartX, this.longTapStartY);
      }, longPressDelay);
    });

    this.subscribe('touch.move', (event) => {
      if (!this.longTapTimer || !this.longTapEligibleTarget) return;
      if (Math.abs(event.position.x - this.longTapStartX) > cancelDistance ||
          Math.abs(event.position.y - this.longTapStartY) > cancelDistance) {
        this.clearLongTapTimer();
      }
    });

    this.subscribe('touch.end', () => this.clearLongTapTimer());
  }

  /**
   * A* move the active myte to a screen-space coordinate
   */
  _tryAStarToClick(screenX, screenY) {
    // Nothing walks anywhere while the world is frozen, and a double-click in
    // build mode is far more likely to be aimed at a wall or a swatch.
    if (this.container.gameMode?.isBuild()) return;

    const myte = this.container.activeMyte;
    if (!myte?.isActive || !myte.pathfinder || myte.queue.isCarrying()) {
      Utility.logDebug('[astar] blocked: isActive=%s pathfinder=%s carrying=%s', myte?.isActive, !!myte?.pathfinder, myte?.queue.isCarrying());
      return;
    }
    if (!this.container.ui?.isTool(UIToolModes.SELECT)) {
      Utility.logDebug('[astar] blocked: tool is not SELECT, current tool:', this.container.ui?.currentTool);
      return;
    }
    const world = this.screenToWorldCoordinates(screenX, screenY);
    Utility.logDebug('[astar] queuing astar-move to world', world);
    // Clear first so the old action's _onDone fires before we place the new marker,
    // preventing the old callback from erasing the new marker.
    myte.queue.clear();
    this._showDestinationMarker(world.x, world.y);
    myte.queue.add('astar-move', {
      target: { x: world.x, y: world.y },
      pathfindingOptions: { exactEndMode: 'if-reachable' },
      userInitiated: true,
      _onDone: () => this._clearDestinationMarker()
    });
  }

  _showDestinationMarker(worldX, worldY) {
    this._clearDestinationMarker();
    const layer = this.container.canvas?.querySelector('.layer.effects');
    if (!layer) return;

    const marker = document.createElement('div');
    marker.className = 'destination-marker';
    marker.style.left = `${worldX}px`;
    marker.style.top = `${worldY}px`;

    const dot = document.createElement('div');
    dot.className = 'dot';
    const ring1 = document.createElement('div');
    ring1.className = 'ring';
    const ring2 = document.createElement('div');
    ring2.className = 'ring';
    marker.append(dot, ring1, ring2);

    layer.appendChild(marker);
    this._destinationMarker = marker;
  }

  _clearDestinationMarker() {
    if (this._destinationMarker) {
      this._destinationMarker.remove();
      this._destinationMarker = null;
    }
  }

  /**
   * Handle escape key
   */
  /**
   * Escape peels one layer at a time, outermost work first.
   *
   * This is the only handler for the key. Windows used to close themselves on
   * Escape as well, which meant one press did two things at once: the Options
   * window closed itself, and this handler - finding none of the three build
   * panels open - went on to leave Build mode too. Anything that wants to
   * answer Escape adds a layer here instead.
   *
   *   1  a text field you are typing in       give the field back
   *   2  an item waiting to be placed         put it down
   *   3  a gesture in progress                abandon it
   *   4  a window                             close the front-most one
   *   5  a selection                          clear it
   *   6  Build mode                           leave it
   *   7  a myte in your hands                 set it down
   */
  handleEscape() {
    const ui = this.container.ui;

    // Leaving the field is the whole gesture: closing the panel out from under
    // someone half way through naming a room would throw the name away.
    const editing = document.activeElement;
    if (editing && editing !== document.body && typeof editing.blur === 'function' &&
      (editing.matches?.('input, textarea, select') || editing.isContentEditable)) {
      editing.blur();
      return;
    }

    if (this.container.inventory?.state?.placementItem) {
      this.container.inventory.cancelPlacement();
      return;
    }

    if (ui?.buildMarqueeSelection?.cancelDrag?.() === true) return;
    if (ui?.wallBuildPanel?.cancelDrag?.() === true) return;
    if (ui?.fenceBuildPanel?.cancelDrag?.() === true) return;
    if (ui?.roomPanel?.cancelDrag?.() === true) return;
    if (ui?.buildPlacement?.cancel?.() === true) return;
    // Something held in hand is work in flight too: put it down before the
    // panel it belongs to closes out from under it.
    if (ui?.surfaceCustomizePanel?.dropFinish?.() === true) return;

    // Any window, not a list of the ones we remembered to name. A build panel's
    // own close() hands the tool back, so closing it here leaves the mode in
    // the same state as clicking its X.
    const front = ModalWindow.frontMost?.();
    if (front) {
      front.close();
      return;
    }

    if (this.container.gameMode?.isBuild()) {
      if (ui?.buildSelection?.current || ui?.getSelected?.()) {
        ui.setSelected(null);
        ui.buildSelection?.clear?.();
        ui.roomPanel?.clearHighlight?.();
        ui.surfaceCustomizePanel?.setTarget?.(null);
        return;
      }
      this.container.gameMode.setMode(GAME_MODES.PLAY);
      return;
    }

    ui.setSelected(null);

    if (this.container.activeMyte?.queue.isCarrying()) {
      this.container.activeMyte.queue.addPutDownMyte();
    }
  }

  //==================================================
  // ELEMENT INTERACTION METHODS
  //==================================================
  
  /**
   * Check if an element is clickable
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether element is clickable
   */
  isClickableElement(element) {
    // Chrome over the world, and anything inside it — the class is on the
    // wrapper, and the click arrives on a button three levels down.
    if (element.closest?.(InputComponent.UI_SELECTOR)) {
      return false;
    }

    // Ignore form controls and links
    const ignoreElements = ['input', 'textarea', 'select', 'button', 'a'];
    if (ignoreElements.includes(element.tagName.toLowerCase())) {
      return false;
    }

    return true;
  }

  canStartWorldGestureFromTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (!this.container.canvas?.contains?.(target)) {
      return false;
    }

    const blockedSelector = [
      InputComponent.UI_SELECTOR,
      '.world-myte',
      '.map-object',
      '.dropped-item',
      '.myte-slot',
      '.interactive-hitbox',
      '.map-object-slot',
      'button',
      'input',
      'textarea',
      'select',
      'option',
      'label',
      'a',
      '[role=\"button\"]'
    ].join(', ');

    return !target.closest(blockedSelector);
  }

  /**
   * Check if a point is within an element's bounds
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether point is within element
   */
  isPointInElement(x, y, element) {
    const rect = element.getBoundingClientRect();
    
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  /**
   * Check if the current mouse position is within an element
   * @param {HTMLElement} element Element to check
   * @returns {boolean} Whether mouse is over element
   */
  isMouseOverElement(element) {
    const mousePos = this.getMousePosition();
    return this.isPointInElement(mousePos.x, mousePos.y, element);
  }

  //==================================================
  // COORDINATE TRANSFORMATION METHODS
  //==================================================

  getZoomLevel() {
    const zoomLevel = this.container.camera?.zoomLevel;
    return Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;
  }

  getCameraOffset(includeCamera = true) {
    if (!includeCamera || !this.container.camera) {
      return { x: 0, y: 0 };
    }

    return {
      x: Number.isFinite(this.container.camera.posX) ? this.container.camera.posX : 0,
      y: Number.isFinite(this.container.camera.posY) ? this.container.camera.posY : 0
    };
  }

  pageToContainerCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();
    const safeX = Number.isFinite(x) ? x : containerRect.left;
    const safeY = Number.isFinite(y) ? y : containerRect.top;
    const safeLeft = Number.isFinite(containerRect.left) ? containerRect.left : 0;
    const safeTop = Number.isFinite(containerRect.top) ? containerRect.top : 0;

    return {
      x: (safeX - safeLeft) / zoomLevel,
      y: (safeY - safeTop) / zoomLevel
    };
  }

  containerToPageCoordinates(x, y) {
    const containerRect = this.container.getContainerRect();
    const zoomLevel = this.getZoomLevel();
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const safeLeft = Number.isFinite(containerRect.left) ? containerRect.left : 0;
    const safeTop = Number.isFinite(containerRect.top) ? containerRect.top : 0;

    return {
      x: safeX * zoomLevel + safeLeft,
      y: safeY * zoomLevel + safeTop
    };
  }

  containerToWorldCoordinates(x, y, options = {}) {
    const cameraOffset = this.getCameraOffset(options.includeCamera !== false);
    const elementOffset = this.getElementWorldOffset(options.element);
    const additionalOffset = options.additionalOffset || { x: 0, y: 0 };
    const renderOffset = this.container.getRenderOffset?.() || { x: 0, y: 0 };

    return {
      x: x - elementOffset.x - cameraOffset.x - additionalOffset.x - renderOffset.x,
      y: y - elementOffset.y - cameraOffset.y - additionalOffset.y - renderOffset.y
    };
  }

  worldToContainerCoordinates(x, y, options = {}) {
    const cameraOffset = this.getCameraOffset(options.includeCamera !== false);
    const elementOffset = this.getElementWorldOffset(options.element);
    const additionalOffset = options.additionalOffset || { x: 0, y: 0 };
    const renderOffset = this.container.getRenderOffset?.() || { x: 0, y: 0 };

    return {
      x: x + cameraOffset.x + elementOffset.x + additionalOffset.x + renderOffset.x,
      y: y + cameraOffset.y + elementOffset.y + additionalOffset.y + renderOffset.y
    };
  }

  getElementWorldOffset(element, zoomLevel = this.getZoomLevel()) {
    const safeZoomLevel = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1;

    if (!element) {
      return { x: 0, y: 0 };
    }

    if (element.size?.width || element.size?.height) {
      return {
        x: (element.size?.width || 0) / 2,
        y: (element.size?.height || 0) / 2
      };
    }

    if (typeof element.getRect === 'function') {
      const rect = element.getRect();
      return {
        x: rect.width / (2 * safeZoomLevel),
        y: rect.height / (2 * safeZoomLevel)
      };
    }

    if (typeof element.getBoundingClientRect === 'function') {
      const rect = element.getBoundingClientRect();
      return {
        x: rect.width / (2 * safeZoomLevel),
        y: rect.height / (2 * safeZoomLevel)
      };
    }

    return { x: 0, y: 0 };
  }

  screenDeltaToWorldDelta(x, y) {
    const zoomLevel = this.getZoomLevel();
    return {
      x: (Number.isFinite(x) ? x : 0) / zoomLevel,
      y: (Number.isFinite(y) ? y : 0) / zoomLevel
    };
  }
  
  /**
   * Convert screen coordinates to world coordinates
   * Core coordinate transformation function
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @param {Object} options Additional options
   * @returns {Object} World coordinates {x, y}
   */
  screenToWorldCoordinates(x, y, options = {}) {
    const containerPoint = this.pageToContainerCoordinates(x, y);
    return this.containerToWorldCoordinates(containerPoint.x, containerPoint.y, options);
  }

  /**
   * Convert world coordinates to screen coordinates
   * @param {number} x X coordinate
   * @param {number} y Y coordinate
   * @returns {Object} Screen coordinates {x, y}
   */
  worldToScreenCoordinates(x, y) {
    const containerPoint = this.worldToContainerCoordinates(x, y);
    return this.containerToPageCoordinates(containerPoint.x, containerPoint.y);
  }

  getMouseWorldPosition(options = {}) {
    const mousePos = this.getMousePosition();
    return this.screenToWorldCoordinates(mousePos.x, mousePos.y, options);
  }

  getMouseContainerPosition(options = {}) {
    const mousePos = this.getMousePosition();
    const containerPoint = this.pageToContainerCoordinates(mousePos.x, mousePos.y);

    if (options.includeCamera === false && !options.element && !options.additionalOffset) {
      return containerPoint;
    }

    return this.containerToWorldCoordinates(containerPoint.x, containerPoint.y, {
      ...options,
      includeCamera: false
    });
  }

  /**
   * Get mouse position in screen coordinates
   * @returns {Object} Mouse position {x, y}
   */
  getMousePosition() {
    return this.inputSystem.getMousePosition();
  }

  isMouseInContainer() {
    return this.container?.isMouseInContainer?.() ?? false;
  }

  /**
   * Get mouse press duration
   * @returns {number} Duration in ms
   */
  getPressDuration() {
    return this.inputSystem.getPressDuration();
  }

  /**
   * Get the current press state
   * @returns {boolean} Whether mouse/touch is currently pressed
   */
  isPressed() {
    return this.inputSystem.isMouseButtonPressed();
  }

  /**
   * Get offset position relative to a specific element
   * @param {HTMLElement} element Element to get offset against
   * @returns {Object} Element-relative coordinates {x, y}
   */
  getElementMouse(element) {
    return {
      x: this.getMousePosition().x - this.container.getRect(element).left,
      y: this.getMousePosition().y - this.container.getRect(element).top
    };
  }

  subscribe(eventName, handler) {
    const subscription = this.inputSystem.on(eventName, handler);
    this.subscriptions.push(subscription);
    return subscription;
  }

  clearLongTapTimer() {
    if (this.longTapTimer) {
      clearTimeout(this.longTapTimer);
      this.longTapTimer = null;
    }
    this.longTapEligibleTarget = false;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.clearLongTapTimer();
    document.body.classList.remove('inputs-disabled');

    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }

    this.subscriptions.forEach(subscription => subscription?.unsubscribe?.());
    this.subscriptions = [];
  }
}
