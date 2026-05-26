class ContainerManager {
    static INIT_PROGRESS = Object.freeze({
        ENVIRONMENT: 0.10,
        INVENTORY: 0.30,
        MAP: 0.50,
        MYTES: 0.80,
        COMPLETE: 1.00,
    });

    constructor(elementId, core) {
        this.core = core;
        this.mytes = [];

        this.element = document.getElementById(elementId);
        this.containerWrapper = this.element.closest('.app-shell');
        this.canvas = this.element.querySelector('.canvas');

        this.activeMyte = null;
        this.camera = null;

        // Systems and managers
        this.ui = new UserInterface(this);
        this.inputHandler = new ContainerInputManager(this);
        this.timeManager = GameTime.instance;

        // map
        this.gameMap;


        // inventory
        this.inventory = null;

        this.transitionManager = new MapTransitionManager(this);
        this.userIsActive = true;

        this._cachedCanvasRect = null;
        this._boundInvalidateCanvasRect = () => { this._cachedCanvasRect = null; };

        this.settings = {
            limitMap: core?.user?.preferences?.containerLimit ?? true,
            defaultMyteCamera: CAMERA_FOLLOW_MODES[SiteConfig.camera.defaultFollowMode] ?? CAMERA_FOLLOW_MODES.CURSOR_EDGE,
            autoDeployMytesOnLoad: false
        }

    }

    updateContainerLoading(progress, message = null) {
        if (!this.core?.loadingManager) return;

        if (message) {
            this.core.loadingManager.setMessage(message);
        }

        this.core.loadingManager.updateStageProgress(LoadingManager.STAGES.CONTAINER, progress);
    }
    // Update the init method in ContainerManager.js to set isInitialLoad flag
    async init() {
        try {
            Utility.logDebug('[ContainerManager] Initializing');

            if (this.settings.limitMap) {
                this.element.classList.add('noScroll');
            }

            // Check for required DOM elements
            if (!this.element) {
                throw new Error('Container element is missing');
            }

            if (!this.canvas) {
                throw new Error('Canvas element is missing');
            }

            this.updateContainerLoading(
                ContainerManager.INIT_PROGRESS.ENVIRONMENT,
                "Initializing game environment..."
            );

            // Initialize camera
            Utility.logDebug('[ContainerManager] Initializing camera');
            this.camera = new Camera(this, this.canvas, this.element);
            this.camera.limitToBounds = this.settings.limitMap;
            window.addEventListener('resize', this._boundInvalidateCanvasRect);



            // Set up inventory
            Utility.logDebug('[ContainerManager] Initializing inventory');
            const inventoryElement = document.getElementById('inventory');
            if (!inventoryElement) {
                console.warn('[ContainerManager] Inventory element not found, creating placeholder');
                // Create placeholder if not found to prevent errors
                const placeholder = document.createElement('div');
                placeholder.id = 'inventory';
                document.body.appendChild(placeholder);
                if (this.inventory?.inventoryElement !== placeholder) {
                    this.inventory?.dispose?.();
                    this.inventory = new Inventory(this, placeholder);
                }
            } else {
                if (this.inventory?.inventoryElement !== inventoryElement) {
                    this.inventory?.dispose?.();
                    this.inventory = new Inventory(this, inventoryElement);
                }
            }

            this.inventory.loadItems(this.core.user?.items || []);

            if (this.core.user) {
                this.core.user.setInventory(this.inventory);
            }

            this.updateContainerLoading(ContainerManager.INIT_PROGRESS.INVENTORY);



            // Check if core exists
            if (!this.core) {
                throw new Error('Core reference is missing');
            }

            // Ensure the core has a mapLoader
            if (!this.core.mapLoader) {
                Utility.logDebug("[ContainerManager] Creating a new GameMapLoader for core");
                this.core.mapLoader = new GameMapLoader(this.core);

                // Initialize the mapLoader if needed
                if (typeof this.core.mapLoader.init === 'function') {
                    await this.core.mapLoader.init();
                }
            }

            const mapObjectConfigLoaded = await MapObjectFactory.loadConfigFiles(
                'data/map-objects/base.json',
                'data/map-objects/types.json'
            );
            if (!mapObjectConfigLoaded) {
                throw new Error('Failed to load canonical map object config data.');
            }

            this.updateContainerLoading(
                ContainerManager.INIT_PROGRESS.MAP,
                "Loading initial map..."
            );

            Utility.logDebug('[ContainerManager] Starting initial map transition');

            // Get the right map ID
            // Use the default or a dev map if configured
            const initialMapId = this.core.user?.currentMapId
                || SiteConfig.world.defaultMap;

            // Log to see what map we're trying to load
            Utility.logDebug(`[ContainerManager] Loading initial map: ${initialMapId}`);

            // Load the initial map through the transition manager
            // Explicitly set isInitialLoad to true
            const initialMapLoaded = await this.transitionManager.startTransition({
                targetMap: initialMapId,
                targetSpawnPoint: 'default',
                message: `Welcome to ${initialMapId}!`,
                preserveCamera: true,
                isInitialLoad: true
            });


            if (!initialMapLoaded) {
                throw new Error(`Failed to load initial map: ${initialMapId}`);
            }

            // Set up mytes
            Utility.logDebug('[ContainerManager] Setting up Mytes');
            this.updateContainerLoading(
                ContainerManager.INIT_PROGRESS.MYTES,
                "Initializing Mytes..."
            );
            await this.setupMytes();



            Utility.logDebug('[ContainerManager] Initial map loaded successfully');

            // Initialize UI
            Utility.logDebug('[ContainerManager] Initializing UI');
            if (this.ui) {
                this.ui.init();
            } else {
                console.warn('[ContainerManager] UI not defined');
            }

            this.updateContainerLoading(ContainerManager.INIT_PROGRESS.COMPLETE);
            // completeLoading() is called by Core once all stages finish — not here.

            Utility.logDebug('[ContainerManager] Initialization completed successfully');
            return true;
        } catch (error) {
            console.error("[ContainerManager] Error initializing container:", error);

            // Show error in loading screen
            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage("Error: " + error.message);
            }

            return false;
        }
    }

    // Update the loadMap method to explicitly set isInitialLoad to false
    async loadMap(mapId, options = {}) {
        return this.transitionManager.startTransition({
            targetMap: mapId,
            targetSpawnPoint: options.spawnPoint || 'default',
            duration: options.duration || 1000,
            message: options.message || `Traveling to ${mapId}...`,
            preserveCamera: options.preserveCamera !== false,
            isInitialLoad: false // Explicitly set to false for normal transitions
        });
    }

    get mapArea() {
        return this.gameMap;
    }

    get soundManager() {
        return this.core?.soundManager || null;
    }

    get eventManager() {
        return this.core?.eventManager || null;
    }


    // Input state accessors that delegate to inputHandler
    getPressDuration() {
        return this.inputHandler.getPressDuration();
    }

    isMousePressed() {
        return this.inputHandler.isPressed();
    }

    // Mouse position for compatibility with existing code
    get mousePosX() {
        return this.inputHandler.getMousePosition().x;
    }

    get mousePosY() {
        return this.inputHandler.getMousePosition().y;
    }

    // Activity tracking delegates to inputHandler
    setLastActive() {
        this.inputHandler.setLastActive();
    }

    updateUserActivity() {
        if (!this.inputHandler?.isEnabled) {
            return;
        }

        if (this.activeMyte?.queue?.hasUserInitiatedAction?.()) {
            this.inputHandler.setLastActive?.();
            this.handleUserActive();
            return;
        }

        const statusChanged = this.inputHandler.checkInactive(SiteConfig.myte.inactiveTimeout);
        if (statusChanged) {
            if (this.inputHandler.isUserActive()) {
                this.handleUserActive();
            } else {
                this.handleUserInactive();
            }
        }
    }

    handleUserActive() {
        if (this.userIsActive) return;
        this.userIsActive = true;
        this.element?.classList.remove('user-inactive');
        this.activeMyte?.restoreFromInactivityFreeRoam?.();
        this.eventManager?.emit?.('user_activity_changed', { active: true });
    }

    handleUserInactive() {
        if (!this.userIsActive) return;
        this.userIsActive = false;
        this.element?.classList.add('user-inactive');
        this.activeMyte?.enterInactivityFreeRoam?.();
        this.eventManager?.emit?.('user_activity_changed', { active: false });
    }

    // Container-specific utility methods
    getDepthZIndex(sortY, priority = 0) {
        const resolvedSortY = Number.isFinite(sortY) ? sortY : 0;
        const resolvedPriority = Number.isFinite(priority) ? priority : 0;

        // Use world-pixel depth instead of map-height normalization so layering
        // stays consistent across maps and does not collapse into coarse buckets.
        return Math.round(resolvedSortY * 100) + resolvedPriority;
    }

    getZIndex(y, height = 0, priority = 0) {
        const resolvedY = Number.isFinite(y) ? y : 0;
        const resolvedHeight = Number.isFinite(height) ? height : 0;
        return this.getDepthZIndex(resolvedY + resolvedHeight, priority);
    }

    getMaxDimensions() {
        const container = this.getContainerRect();
        const canvas = this.getCanvasRect();

        return {
            width: this.camera?.isScrollable.x ? canvas.width : container.width,
            height: this.camera?.isScrollable.y ? canvas.height : container.height
        };
    }

    isMouseInContainer() {
        const mousePos = this.inputHandler.getMousePosition();
        if (!Utility.isIntersecting(
            mousePos.x,
            mousePos.y,
            this.getContainerRect()
        )) {
            return false;
        }

        const mouseState = this.inputHandler?.inputSystem?.state?.mouse;
        const clientX = mouseState?.clientX ?? (mousePos.x - window.scrollX);
        const clientY = mouseState?.clientY ?? (mousePos.y - window.scrollY);
        const hoveredElement = document.elementFromPoint(clientX, clientY);

        if (!hoveredElement || !this.element.contains(hoveredElement)) {
            return false;
        }

        if (!this.camera || !this.inputHandler) {
            return true;
        }

        const world = this.inputHandler.screenToWorldCoordinates(mousePos.x, mousePos.y);
        const canvasRect = this.getCanvasRect();

        return world.x >= 0 &&
            world.y >= 0 &&
            world.x <= canvasRect.width &&
            world.y <= canvasRect.height;
    }

    drawTargetDot() {
        const cursorElement = this.element.querySelector('.cursor-dot');
        if (!cursorElement) return;

        // This debug dot represents the raw screen-space pointer position.
        // Keep it visible alongside the world-space goal/grid markers, but only
        // while the pointer is actually over the container.
        if (!this.isMouseInContainer()) {
            cursorElement.classList.add('is-hidden');
            return;
        }

        cursorElement.classList.remove('is-hidden');

        const world = this.inputHandler.getMouseWorldPosition();
        cursorElement.style.left = world.x + 'px';
        cursorElement.style.top = world.y + 'px';
      }

    getOffset(el) {
        const rect = el.getBoundingClientRect();
        let _x = window.scrollX;
        let _y = window.scrollY;
        let current = el;

        while (current && !isNaN(current.offsetLeft) && !isNaN(current.offsetTop)) {
            _x += current.offsetLeft - current.scrollLeft;
            _y += current.offsetTop - current.scrollTop;
            current = current.offsetParent;
        }

        return {
            top: _y,
            left: _x,
            x: _x,
            y: _y,
            width: rect.width,
            height: rect.height,
            right: _x + rect.width,
            bottom: _y + rect.height
        };
    }

    getRect(z) {
        let rect = z.getBoundingClientRect();
        var left = rect.left + window.scrollX;
        var top = rect.top + window.scrollY;
        var width = rect.width;
        var height = rect.height;

        return {
            x: left,
            y: top,
            left: left,
            top: top,
            right: left + width,
            bottom: top + height,
            width: width,
            height: height,
        };
    }

    invalidateCanvasRect() {
        this._cachedCanvasRect = null;
    }

    getCanvasRect() {
        if (this._cachedCanvasRect) return this._cachedCanvasRect;
        let rect = this.getRect(this.canvas);
        const configuredWidth = Number.isFinite(this.gameMap?.dimensions?.width)
            ? this.gameMap.dimensions.width
            : Number.parseFloat(this.canvas.style.width);
        const configuredHeight = Number.isFinite(this.gameMap?.dimensions?.height)
            ? this.gameMap.dimensions.height
            : Number.parseFloat(this.canvas.style.height);

        const fallbackWidth = Math.max(
            this.canvas.scrollWidth || 0,
            this.canvas.clientWidth || 0,
            ...Array.from(this.canvas.children || []).map(child =>
                Math.max(child.scrollWidth || 0, child.offsetWidth || 0)
            )
        );
        const fallbackHeight = Math.max(
            this.canvas.scrollHeight || 0,
            this.canvas.clientHeight || 0,
            ...Array.from(this.canvas.children || []).map(child =>
                Math.max(child.scrollHeight || 0, child.offsetHeight || 0)
            )
        );

        const contentWidth = Number.isFinite(configuredWidth) && configuredWidth > 0
            ? configuredWidth
            : fallbackWidth;
        const contentHeight = Number.isFinite(configuredHeight) && configuredHeight > 0
            ? configuredHeight
            : fallbackHeight;

        this._cachedCanvasRect = {
            left: rect.left,
            top: rect.top,
            width: contentWidth,
            height: contentHeight
        };
        return this._cachedCanvasRect;
    }

    getWorldBounds() {
        const canvasRect = this.getCanvasRect();
        return {
            left: 0,
            top: 0,
            right: canvasRect.width,
            bottom: canvasRect.height,
            width: canvasRect.width,
            height: canvasRect.height
        };
    }

    getEntityBoundsAt(entity, x = 0, y = 0, options = {}) {
        return RectUtils.getEntityBoundsAt(entity, x, y, options);
    }

    clampEntityPosition(entity, x = 0, y = 0, options = {}) {
        const worldBounds = options.bounds || this.getWorldBounds();
        return RectUtils.clampEntityPosition(entity, x, y, worldBounds, options);
    }

    getContainerRect() {
        return this.getRect(this.element);
    }

    getLocalOffset(el) {
        const rect = this.getOffset(el);
        const container = this.getOffset(this.element);
        const x = rect.x - container.x;
        const y = rect.y - container.y;
        return {
            x, y,
            left: x,
            top: y,
            right: x + rect.width,
            bottom: y + rect.height,
            width: rect.width,
            height: rect.height
        };
    }

    createFallbackRosterData() {
        const speciesCatalog = MyteDefinitionRegistry.getSpeciesCatalogSync?.() || [];
        const fallbackEntries = speciesCatalog.filter(entry => entry.essential);
        const resolvedEntries = fallbackEntries.length > 0
            ? fallbackEntries
            : [{ id: MyteDefinitionRegistry.defaultSpeciesId || 'snail', label: 'Myte' }];

        return resolvedEntries.map((entry, index) => ({
            id: String(index + 1),
            name: entry.label || `Myte ${index + 1}`,
            species: entry.id || 'snail',
            slotId: `myte-slot-${index + 1}`,
            slotLabel: `${entry.label || `Myte ${index + 1}`}'s Slot`,
            slotX: 0,
            slotY: 0,
            hasSlotPosition: false,
            isActive: false,
            goal: DEFAULT_MODE,
            followGoal: DEFAULT_FOLLOW_MODE,
            autonomyGoal: DEFAULT_AUTONOMY_MODE,
            stats: {
                health: 100,
                mood: 100,
                energy: SiteConfig.myte.initialStats.energy,
                boredom: SiteConfig.myte.initialStats.boredom,
                comfort: SiteConfig.myte.initialStats.comfort,
                confidence: SiteConfig.myte.initialStats.confidence
            }
        }));
    }

    extractRosterDataFromDom(wrappers = []) {
        return wrappers.map((wrapper, index) => {
            const interactiveElement = wrapper.querySelector('.interactive-myte');
            const slotNameElement = wrapper.querySelector('.myte-home-label .name');
            const slotX = Number.parseFloat(wrapper.style.left) || 0;
            const slotY = Number.parseFloat(wrapper.style.top) || 0;
            const speciesId = interactiveElement?.dataset?.myteSpecies ||
                wrapper.dataset?.myteSpecies ||
                MyteDefinitionRegistry.defaultSpeciesId ||
                'snail';
            const name = interactiveElement?.dataset?.myteName ||
                interactiveElement?.querySelector?.('.name')?.textContent?.trim?.() ||
                `Myte ${index + 1}`;

            return {
                id: interactiveElement?.dataset?.myteId ||
                    wrapper.dataset?.myteId ||
                    wrapper.id ||
                    String(index + 1),
                name,
                species: speciesId,
                slotId: wrapper.id || `myte-slot-${index + 1}`,
                slotLabel: slotNameElement?.textContent?.trim?.() || `${name}'s Slot`,
                slotX,
                slotY,
                hasSlotPosition: wrapper.style.left !== '' || wrapper.style.top !== '',
                isActive: false,
                goal: DEFAULT_MODE,
                followGoal: DEFAULT_FOLLOW_MODE,
                autonomyGoal: DEFAULT_AUTONOMY_MODE,
                stats: {
                    health: 100,
                    mood: 100,
                    energy: SiteConfig.myte.initialStats.energy,
                    boredom: SiteConfig.myte.initialStats.boredom,
                    comfort: SiteConfig.myte.initialStats.comfort,
                    confidence: SiteConfig.myte.initialStats.confidence
                }
            };
        });
    }

    normalizeRosterEntry(entry = {}, index = 0) {
        const species = MyteDefinitionRegistry.normalizeSpeciesId?.(entry.species || entry.speciesId || 'snail') || 'snail';
        const name = String(entry.name || entry.displayName || `Myte ${index + 1}`).trim() || `Myte ${index + 1}`;
        const slotId = String(entry.slotId || `myte-slot-${index + 1}`);
        const slotLabel = String(entry.slotLabel || `${name}'s Slot`).trim() || `${name}'s Slot`;
        const stats = entry.stats || {};
        const slotX = Number.isFinite(Number(entry.slotX)) ? Number(entry.slotX) : 0;
        const slotY = Number.isFinite(Number(entry.slotY)) ? Number(entry.slotY) : 0;
        const hasExplicitSlotPosition = entry.hasSlotPosition === true ||
            (entry.hasSlotPosition == null && (slotX !== 0 || slotY !== 0));

        return {
            id: String(entry.id || index + 1),
            name,
            species,
            slotId,
            slotLabel,
            slotX,
            slotY,
            hasSlotPosition: hasExplicitSlotPosition,
            isActive: entry.isActive === true,
            goal: entry.goal ?? DEFAULT_MODE,
            followGoal: entry.followGoal ?? DEFAULT_FOLLOW_MODE,
            autonomyGoal: entry.autonomyGoal ?? DEFAULT_AUTONOMY_MODE,
            posX: Number.isFinite(Number(entry.posX)) ? Number(entry.posX) : null,
            posY: Number.isFinite(Number(entry.posY)) ? Number(entry.posY) : null,
            stats: {
                health: Number.isFinite(Number(stats.health)) ? Number(stats.health) : 100,
                mood: Number.isFinite(Number(stats.mood)) ? Number(stats.mood) : 100,
                energy: Number.isFinite(Number(stats.energy)) ? Number(stats.energy) : SiteConfig.myte.initialStats.energy,
                boredom: Number.isFinite(Number(stats.boredom)) ? Number(stats.boredom) : SiteConfig.myte.initialStats.boredom,
                comfort: Number.isFinite(Number(stats.comfort)) ? Number(stats.comfort) : SiteConfig.myte.initialStats.comfort,
                confidence: Number.isFinite(Number(stats.confidence)) ? Number(stats.confidence) : SiteConfig.myte.initialStats.confidence
            }
        };
    }

    getInitialRosterData(existingWrappers = []) {
        const savedRoster = this.core?.user?.savedMytes;
        if (Array.isArray(savedRoster) && savedRoster.length > 0) {
            return savedRoster.map((entry, index) => this.normalizeRosterEntry(entry, index));
        }

        if (existingWrappers.length > 0) {
            return this.extractRosterDataFromDom(existingWrappers)
                .map((entry, index) => this.normalizeRosterEntry(entry, index));
        }

        return this.createFallbackRosterData()
            .map((entry, index) => this.normalizeRosterEntry(entry, index));
    }

    createMyteSlotElement(rosterEntry, index) {
        const wrapper = document.createElement('div');
        wrapper.id = rosterEntry.slotId || `myte-slot-${index + 1}`;
        wrapper.className = `myte-slot ${rosterEntry.species}`;
        wrapper.dataset.myteSpecies = rosterEntry.species;
        wrapper.dataset.myteId = rosterEntry.id;

        if (rosterEntry.hasSlotPosition && Number.isFinite(rosterEntry.slotX)) {
            wrapper.style.left = `${rosterEntry.slotX}px`;
        }
        if (rosterEntry.hasSlotPosition && Number.isFinite(rosterEntry.slotY)) {
            wrapper.style.top = `${rosterEntry.slotY}px`;
        }

        const safeMyteId = String(rosterEntry.id || index + 1)
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-');

        // Safe DOM construction — never use innerHTML with save-data values.
        const homeLabel = document.createElement('div');
        homeLabel.className = 'myte-home-label';
        const homeLabelName = document.createElement('div');
        homeLabelName.className = 'name tooltip';
        homeLabelName.textContent = rosterEntry.slotLabel;
        homeLabel.appendChild(homeLabelName);

        const homeSlot = document.createElement('div');
        homeSlot.className = 'myte-home-slot';

        const interactive = document.createElement('div');
        interactive.id = `interactive-myte-${safeMyteId}`;
        interactive.className = 'interactive-myte';
        interactive.dataset.myteId = String(rosterEntry.id ?? '');
        interactive.dataset.myteName = String(rosterEntry.name ?? '');
        interactive.dataset.myteSpecies = String(rosterEntry.species ?? '');
        interactive.draggable = false;

        const innerWrapper = document.createElement('div');
        innerWrapper.className = 'inner-wrapper';

        const sprite = document.createElement('div');
        sprite.className = 'sprite';

        const nameWrapper = document.createElement('div');
        nameWrapper.className = 'name-wrapper';
        const before = document.createElement('span');
        before.className = 'before';
        before.textContent = 'x';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name tooltip';
        nameDiv.textContent = rosterEntry.name;
        nameWrapper.appendChild(before);
        nameWrapper.appendChild(nameDiv);

        const commands = document.createElement('div');
        commands.className = 'commands';

        const dialogue = document.createElement('div');
        dialogue.className = 'dialogue';
        const dialogueText = document.createElement('span');
        dialogueText.className = 'text';
        dialogue.appendChild(dialogueText);

        const aboveWrapper = document.createElement('div');
        aboveWrapper.className = 'above-wrapper';
        const battery = document.createElement('div');
        battery.className = 'battery';
        aboveWrapper.appendChild(battery);

        innerWrapper.append(sprite, nameWrapper, commands, dialogue, aboveWrapper);
        interactive.appendChild(innerWrapper);
        wrapper.append(homeLabel, homeSlot, interactive);

        return wrapper;
    }

    applySavedMyteState(myte, rosterEntry = {}) {
        if (!myte?.stats || !rosterEntry) {
            return;
        }

        myte.name = rosterEntry.name || myte.name;
        myte.element.dataset.myteName = myte.name;
        myte.duplicate?.setAttribute?.('data-myte-name', myte.name);

        const displayNameElements = [
            myte.element.querySelector('.name-wrapper .name'),
            myte.duplicate?.querySelector?.('.name-wrapper .name'),
            myte.elements.wrapper?.querySelector?.('.myte-home-label .name')
        ].filter(Boolean);
        displayNameElements.forEach((element, index) => {
            element.textContent = index === 2
                ? (rosterEntry.slotLabel || `${myte.name}'s Slot`)
                : myte.name;
        });

        const stats = rosterEntry.stats || {};
        myte.stats.health = Math.max(myte.stats.minHealth, Math.min(myte.stats.maxHealth, stats.health ?? myte.stats.health));
        myte.stats.mood = Math.max(myte.stats.minMood, Math.min(myte.stats.maxMood, stats.mood ?? myte.stats.mood));
        myte.stats.energy = Math.max(myte.stats.minEnergy, Math.min(myte.stats.maxEnergy, stats.energy ?? myte.stats.energy));
        myte.stats.boredom = Math.max(myte.stats.minBoredom, Math.min(myte.stats.maxBoredom, stats.boredom ?? myte.stats.boredom));
        myte.stats.comfort = Math.max(myte.stats.minComfort, Math.min(myte.stats.maxComfort, stats.comfort ?? myte.stats.comfort));
        myte.stats.confidence = Math.max(myte.stats.minConfidence, Math.min(myte.stats.maxConfidence, stats.confidence ?? myte.stats.confidence));

        // Restore progression and personality traits from the canonical save schema.
        if (stats.speed != null) myte.stats.speed = stats.speed;
        if (stats.level != null) myte.stats.level = stats.level;
        if (stats.experience != null) myte.stats.experience = stats.experience;
        if (stats.traits && typeof stats.traits === 'object') {
            myte.stats.traits = { ...myte.stats.traits, ...stats.traits };
        }

        myte.stats.updateBatteryDisplay?.();
    }

    // Myte management methods
    async setupMytes() {
        await MyteDefinitionRegistry.preload();

        const foregroundLayer = this.element.querySelector('.layer.foreground');
        if (!foregroundLayer) {
            throw new Error('Myte foreground layer not found.');
        }

        const wrappers = Array.from(this.element.querySelectorAll('.myte-slot'));
        const rosterData = this.getInitialRosterData(wrappers);
        if (rosterData.length === 0) {
            throw new Error('No Myte roster data available.');
        }

        wrappers.forEach(wrapper => wrapper.remove());
        this.element.querySelectorAll('.world-myte').forEach(myteElement => myteElement.remove());

        const rebuiltWrappers = rosterData.map((entry, index) => {
            const wrapper = this.createMyteSlotElement(entry, index);
            foregroundLayer.appendChild(wrapper);
            return wrapper;
        });

        rebuiltWrappers.forEach((wrapper, index) => {
            const interactiveElement = wrapper.querySelector('.interactive-myte');
            const rosterEntry = rosterData[index];
            const definition = MyteDefinitionRegistry.getSpeciesSync(rosterEntry.species);
            const myte = new Myte(rosterEntry.id, this, interactiveElement, definition);
            myte.init();
            this.applySavedMyteState(myte, rosterEntry);
            this.mytes.push(myte);
        });

        this.core.user?.trackMytes?.(this.mytes);

        const myteSpawn = this.gameMap.spawnPoints.get("myte");
        const needsSpawnedHomeSlot = !rosterData[0]?.hasSlotPosition ||
            (rosterData[0]?.slotX === 0 && rosterData[0]?.slotY === 0);
        if (this.mytes.length > 0 && myteSpawn && needsSpawnedHomeSlot) {
            this.mytes[0].setWrapperPosition(myteSpawn.x, myteSpawn.y);
        }

        let restoredActiveMyte = null;
        this.mytes.forEach((myte, index) => {
            const rosterEntry = rosterData[index];
            if (!rosterEntry?.isActive) {
                return;
            }

            restoredActiveMyte = myte;
            myte.startWithOptions({
                goal: rosterEntry.goal,
                followGoal: rosterEntry.followGoal,
                autonomyGoal: rosterEntry.autonomyGoal
            });

            if (Number.isFinite(rosterEntry.posX) && Number.isFinite(rosterEntry.posY)) {
                myte.setPosition(rosterEntry.posX, rosterEntry.posY, this.settings.limitMap);
                myte.setTarget(rosterEntry.posX, rosterEntry.posY);
                myte.setSpritePosition(rosterEntry.posX, rosterEntry.posY);
            }
        });

        if (restoredActiveMyte) {
            this.setActiveMyte(restoredActiveMyte);
        }

        if (this.settings.autoDeployMytesOnLoad) {
            this.mytes.forEach(myte => {
                myte.startWithOptions({
                    goal: MOVE_TYPES.FREEROAM,
                    autonomyGoal: myte.autonomyGoal
                });
            });
        }

        this.ui?.debugPanel?.disableButtons?.();
    }

    setNextMyteAsActive(previous) {
        let next = null;

        if (this.mytes.length > 1) {
            for (let i = 0; i < this.mytes.length; i++) {
                let myte = this.mytes[i];
                if (myte != previous && myte.isActive) {
                    next = myte;
                    break;
                }
            }
        }

        this.setActiveMyte(next);
    }

    checkCollision(entityA, entityB) {
        return this.checkBoxCollision(entityA, entityB);
    }

    handleCollision(entityA, entityB) {
        if (entityA.onCollision) entityA.onCollision(entityB);
        if (entityB.onCollision) entityB.onCollision(entityA);
        this.core.eventManager.emit('collision', { entityA, entityB });
    }

    getEntityColliderBounds(entity, x = entity?.posX ?? 0, y = entity?.posY ?? 0) {
        return RectUtils.getEntityColliderBounds(entity, x, y);
    }

    getColliderBounds(entity) {
        return RectUtils.getColliderBounds(entity);
    }

    checkBoxCollision(entityA, entityB, options = {}) {
        return RectUtils.checkBoxCollision(entityA, entityB, options);
    }

    setActiveMyte(myte) {
        const previousActiveMyte = this.activeMyte;
        this.activeMyte = myte;

        if (previousActiveMyte && previousActiveMyte !== myte) {
            previousActiveMyte.cancelInactivityFreeRoam?.();
        }

        this.camera.setMode(myte !== null ? CAMERA_FOLLOW_MODES.CHARACTER : this.settings.defaultMyteCamera);

        //  add active if myte isnt null
        if (myte !== null) {
            myte.setStartTime();
            this.ui.hudManager.update();
        }

        // Set other mytes to free roam
        this.mytes.forEach(m => {
            if (m != this.activeMyte) {
                if (m.isDeployed) {
                    m.setMode(MOVE_TYPES.FREEROAM);
                }
            } else if (m.goal === MOVE_TYPES.FREEROAM) {
                m.setMode(DEFAULT_MODE);
            }

            m.syncSelectionState();
        });

        // start it if it's not active
        if (myte && !myte.isActive) {
            myte.startWithOptions({ goal: DEFAULT_MODE });
        }

        this.ui.myteListManager.updateMytesList(myte);
        this.ui.debugPanel?.updateButtons();
        this.ui.viewPanel?.updateButtonStates();
        this.ui.setSelected(null);

        this.eventManager?.emit('container:active_myte_changed', { myte });
    }

    deactivateActiveMyte(myte = this.activeMyte) {
        if (!myte || this.activeMyte !== myte) {
            this.setActiveMyte(null);
            return;
        }

        myte.cancelInactivityFreeRoam?.();

        if (myte.isDeployed) {
            myte.setMode(MOVE_TYPES.FREEROAM);
        }

        this.activeMyte = null;
        this.camera.setMode(this.settings.defaultMyteCamera);

        this.mytes.forEach(m => {
            m.syncSelectionState();
        });

        this.ui.myteListManager.updateMytesList(null);
        this.ui.debugPanel?.updateButtons?.();
        this.ui.hudManager.update();
        this.ui.viewPanel?.updateButtonStates();
        this.ui.setSelected(null);

        this.eventManager?.emit('container:active_myte_changed', { myte: null });
    }

    update(deltaTime) {
        this.drawTargetDot();
        this.updateUserActivity();

        // Update components
        this.mytes.forEach(myte => {
            if (myte.isActive) {
                myte.update(deltaTime);
            } else {
                myte.updateInactive?.(deltaTime);
            }
        });

        if (this.camera) this.camera.update();
        if (this.ui) this.ui.update();
        if (this.gameMap) this.gameMap.update(deltaTime);
    }

    tickUpdate(tickDelta) {
        // Fixed-rate gameplay logic for all systems
        if (this.gameMap) this.gameMap.tickUpdate(tickDelta);

        this.mytes.forEach(myte => {
            if (myte.isActive && myte.tickUpdate) {
                myte.tickUpdate(tickDelta);
            }
        });

        if (this.timeManager) this.timeManager.tickUpdate?.(tickDelta);
    }



    dispose() {
        window.removeEventListener('resize', this._boundInvalidateCanvasRect);
        this._cachedCanvasRect = null;

        this.mytes.forEach(myte => myte.dispose());
        this.mytes = [];
        this.activeMyte = null;

        if (this.camera) {
            this.camera.dispose();
            this.camera = null;
        }

        if (this.ui) {
            this.ui.dispose();
            this.ui = null;
        }

        if (this.gameMap) {
            this.gameMap.dispose();
            this.gameMap = null;
        }

        if (this.inventory) {
            this.inventory.dispose();
            this.inventory = null;
        }

        if (this.inputHandler) {
            this.inputHandler.dispose();
            this.inputHandler = null;
        }

        if (this.transitionManager) {
            this.transitionManager.dispose();
            this.transitionManager = null;
        }



    }
}
