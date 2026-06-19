// Fallback workspace for list-style domains (actions, buffs, zones, environment
// presets) that don't have a visual preview yet. Shows the headline fields;
// the inspector carries the full definition.
class SummaryPreview {
    constructor(container, record) {
        this.container = container;
        this.record = record;
    }

    refresh(record) {
        this.record = record;
        this.mount();
    }

    mount() {
        this.container.innerHTML = '';

        const { stage, subject } = PreviewControls.makeStage();
        subject.style.maxWidth = '420px';

        const card = document.createElement('div');
        card.style.cssText = [
            'background-color: var(--surface-tooltip)',
            'outline: 1px solid var(--black)',
            'border-radius: var(--radius-xs)',
            'padding: var(--space-xl)',
            'font-size: 13px',
            'display: flex',
            'flex-direction: column',
            'gap: var(--space-md)'
        ].join(';');

        const data = this.record.merged;

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:700;font-size:16px;display:flex;align-items:center;gap:var(--space-md);';
        if (data.icon) {
            const icon = document.createElement('span');
            icon.textContent = data.icon;
            title.appendChild(icon);
        }
        const titleText = document.createElement('span');
        titleText.textContent = this.record.label;
        title.appendChild(titleText);
        card.appendChild(title);

        if (data.description) {
            const desc = document.createElement('div');
            desc.style.color = 'var(--text-subtle)';
            desc.textContent = data.description;
            card.appendChild(desc);
        }

        const chips = document.createElement('div');
        chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:var(--space-xs);';
        const chipValues = [
            data.category && `category: ${data.category}`,
            data.kind && `kind: ${data.kind}`,
            ...(Array.isArray(data.tags) ? data.tags.map(tag => `#${tag}`) : [])
        ].filter(Boolean);
        chipValues.forEach(text => {
            const chip = document.createElement('span');
            chip.className = 'editor-badge';
            chip.textContent = text;
            chips.appendChild(chip);
        });
        if (chipValues.length > 0) card.appendChild(chips);

        const scalars = Object.entries(data)
            .filter(([, value]) => value === null || typeof value !== 'object')
            .filter(([key]) => !['id', 'label', 'description', 'icon', 'category', 'kind'].includes(key));
        if (scalars.length > 0) {
            const list = document.createElement('div');
            list.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:var(--space-2xs) var(--space-md);font-size:12px;';
            scalars.forEach(([key, value]) => {
                const keyEl = document.createElement('span');
                keyEl.style.color = 'var(--text-muted)';
                keyEl.textContent = key;
                const valueEl = document.createElement('span');
                valueEl.style.fontWeight = '600';
                valueEl.textContent = String(value);
                list.appendChild(keyEl);
                list.appendChild(valueEl);
            });
            card.appendChild(list);
        }

        subject.appendChild(card);
        this.container.appendChild(stage);
    }

    destroy() {}
}
