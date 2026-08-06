// ── FloatingLabel ────────────────────────────────────────────────────────
// Shared DOM builder for "floating" labels that ride a moving map element via
// CSS transform (Myte name tags, NPC nameplates) — NOT the hover-tracking
// TooltipSystem, which is viewport-anchored and JS-positioned instead.
// This only dedupes the "build a wrapper div + safe text-node children"
// plumbing; positioning, styling, and show/hide triggers stay owned by each
// caller since those genuinely differ between systems.
class FloatingLabel {
    // lines: [{ text, className, tag = 'span' }]. Entries with no text are skipped
    // so optional lines (e.g. an NPC's role) can be passed through unconditionally.
    static build(wrapperClass, lines) {
        const wrapper = document.createElement('div');
        wrapper.className = wrapperClass;

        for (const line of lines) {
            if (line.text == null || line.text === '') continue;
            const el = document.createElement(line.tag || 'span');
            el.className = line.className;
            el.textContent = line.text;
            wrapper.appendChild(el);
        }

        return wrapper;
    }
}
