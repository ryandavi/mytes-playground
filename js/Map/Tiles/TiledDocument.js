// ─────────────────────────────────────────────────────────────────────────────
// TiledDocument — reading, patching and writing back a .tmx, minus any opinion
// about what is being written.
//
// The rule every exporter built on this follows: **patch, never regenerate**.
// The document is parsed, the elements that system owns are replaced, and every
// other layer, object, property and attribute is handed back untouched.
// Regenerating a .tmx from what the runtime happens to model would silently
// discard every hand-authored layer on the first export.
//
// Tiled remains the authoring tool, so the output has to be a file Tiled is
// happy to open and a diff a human is happy to read: the same one-space-per-
// depth indentation, the same XML declaration, alphabetical properties, and ids
// consumed from the map's own counters rather than invented.
// ─────────────────────────────────────────────────────────────────────────────
class TiledDocument {
    /**
     * Whether writing map files is possible at all. The save endpoint is a local
     * editor API by design, so anywhere it could not answer, the controls that
     * use it are dead rather than misleading.
     */
    static get canSave() {
        return ['localhost', '127.0.0.1', '::1', ''].includes(window.location.hostname);
    }

    /** Reads the map file as text, bypassing the browser's copy. */
    static async fetchSource(path) {
        // Cache-bust: the browser may hold the copy it loaded the map from, and
        // patching a stale document would revert whatever Tiled wrote since.
        const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
    }

    static async hash(text) {
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Writes the patched document. `baseHash` is the hash of what was read, so
     * the API can refuse a write over somebody else's newer version rather than
     * clobbering it.
     */
    static async save({ mapId, xml, baseHash, force = false }) {
        try {
            const response = await fetch('editor/api/save-map.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ map: mapId, xml, baseHash, force })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || payload?.ok !== true) {
                return {
                    ok: false,
                    code: payload?.error?.code || 'save_failed',
                    message: payload?.error?.message || `The map API answered HTTP ${response.status}.`
                };
            }
            return { ok: true, backup: payload.backup };
        } catch (error) {
            return { ok: false, code: 'unreachable', message: `Could not reach the map API: ${error.message}` };
        }
    }

    static parse(xmlText) {
        const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
        if (doc.querySelector('parsererror')) return null;
        return doc.querySelector('map') ? doc : null;
    }

    /** Consumes one id from the map's `nextlayerid`/`nextobjectid` counter. */
    static takeNextId(mapEl, attribute) {
        const next = Number(mapEl.getAttribute(attribute)) || 1;
        mapEl.setAttribute(attribute, String(next + 1));
        return next;
    }

    /** An element's Tiled properties as a plain `{ name: value }` map. */
    static readProperties(element) {
        const properties = {};
        for (const property of element?.querySelectorAll(':scope > properties > property') || []) {
            properties[property.getAttribute('name')] = property.getAttribute('value');
        }
        return properties;
    }

    /**
     * Sets properties on an element, creating the `<properties>` block if it has
     * none. Tiled writes properties alphabetically; matching that keeps the diff
     * to what actually changed instead of a whole reordered block.
     */
    static writeProperties(doc, element, values, { keepExisting = true } = {}) {
        const existing = element.querySelector(':scope > properties');
        const carried = new Map();

        if (keepExisting) {
            for (const property of existing?.querySelectorAll(':scope > property') || []) {
                carried.set(property.getAttribute('name'), property.cloneNode(true));
            }
        }
        for (const [name, spec] of Object.entries(values)) {
            const value = spec?.value ?? spec;
            if (value === undefined || value === null) continue;
            const property = doc.createElement('property');
            property.setAttribute('name', name);
            if (spec?.type) property.setAttribute('type', spec.type);
            property.setAttribute('value', String(value));
            carried.set(name, property);
        }

        const properties = doc.createElement('properties');
        for (const name of [...carried.keys()].sort()) properties.appendChild(carried.get(name));
        existing?.remove();
        if (properties.children.length > 0) element.insertBefore(properties, element.firstChild);
        return properties;
    }

    /**
     * A tile layer's CSV body. `tiles` is `{ index|x,y -> gid }`; Tiled writes
     * one row per line with a leading and trailing newline.
     */
    static toCsv(gidsByIndex, width, height) {
        const data = new Array(width * height).fill(0);
        for (const [index, gid] of gidsByIndex) {
            if (index < 0 || index >= data.length) continue;
            data[index] = gid;
        }
        const rows = [];
        for (let y = 0; y < height; y++) {
            rows.push(data.slice(y * width, (y + 1) * width).join(','));
        }
        return `\n${rows.join(',\n')}\n`;
    }

    /**
     * Tiled writes one-space-per-depth indentation and an XML declaration.
     * XMLSerializer emits neither, so the result is re-indented to match —
     * otherwise every export shows up in git as the whole file rewritten.
     */
    static serialize(doc) {
        const body = new XMLSerializer().serializeToString(doc.documentElement);
        return `<?xml version="1.0" encoding="UTF-8"?>\n${TiledDocument.reindent(body)}\n`;
    }

    static reindent(xml) {
        // Any text node carrying a line break is content, not formatting, and is
        // lifted out and put back verbatim. Two kinds live in a .tmx and both
        // break if touched: CSV layer data, which Tiled writes hard against the
        // left margin, and multi-line property values — indenting the treasure
        // chest's item list silently rewrites what is in the chest.
        const blocks = [];
        const masked = xml.replace(/>([^<]*\n[^<]*)(?=<)/g, (match, body) => {
            // Whitespace-only runs are the document's existing formatting, which
            // is exactly what is being reflowed — preserving those would leave
            // the file half indented by Tiled and half by this.
            if (body.trim() === '') return '>';
            blocks.push(body);
            return `>%%NEKO_TEXT_${blocks.length - 1}%%`;
        });

        const lines = [];
        let depth = 0;
        for (const token of masked.replace(/>\s*</g, '>\n<').split('\n')) {
            const line = token.trim();
            if (!line) continue;
            if (line.startsWith('</')) depth = Math.max(0, depth - 1);
            lines.push(' '.repeat(depth) + line);
            const closesItself = line.endsWith('/>') || /^<[^>]+>[\s\S]*<\/[^>]+>$/.test(line);
            if (line.startsWith('<') && !line.startsWith('</') && !closesItself) depth++;
        }

        return lines.join('\n').replace(/%%NEKO_TEXT_(\d+)%%/g, (match, index) => blocks[Number(index)]);
    }
}
