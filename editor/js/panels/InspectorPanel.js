// Inspector: renders the effective merged record as a collapsible tree.
// For writable domains the leaves are typed inputs that commit edits live;
// layered records show where each value comes from (base / override), and
// overridden fields offer a reset-to-base control per the inheritance policy
// in docs/EDITOR_PLAN.md.
class InspectorPanel {
    constructor(rootEl, { onEdit = null, onReset = null } = {}) {
        this.rootEl = rootEl;
        this.onEdit = onEdit;
        this.onReset = onReset;
        this.editable = false;
        this.record = null;
    }

    clear(message = 'Select a record.') {
        this.rootEl.innerHTML = '';
        const summary = document.createElement('div');
        summary.className = 'editor-inspector__summary';
        summary.textContent = message;
        this.rootEl.appendChild(summary);
    }

    show(record, { editable = false } = {}) {
        this.record = record;
        this.editable = editable;
        this.rootEl.innerHTML = '';

        const summary = document.createElement('div');
        summary.className = 'editor-inspector__summary';

        const idEl = document.createElement('div');
        idEl.className = 'editor-inspector__id';
        idEl.textContent = record.label !== record.id ? `${record.label} (${record.id})` : record.id;
        summary.appendChild(idEl);

        const description = record.merged?.description;
        if (description) {
            const descEl = document.createElement('div');
            descEl.className = 'editor-inspector__desc';
            descEl.textContent = description;
            summary.appendChild(descEl);
        }

        this.rootEl.appendChild(summary);

        const tree = document.createElement('div');
        tree.className = 'editor-tree';
        this.renderChildren(tree, record.merged, [], record, 0);
        this.rootEl.appendChild(tree);
    }

    renderChildren(parentEl, value, path, record, depth) {
        Object.entries(value).forEach(([key, childValue]) => {
            parentEl.appendChild(this.renderNode(key, childValue, [...path, key], record, depth));
        });
    }

    renderNode(key, value, path, record, depth) {
        if (this.isLeaf(value)) {
            return this.renderField(key, value, path, record);
        }

        const details = document.createElement('details');
        if (depth === 0) details.open = true;

        const summary = document.createElement('summary');
        summary.textContent = key;

        const count = document.createElement('span');
        count.className = 'editor-tree__count';
        count.textContent = Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
        summary.appendChild(count);
        details.appendChild(summary);

        const children = document.createElement('div');
        children.className = 'editor-tree__children';

        if (Array.isArray(value)) {
            value.forEach((entry, index) => {
                const entryKey = this.isLeaf(entry) ? `[${index}]` : (entry?.id ? `${entry.id}` : `[${index}]`);
                children.appendChild(this.renderNode(entryKey, entry, [...path, index], record, depth + 1));
            });
        } else {
            this.renderChildren(children, value, path, record, depth + 1);
            if (this.editable && this.onEdit) {
                children.appendChild(this.buildAddEntryRow(path));
            }
        }

        details.appendChild(children);
        return details;
    }

    renderField(key, value, path, record) {
        const field = document.createElement('div');
        field.className = 'editor-field';

        const keyEl = document.createElement('span');
        keyEl.className = 'editor-field__key';
        keyEl.textContent = `${key}:`;
        field.appendChild(keyEl);

        if (this.editable && this.onEdit) {
            field.appendChild(this.buildInput(value, path, field));
        } else {
            const valueEl = document.createElement('span');
            valueEl.className = `editor-field__value is-${this.typeOf(value)}`;
            valueEl.textContent = this.formatValue(value);
            field.appendChild(valueEl);
        }

        if (record.layered) {
            field.appendChild(this.buildBadge(record, path));
        }

        return field;
    }

    buildInput(value, path, field) {
        if (value === null) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = 'null';
            input.className = 'editor-field__input editor-field__input--json';
            input.placeholder = 'JSON value';
            input.addEventListener('change', () => {
                let parsed;
                try { parsed = JSON.parse(input.value); } catch (e) {
                    input.classList.add('is-invalid');
                    return;
                }
                input.classList.remove('is-invalid');
                this.commit(path, parsed, field, input);
            });
            return input;
        }

        if (typeof value === 'boolean') {
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value;
            input.className = 'editor-field__input editor-field__input--boolean';
            input.addEventListener('change', () => this.commit(path, input.checked, field, input));
            return input;
        }

        if (typeof value === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.step = 'any';
            input.value = value;
            input.className = 'editor-field__input editor-field__input--number';
            input.addEventListener('input', () => {
                const parsed = Number(input.value);
                if (input.value.trim() === '' || !Number.isFinite(parsed)) {
                    input.classList.add('is-invalid');
                    return;
                }
                input.classList.remove('is-invalid');
                this.commit(path, parsed, field, input);
            });
            return input;
        }

