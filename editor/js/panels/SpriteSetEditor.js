// Visual sprite set editor: spritesheet grid + frame sequence strip.
// The active set is driven externally (by MytePreview's sprite set selector) —
// this class has no set navigation of its own.
class SpriteSetEditor {
    constructor(container, record, { onEdit = null } = {}) {
        this.container = container;
        this.onEdit = onEdit;
        this._cellEls = [];
        this.gridZoom = 0.5;
        this._syncFromRecord(record);
    }

    _syncFromRecord(record) {
        this.record = record;
        this.definition = record.merged;
        this.frameSize = this.definition.visual?.frameSize || { width: 192, height: 192 };
        this.sheet = MyteDefinitionRegistry.getSpriteSheetConfig(this.definition);
        this.spriteSets = Utility.deepClone(this.definition.visual?.spriteSets || {});
        if (!this.activeSet || !(this.activeSet in this.spriteSets)) {
            this.activeSet = Object.keys(this.spriteSets)[0] || null;
        }
    }

    get frames() {
        return this.spriteSets[this.activeSet] || [];
    }

    mount() {
        this.container.innerHTML = '';
        this._cellEls = [];

        if (!this.sheet.url) {
            const msg = document.createElement('div');
            msg.className = 'editor-sprite-set-editor__empty';
            msg.textContent = 'No spritesheet URL defined — set visual.spriteSheet.url first.';
            this.container.appendChild(msg);
            return;
        }

        this.gridEl = document.createElement('div');
        this.gridEl.className = 'editor-sprite-grid';
        this.container.appendChild(this.gridEl);

        this.sequenceEl = document.createElement('div');
        this.sequenceEl.className = 'editor-sprite-sequence';
        this.container.appendChild(this.sequenceEl);

        this._loadGrid();
        this._renderSequence();
    }

    // Called by MytePreview when the sprite set select changes.
    selectSet(setName) {
        this.activeSet = setName;
        this._highlightCells();
        this._renderSequence();
    }

    setZoom(zoom) {
        this.gridZoom = Math.min(2, Math.max(0.25, zoom));
        this._loadGrid();
        return this.gridZoom;
    }

    addSet(setName) {
        if (!setName?.trim() || this.spriteSets[setName] != null || !this.onEdit) return false;
        this.spriteSets[setName] = [];
        this.onEdit(['visual', 'spriteSets', setName], []);
        return true;
    }

    deleteActiveSet() {
        if (!this.activeSet || !this.onEdit) return null;
        const deleted = this.activeSet;
        delete this.spriteSets[deleted];
        this.onEdit(['visual', 'spriteSets'], Utility.deepClone(this.spriteSets));
        this.activeSet = Object.keys(this.spriteSets)[0] || null;
        return deleted;
    }

    _loadGrid() {
        this.gridEl.innerHTML = '';
        this._cellEls = [];

        const { width: fw, height: fh } = this.frameSize;
        const img = new Image();
        img.style.cssText = 'display:block;image-rendering:pixelated;';
        if (this.sheet.filter && this.sheet.filter !== 'none') img.style.filter = this.sheet.filter;

        img.onload = () => {
            const cols = Math.floor(img.naturalWidth / fw);
            const rows = Math.floor(img.naturalHeight / fh);
            const cw = fw * this.gridZoom;
            const ch = fh * this.gridZoom;

            img.style.width = `${img.naturalWidth * this.gridZoom}px`;
            img.style.height = `${img.naturalHeight * this.gridZoom}px`;

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;display:inline-block;line-height:0;user-select:none;';
            wrapper.appendChild(img);

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const cell = document.createElement('div');
                    cell.className = 'editor-sprite-cell';
                    cell.dataset.col = c;
                    cell.dataset.row = r;
                    cell.style.cssText = `left:${c * cw}px;top:${r * ch}px;width:${cw}px;height:${ch}px;`;
                    cell.addEventListener('click', () => this._addFrame(c, r));
                    wrapper.appendChild(cell);
                    this._cellEls.push(cell);
                }
            }

