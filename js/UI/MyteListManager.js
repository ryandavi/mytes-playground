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

        // Build thumbnail
        thumbnail.appendChild(spriteContainer);
        thumbnail.appendChild(details);

        // Add click handler
        thumbnail.addEventListener('click', () => {
            if (myte === this.parent.getActiveMyte()) {
                this.parent.parent.deactivateActiveMyte?.(myte);
                return;
            }

            this.parent.setActiveMyte(myte);
        });

        this.applyThumbnailState(thumbnail, myte);

        return thumbnail;
    }

    applyThumbnailVisuals(spriteContainer, spriteInner, myte) {
        if (!spriteContainer || !spriteInner || !myte?.definition) return;

        const frameSize = myte.definition?.visual?.frameSize || {};
        const width = Number(frameSize.width) || 192;
        const height = Number(frameSize.height) || 192;
        const thumbSize = 48;
        const scale = Math.min(thumbSize / width, thumbSize / height);
        const spriteSheet = MyteDefinitionRegistry.getSpriteSheetConfig(myte.definition);

        spriteInner.style.width = `${width}px`;
        spriteInner.style.height = `${height}px`;
        spriteInner.style.backgroundImage = spriteSheet.url ? `url('${spriteSheet.url}')` : '';
        spriteInner.style.filter = spriteSheet.filter || 'none';
        spriteInner.style.transform = `scale(${scale})`;
        spriteInner.style.transformOrigin = 'top left';
    }

    getMyteStateLabel(myte) {
        if (!myte?.isActive) {
            return 'Inactive';
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
        thumbnail.dataset.myteState = stateLabel;
        thumbnail.querySelector('.myte-state').textContent = stateLabel;
        thumbnail.title = `${myte.name}: ${stateLabel}`;
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
