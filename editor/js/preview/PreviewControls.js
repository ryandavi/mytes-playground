// Shared builders for preview workspaces: control rows, legend chips with
// overlay toggles, stage scaffolding, and the geometry overlay color scheme.
const EditorOverlayColors = {
    collider: '#e2574c',
    interaction: '#4285f4',
    select: '#34a853',
    hit: '#c542f4',
    pickup: '#00b5c9',
    anchor: '#f4b400',
    slot: '#ff7b00',
    light: '#f4b400',
    shadow: '#555555'
};

class PreviewControls {
    static makeStage() {
        const stage = document.createElement('div');
        stage.className = 'editor-stage';

        const subject = document.createElement('div');
        subject.className = 'editor-stage__subject';
        stage.appendChild(subject);

        return { stage, subject };
    }

    static makeControlsRow() {
        const row = document.createElement('div');
        row.className = 'editor-controls';
        return row;
    }

    static makeGroup(labelText, ...controls) {
        const group = document.createElement('div');
        group.className = 'editor-controls__group';

        if (labelText) {
            const label = document.createElement('label');
            label.textContent = labelText;
            group.appendChild(label);
        }

        controls.forEach(control => group.appendChild(control));
        return group;
    }

    static makeSelect(options, value, onChange) {
        const select = document.createElement('select');
        options.forEach(option => {
            const optionEl = document.createElement('option');
            optionEl.value = option;
            optionEl.textContent = option;
            select.appendChild(optionEl);
        });
        if (value != null) select.value = value;
        select.addEventListener('change', () => onChange(select.value));
        return select;
    }

    static makeButton(text, onClick, title = '') {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        if (title) button.title = title;
        button.addEventListener('click', onClick);
        return button;
    }

    static makeValueLabel(text = '') {
        const span = document.createElement('span');
        span.className = 'editor-controls__value';
        span.textContent = text;
        return span;
    }

    // items: [{ id, label, color, active }] — onToggle(id, isActive)
    static makeLegend(items, onToggle) {
        const legend = document.createElement('div');
        legend.className = 'editor-legend';

        items.forEach(item => {
            const chip = document.createElement('span');
            chip.className = 'editor-legend__chip';
            chip.style.setProperty('--overlay-color', item.color);
            chip.classList.toggle('is-off', item.active === false);

            const swatch = document.createElement('span');
            swatch.className = 'editor-legend__swatch';
            chip.appendChild(swatch);

            const label = document.createElement('span');
            label.textContent = item.label;
            chip.appendChild(label);

            chip.addEventListener('click', () => {
                const nowOff = chip.classList.toggle('is-off');
                onToggle(item.id, !nowOff);
            });

            legend.appendChild(chip);
        });

        return legend;
    }

    static makeBoxOverlay(rect, color, labelText = '') {
        const box = document.createElement('div');
        box.className = 'editor-overlay editor-overlay--box';
        box.style.setProperty('--overlay-color', color);
        box.style.left = `${rect.x}px`;
        box.style.top = `${rect.y}px`;
        box.style.width = `${rect.width}px`;
        box.style.height = `${rect.height}px`;

        if (labelText) {
            const label = document.createElement('span');
            label.className = 'editor-overlay__label';
            label.textContent = labelText;
            box.appendChild(label);
        }

        return box;
    }

    static makeMarkerOverlay(x, y, color, labelText = '', shape = 'anchor') {
        const marker = document.createElement('div');
        marker.className = `editor-overlay editor-overlay--${shape}`;
        marker.style.setProperty('--overlay-color', color);
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;

        if (labelText) {
            const label = document.createElement('span');
            label.className = 'editor-overlay__label';
            label.textContent = labelText;
            marker.appendChild(label);
        }

        return marker;
    }

    static makeRadiusOverlay(centerX, centerY, radius, color, labelText = '') {
        const circle = document.createElement('div');
        circle.className = 'editor-overlay editor-overlay--radius';
        circle.style.setProperty('--overlay-color', color);
        circle.style.left = `${centerX - radius}px`;
        circle.style.top = `${centerY - radius}px`;
        circle.style.width = `${radius * 2}px`;
        circle.style.height = `${radius * 2}px`;

        if (labelText) {
            const label = document.createElement('span');
            label.className = 'editor-overlay__label';
            label.textContent = labelText;
            circle.appendChild(label);
        }

        return circle;
    }
}
