// Item preview: magnified atlas cell plus the full shared atlas with the
// current item's cell highlighted. Clicking another occupied cell navigates
// to that item. The atlas config comes from the catalog-level visual block in
// data/metadata/items.json, same as ItemRegistry uses.
class ItemPreview {
    constructor(container, record, { domain, onNavigate }) {
        this.container = container;
        this.record = record;
        this.domain = domain;
        this.onNavigate = onNavigate;
        this.readCatalog();
    }

    readCatalog() {
        const catalogVisual = this.domain.meta?.visual || {};
        this.sheetUrl = catalogVisual.spriteSheet?.url || '';
        this.frameSize = catalogVisual.spriteSheet?.frameSize || { width: 32, height: 32 };
    }

    refresh(record) {
        this.record = record;
        this.readCatalog();
        this.mount();
    }

    mount() {
        this.container.innerHTML = '';

        if (!this.sheetUrl) {
            const empty = document.createElement('div');
            empty.className = 'editor-stage__empty';
            empty.textContent = 'No sprite atlas configured.';
            this.container.appendChild(empty);
            return;
        }

        const sprite = this.record.merged.visual?.sprite;
        if (!sprite) {
            // Catalog record (or item without sprite data): show the atlas alone.
            this.container.appendChild(this.buildAtlas(null));
            return;
        }

        const { stage, subject } = PreviewControls.makeStage();
        const scale = 5;

        const cell = document.createElement('div');
        cell.className = 'editor-stage__sprite';
        cell.style.width = `${this.frameSize.width}px`;
        cell.style.height = `${this.frameSize.height}px`;
        cell.style.backgroundImage = `url(${this.sheetUrl})`;
        cell.style.backgroundPosition =
            `${-sprite.col * this.frameSize.width}px ${-sprite.row * this.frameSize.height}px`;
        subject.appendChild(cell);
        subject.style.transform = `scale(${scale})`;

        this.container.appendChild(stage);

        const info = PreviewControls.makeControlsRow();
        info.appendChild(PreviewControls.makeGroup(
            'Atlas cell',
            PreviewControls.makeValueLabel(`col ${sprite.col}, row ${sprite.row}`)
        ));
        this.container.appendChild(info);

        this.container.appendChild(this.buildAtlas(sprite));
    }

    buildAtlas(activeSprite) {
        const wrapper = document.createElement('div');
        wrapper.className = 'editor-stage';
        wrapper.style.flex = '0 0 auto';
        wrapper.style.minHeight = '0';
        wrapper.style.padding = 'var(--space-md)';
        wrapper.style.overflow = 'auto';

        const atlas = document.createElement('div');
        atlas.style.cssText = 'position:relative;line-height:0;image-rendering:pixelated;';

        const img = document.createElement('img');
        img.src = this.sheetUrl;
        img.alt = 'Item atlas';
        img.style.imageRendering = 'pixelated';
        atlas.appendChild(img);

        if (activeSprite) {
            const highlight = PreviewControls.makeBoxOverlay(
                {
                    x: activeSprite.col * this.frameSize.width,
                    y: activeSprite.row * this.frameSize.height,
                    width: this.frameSize.width,
                    height: this.frameSize.height
                },
                EditorOverlayColors.select,
                this.record.id
            );
            atlas.appendChild(highlight);
        }

        atlas.addEventListener('click', event => {
            const rect = img.getBoundingClientRect();
            const col = Math.floor((event.clientX - rect.left) / this.frameSize.width);
            const row = Math.floor((event.clientY - rect.top) / this.frameSize.height);
            const matches = this.domain.records.filter(r => {
                const s = r.merged.visual?.sprite;
                return s && s.col === col && s.row === row;
            });
            if (matches.length === 0) return;
            if (matches.length === 1) {
                if (matches[0].id !== this.record.id) this.onNavigate(matches[0].id);
                return;
            }
            this._showCellPopover(matches, event.clientX, event.clientY);
        });
        atlas.style.cursor = 'pointer';
        atlas.title = 'Click an occupied cell to jump to that item';

        wrapper.appendChild(atlas);
        return wrapper;
    }

    _showCellPopover(matches, clientX, clientY) {
        this._dismissPopover();

        const popover = document.createElement('div');
        popover.className = 'editor-item-popover';
        popover.style.left = `${clientX}px`;
        popover.style.top = `${clientY}px`;

        const title = document.createElement('div');
        title.className = 'editor-item-popover__title';
        title.textContent = `${matches.length} items share this cell`;
        popover.appendChild(title);

        matches.forEach(record => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'editor-item-popover__item';
            btn.textContent = record.label !== record.id ? `${record.label} (${record.id})` : record.id;
            btn.classList.toggle('is-active', record.id === this.record.id);
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this._dismissPopover();
                if (record.id !== this.record.id) this.onNavigate(record.id);
            });
            popover.appendChild(btn);
        });

        document.body.appendChild(popover);
        this._activePopover = popover;

        const dismiss = e => {
            if (!popover.contains(e.target)) {
                this._dismissPopover();
                document.removeEventListener('click', dismiss, true);
            }
        };
        setTimeout(() => document.addEventListener('click', dismiss, true), 0);
    }

    _dismissPopover() {
        if (this._activePopover) {
            this._activePopover.remove();
            this._activePopover = null;
        }
    }

    destroy() {
        this._dismissPopover();
    }
}
