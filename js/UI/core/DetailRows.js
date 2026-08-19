// ─────────────────────────────────────────────────────────────────────────────
// DetailRows — the label/value list that shows up wherever a panel has to state
// a handful of facts: the world map's map details, the keyboard legends in
// Options, the calendar's day summary.
//
// Every one of those had its own markup and its own label-column width, so
// "Points of interest" and "Distance" started their values in different places
// and three legends under three headings each sized their key column
// separately. One `<dl>` with a shared column definition fixes both: within a
// list, every label shares the widest label's width.
//
// Two column strategies, because there are two situations:
//
//   default   the list sizes its own label column to its longest label. Right
//             for a list standing on its own.
//   subgrid   the list borrows its parent's columns, so several lists side by
//             side or stacked under separate headings still line up with each
//             other. Right for the legends inside a settings group.
// ─────────────────────────────────────────────────────────────────────────────

class DetailRows {
    /**
     * @param {Array} rows  `[label, value]` pairs, or `{ label, value, modifier }`
     *                      objects. A row with a null/undefined value is skipped,
     *                      so callers can list optional facts inline.
     * @param {Object} options
     * @param {boolean} options.subgrid  borrow the parent grid's columns.
     * @param {string} options.className extra classes for the list element.
     */
    static build(rows = [], options = {}) {
        const list = document.createElement('dl');
        list.className = ['detail-rows', options.subgrid ? 'detail-rows--subgrid' : '', options.className ?? '']
            .filter(Boolean).join(' ');

        for (const row of rows) {
            const { label, value, modifier } = Array.isArray(row)
                ? { label: row[0], value: row[1] }
                : row ?? {};
            if (value == null) continue;

            const term = document.createElement('dt');
            term.className = 'detail-row__label';
            term.textContent = label ?? '';

            const detail = document.createElement('dd');
            detail.className = ['detail-row__value', modifier].filter(Boolean).join(' ');
            // A value may be pre-built markup (a chip, a list of nodes) or plain
            // text; text goes in as text so save data can never become markup.
            if (value instanceof Node) detail.appendChild(value);
            else detail.textContent = String(value);

            list.append(term, detail);
        }

        return list;
    }

    /** Build and hand back as the sole content of `container`. */
    static render(container, rows = [], options = {}) {
        if (!container) return null;
        const list = this.build(rows, options);
        container.replaceChildren(list);
        return list;
    }
}
