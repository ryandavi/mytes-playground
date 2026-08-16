class MyteListManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.myteListContainer = document.getElementById('all_mytes');
    }

    init() {
        this.initMytesList();
    }

    createThumbnail(myte) {
        const thumbnail = document.createElement('div');
        thumbnail.classList.add('myte-thumbnail');
        thumbnail.classList.add('button');

        thumbnail.setAttribute('data-myte-id', myte.id);
        thumbnail.setAttribute('data-myte-species', myte.species);

        // Create sprite container
        const spriteContainer = document.createElement('div');
        spriteContainer.className = 'myte-sprite';
        spriteContainer.setAttribute('data-myte-species', myte.species);

        // Create sprite inner
        const spriteInner = document.createElement('div');
        spriteInner.className = 'myte-sprite-inner';
        spriteContainer.appendChild(spriteInner);
        this.applyThumbnailVisuals(spriteContainer, spriteInner, myte);

        // Create name element
        const name = document.createElement('span');
        name.className = 'myte-name';
        name.textContent = myte.name;

        const details = document.createElement('div');
        details.className = 'myte-details';
        details.appendChild(name);

        const state = document.createElement('span');
        state.className = 'myte-state';
        details.appendChild(state);

        const infoButton = document.createElement('button');
        infoButton.type = 'button';
        infoButton.className = 'myte-info-button';
        infoButton.textContent = 'Info';
        infoButton.setAttribute('aria-label', `Open information for ${myte.name}`);
        infoButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.parent.myteInfoPanel?.openFor?.(myte);
        });

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(details);
        thumbnail.appendChild(infoButton);

        // Add click handler
        thumbnail.addEventListener('click', () => this.handleThumbnailClick(myte));

        this.applyThumbnailState(thumbnail, myte);

        return thumbnail;
    }

    applyThumbnailVisuals(spriteContainer, spriteInner, myte) {
        if (!spriteContainer || !spriteInner || !myte?.definition) return;

        const frameSize = myte.definition?.visual?.frameSize || {};
        const width = Number(frameSize.width) || 192;
        const height = Number(frameSize.height) || 192;
        const thumbSize = spriteContainer.clientWidth || 48;
        const scale = Math.min(thumbSize / width, thumbSize / height);
        const spriteSheet = MyteDefinitionRegistry.getSpriteSheetConfig(myte.definition);

        spriteInner.style.width = `${width}px`;
        spriteInner.style.height = `${height}px`;
        spriteInner.style.backgroundImage = spriteSheet.url ? `url('${spriteSheet.url}')` : '';
        spriteInner.style.filter = spriteSheet.filter || 'none';
        spriteInner.style.transform = `scale(${scale})`;
        spriteInner.style.transformOrigin = 'top left';
    }

    // One click, one meaning: take control of this myte. What that costs depends
    // on where it is — deploy it from its slot, call it across the world, or
    // simply switch to it.
    handleThumbnailClick(myte) {
        const container = this.parent.parent;

        // Taking control hands the camera to a myte and wakes it up, and neither
        // means anything while the world is frozen. Switching who you play is a
        // Play-mode decision.
        if (container.gameMode?.isBuild()) {
            this.parent.showMessage?.('Leave Build mode to switch Mytes.', 'info', 'Build Mode');
            return;
        }

        // An escorted myte is still the one you are playing, so clicking it means
        // what it always means — only a myte off walking on its own is untouchable.
        if (this.getTravelManager()?.isTravellingAlone(myte)) {
            this.parent.showMessage?.(`${myte.name} is already on the way.`, 'info', 'On the way');
            return;
        }

        if (!myte.isActive) {
            if (!myte.isOnHomeMap) {
                container.summonMyte?.(myte);
                return;
            }

            // Resting in its slot on this map — wake it and take control.
            if (!myte.startWithOptions({
                goal: DEFAULT_MODE,
                followGoal: myte.followGoal,
                autonomyGoal: myte.autonomyGoal
            })) return;

            myte.clearHomeSlotHold?.();
            this.parent.setActiveMyte(myte);
            return;
        }

        if (myte === this.parent.getActiveMyte()) {
            container.deactivateActiveMyte?.(myte);
            return;
        }

        this.parent.setActiveMyte(myte);
    }

    getTravelManager() {
        return this.parent.parent.travelManager ?? null;
    }

    getMapDisplayName(mapId) {
        const mapLoader = this.parent.parent.core?.mapLoader;
        return mapLoader?.getCachedMapDisplayName?.(mapId)
            || mapLoader?.humanizeMapId?.(mapId)
            || String(mapId ?? 'Unknown');
    }

    // Resting in a slot on a map the player isn't in.
    isAway(myte) {
        return !!myte && !myte.isActive && !myte.isOnHomeMap;
    }

    getMyteStateLabel(myte) {
        const travelManager = this.getTravelManager();
        if (travelManager?.isEscorting(myte)) {
            return 'Walking';
        }

        if (travelManager?.isTravelling(myte)) {
            return travelManager.getDirection(myte) === MYTE_TRAVEL_DIRECTIONS.RETURN
                ? 'Heading Home'
                : 'Travelling';
        }

        if (this.isAway(myte)) {
            return travelManager?.canTravel(myte) ? 'Away' : 'Too Far';
        }

        if (!myte?.isActive) {
            return 'Inactive';
        }

        if (myte.isVisiting && myte !== this.parent.getActiveMyte()) {
            return 'Visiting';
        }

        if (myte === this.parent.getActiveMyte()) {
            return 'Following';
        }

        if (myte.goal === MOVE_TYPES.FREEROAM) {
            return 'Free Roam';
        }

        return 'Deployed';
    }

    applyThumbnailState(thumbnail, myte) {
        if (!thumbnail || !myte) return;

        const isActiveMyte = myte === this.parent.getActiveMyte();
        const isFreeRoam = myte.isActive && myte.goal === MOVE_TYPES.FREEROAM;
        const isInSlot = !myte.isActive;
        const stateLabel = this.getMyteStateLabel(myte);

        thumbnail.classList.toggle('active', isActiveMyte);
        thumbnail.classList.toggle('deployed', myte.isActive);
        thumbnail.classList.toggle('free-roam', isFreeRoam);
        thumbnail.classList.toggle('in-slot', isInSlot);
        thumbnail.classList.toggle('is-away', this.isAway(myte));
        thumbnail.classList.toggle('is-travelling', !!this.getTravelManager()?.isTravellingAlone(myte));
        thumbnail.dataset.myteState = stateLabel;
        thumbnail.querySelector('.myte-state').textContent = stateLabel;
        // Where it is, not where it lives — a myte left standing on another map
        // is "away" there, not at home.
        thumbnail.title = this.isAway(myte)
            ? `${myte.name}: ${stateLabel} in ${this.getMapDisplayName(this.parent.parent.getMyteMapId?.(myte) ?? myte.homeMapId)}`
            : `${myte.name}: ${stateLabel}`;
    }

    initMytesList() {
        if (!this.myteListContainer) {
            console.error('Myte list container not found');
            return;
        }

        // Clear existing content
        this.myteListContainer.innerHTML = '';

        // Add thumbnails
        const mytes = this.parent.getMytes();
        if (mytes && mytes.length > 0) {
            mytes.forEach(myte => {
                this.myteListContainer.appendChild(this.createThumbnail(myte));
            });
        } else {
            // No Mytes
            const emptyState = document.createElement('div');
            emptyState.className = 'empty';
            emptyState.textContent = 'No Mytes found';
            this.myteListContainer.appendChild(emptyState);
        }
    }

    updateMytesList(activeMyte) {
        if (!this.myteListContainer) return;

        const mytesById = new Map((this.parent.getMytes() || []).map(myte => [String(myte.id), myte]));

        this.myteListContainer.querySelectorAll('.myte-thumbnail').forEach(thumbnail => {
            const myte = mytesById.get(thumbnail.dataset.myteId);
            if (!myte) return;

            this.applyThumbnailState(thumbnail, myte);
        });
    }

    dispose() {
        this.myteListContainer = null;
    }
}