        if (Array.isArray(value)) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = JSON.stringify(value);
            input.className = 'editor-field__input editor-field__input--array';
            input.addEventListener('change', () => {
                let parsed;
                try {
                    parsed = JSON.parse(input.value);
                } catch (error) {
                    input.classList.add('is-invalid');
                    return;
                }
                if (!Array.isArray(parsed)) {
                    input.classList.add('is-invalid');
                    return;
                }
                input.classList.remove('is-invalid');
                this.commit(path, parsed, field, input);
            });
            return input;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.value = value;
        input.className = 'editor-field__input editor-field__input--string';
        input.addEventListener('input', () => this.commit(path, input.value, field, input));
        return input;
    }

    commit(path, value, field, input) {
        const result = this.onEdit(path, value);
        if (!result) return;
        this.updateBadge(field, path, result.source);
    }

    buildBadge(record, path) {
        const badge = document.createElement('span');
        const source = this.resolveSource(record, path);
        this.applyBadgeState(badge, path, source);
        return badge;
    }

    updateBadge(field, path, source) {
        const badge = field.querySelector('.editor-badge');
        if (badge && source) {
            this.applyBadgeState(badge, path, source);
        }
    }

    applyBadgeState(badge, path, source) {
        badge.className = 'editor-badge editor-badge--' + source;
        badge.innerHTML = '';

        const text = document.createElement('span');
        text.textContent = source;
        badge.appendChild(text);

        if (source === 'override') {
            const baseValue = EditorDocument.getAtPath(this.record && this.record.base, path);
            if (baseValue !== undefined) {
                const baseEl = document.createElement('span');
                baseEl.className = 'editor-badge__base';
                baseEl.textContent = this.formatValue(baseValue);
                baseEl.title = 'Inherited base value: ' + this.formatValue(baseValue);
                badge.appendChild(baseEl);
            }
            badge.title = "Value set by this record's own definition file";

            if (this.editable && this.onReset) {
                const reset = document.createElement('button');
                reset.type = 'button';
                reset.className = 'editor-badge__reset';
                reset.textContent = '×';
                reset.title = 'Reset to base value (removes the override)';
                reset.addEventListener('click', () => this.onReset(path));
                badge.appendChild(reset);
            }
        } else {
            badge.title = 'Value inherited from the base definition';
        }
    }

    buildAddEntryRow(path) {
        const trigger = document.createElement('div');
        trigger.className = 'editor-field editor-field--add-trigger';
        trigger.textContent = '+ add entry';

        const form = document.createElement('div');
        form.className = 'editor-field editor-field--add-form';
        form.hidden = true;

        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.placeholder = 'key';
        keyInput.className = 'editor-field__input editor-field__input--key';

        const valInput = document.createElement('input');
        valInput.type = 'text';
        valInput.value = 'null';
        valInput.placeholder = 'JSON value';
        valInput.className = 'editor-field__input editor-field__input--json';

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.textContent = 'Add';
        confirmBtn.className = 'editor-field__add-btn';
        confirmBtn.addEventListener('click', () => {
            const key = keyInput.value.trim();
            if (!key) { keyInput.classList.add('is-invalid'); return; }
            let parsed;
            try { parsed = JSON.parse(valInput.value); } catch (e) {
                valInput.classList.add('is-invalid');
                return;
            }
            keyInput.classList.remove('is-invalid');
            valInput.classList.remove('is-invalid');
            this.onEdit([...path, key], parsed);
        });

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '×';
        cancelBtn.className = 'editor-field__add-btn';
        cancelBtn.addEventListener('click', () => {
            form.hidden = true;
            trigger.hidden = false;
        });

        form.appendChild(keyInput);
        form.appendChild(valInput);
        form.appendChild(confirmBtn);
        form.appendChild(cancelBtn);

        trigger.addEventListener('click', () => {
            trigger.hidden = true;
            form.hidden = false;
            keyInput.value = '';
            valInput.value = 'null';
            keyInput.focus();
        });

        const wrapper = document.createElement('div');
        wrapper.appendChild(trigger);
        wrapper.appendChild(form);
        return wrapper;
    }

    // Arrays are leaves when every entry is primitive (frame lists, tag lists);
    // rendering them inline keeps semantically ordered arrays readable.
    isLeaf(value) {
        if (value === null || typeof value !== 'object') return true;
        if (Array.isArray(value)) {
            return value.every(entry => entry === null || typeof entry !== 'object' ||
                (Array.isArray(entry) && entry.every(item => typeof item !== 'object')));
        }
        return false;
    }

    typeOf(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    formatValue(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') return '"' + value + '"';
        if (Array.isArray(value)) {
            const text = JSON.stringify(value);
            return text.length > 120 ? text.slice(0, 117) + '...' : text;
        }
        return String(value);
    }

    // deepMerge gives override precedence at every depth, so a defined override
    // value anywhere along the exact path means the leaf came from the override.
    resolveSource(record, path) {
        let node = record.override;
        for (const key of path) {
            if (node === null || typeof node !== 'object') return 'base';
            node = node[key];
            if (node === undefined) return 'base';
        }
        return 'override';
    }
}
