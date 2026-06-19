class ListRailPanel {
    constructor({ listEl, searchEl, titleEl, countEl, onSelect }) {
        this.listEl = listEl;
        this.searchEl = searchEl;
        this.titleEl = titleEl;
        this.countEl = countEl;
        this.onSelect = onSelect;
        this.records = [];
        this.activeId = null;

        this.searchEl.addEventListener('input', () => this.renderList());
    }

    setDomain(domain, activeId) {
        this.records = domain ? domain.records : [];
        this.activeId = activeId;
        this.titleEl.textContent = domain ? domain.label : 'Records';
        this.searchEl.value = '';
        this.renderList();
    }

    setActive(activeId) {
        this.activeId = activeId;
        this.listEl.querySelectorAll('button').forEach(button => {
            button.classList.toggle('is-active', button.dataset.recordId === activeId);
        });
    }

    renderList() {
        const query = this.searchEl.value.trim().toLowerCase();
        const visible = query
            ? this.records.filter(record =>
                record.id.toLowerCase().includes(query) ||
                record.label.toLowerCase().includes(query))
            : this.records;

        this.countEl.textContent = `${visible.length}/${this.records.length}`;
        this.listEl.innerHTML = '';

        if (visible.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'editor-list__empty';
            empty.textContent = query ? 'No matches.' : 'No records.';
            this.listEl.appendChild(empty);
            return;
        }

        visible.forEach(record => {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.recordId = record.id;
            button.classList.toggle('is-active', record.id === this.activeId);

            const label = document.createElement('span');
            label.textContent = record.label;
            button.appendChild(label);

            if (record.hint) {
                const hint = document.createElement('span');
                hint.className = 'editor-list__hint';
                hint.textContent = record.hint;
                button.appendChild(hint);
            }

            button.addEventListener('click', () => this.onSelect(record.id));
            li.appendChild(button);
            this.listEl.appendChild(li);
        });
    }
}