            this.gridEl.appendChild(wrapper);
            this._highlightCells();
        };

        img.src = this.sheet.url;
    }

    _highlightCells() {
        if (!this._cellEls.length) return;
        const counts = new Map();
        this.frames.forEach(([c, r]) => {
            const k = `${c},${r}`;
            counts.set(k, (counts.get(k) || 0) + 1);
        });
        this._cellEls.forEach(cell => {
            const k = `${cell.dataset.col},${cell.dataset.row}`;
            const n = counts.get(k) || 0;
            cell.classList.toggle('is-active', n > 0);
            cell.querySelector('.editor-sprite-cell__badge')?.remove();
            if (n > 1) {
                const badge = document.createElement('span');
                badge.className = 'editor-sprite-cell__badge';
                badge.textContent = `×${n}`;
                cell.appendChild(badge);
            }
        });
    }

    _renderSequence() {
        this.sequenceEl.innerHTML = '';
        if (!this.activeSet) return;
        const frames = this.frames;
        if (frames.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'editor-sprite-sequence__empty';
            empty.textContent = 'Click cells above to add frames';
            this.sequenceEl.appendChild(empty);
            return;
        }
        frames.forEach((frame, i) => this.sequenceEl.appendChild(this._buildThumb(frame, i)));
    }

    _buildThumb(frame, index) {
        const [col, row] = frame;
        const { width: fw, height: fh } = this.frameSize;
        const displaySize = 48;
        const scale = displaySize / Math.max(fw, fh);

        const wrapper = document.createElement('div');
        wrapper.className = 'editor-sprite-frame';
        wrapper.dataset.index = index;
        wrapper.draggable = true;
        wrapper.title = `Frame ${index + 1}: col ${col}, row ${row}`;

        const clip = document.createElement('div');
        clip.className = 'editor-sprite-frame__clip';
        clip.style.width = `${fw * scale}px`;
        clip.style.height = `${fh * scale}px`;

        const inner = document.createElement('div');
        inner.className = 'editor-sprite-frame__inner';
        inner.style.cssText = [
            `width:${fw}px`, `height:${fh}px`,
            `background-image:url(${this.sheet.url})`,
            `background-position:${-col * fw}px ${-row * fh}px`,
            `image-rendering:pixelated`,
            `transform:scale(${scale})`,
            `transform-origin:top left`,
        ].join(';');
        if (this.sheet.filter && this.sheet.filter !== 'none') inner.style.filter = this.sheet.filter;

        clip.appendChild(inner);
        wrapper.appendChild(clip);

        const info = document.createElement('div');
        info.className = 'editor-sprite-frame__info';
        info.textContent = index + 1;
        wrapper.appendChild(info);

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'editor-sprite-frame__remove';
        remove.textContent = '×';
        remove.title = `Remove frame ${index + 1}`;
        remove.addEventListener('click', e => { e.stopPropagation(); this._removeFrame(index); });
        wrapper.appendChild(remove);

        wrapper.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(index));
            wrapper.classList.add('is-dragging');
        });
        wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('is-dragging');
            this.sequenceEl.querySelectorAll('.editor-sprite-frame').forEach(el => el.classList.remove('is-drag-over'));
        });
        wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.classList.add('is-drag-over'); });
        wrapper.addEventListener('dragleave', () => wrapper.classList.remove('is-drag-over'));
        wrapper.addEventListener('drop', e => {
            e.preventDefault();
            wrapper.classList.remove('is-drag-over');
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (!isNaN(from) && from !== index) this._moveFrame(from, index);
        });

        return wrapper;
    }

    _addFrame(col, row) {
        if (!this.activeSet || !this.onEdit) return;
        this._commit([...this.frames, [col, row]]);
    }

    _removeFrame(index) {
        if (!this.activeSet || !this.onEdit) return;
        this._commit(this.frames.filter((_, i) => i !== index));
    }

    _moveFrame(from, to) {
        if (!this.activeSet || !this.onEdit) return;
        const frames = [...this.frames];
        const [moved] = frames.splice(from, 1);
        frames.splice(to, 0, moved);
        this._commit(frames);
    }

    _commit(frames) {
        this.spriteSets[this.activeSet] = frames;
        this.onEdit(['visual', 'spriteSets', this.activeSet], frames);
        this._highlightCells();
        this._renderSequence();
    }

    refresh(record) {
        const oldUrl = this.sheet?.url;
        this._syncFromRecord(record);
        if (this.sheet.url !== oldUrl) {
            this._loadGrid();
        } else {
            this._highlightCells();
        }
        this._renderSequence();
    }
}
