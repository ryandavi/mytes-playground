/**
 * HintNotes — one treatment, and one switch, for every explanatory line in a
 * panel.
 *
 * A hint used to be a grey paragraph indistinguishable from body copy nobody
 * had got round to styling, and there was no way to be rid of it once you knew
 * the tool. Now it is a note: an icon in the gutter, an inset box around it, the
 * same shape in every window. Marking it as a note is what earns it the right to
 * be turned off — you can only quiet something the eye can tell apart from the
 * controls.
 *
 * The switch is one preference, not one per window. "I don't need to be told" is
 * something a person is, not something a window is, and a per-window memory
 * would mean going back to the window to get the help back. Every panel that
 * carries hints shows the same toggle in its title bar, so the control is always
 * where the thing it controls is; Settings carries it too, for anyone who turned
 * it off everywhere and wants it back.
 *
 * Two kinds of note are never hidden, because hiding them would take away
 * something other than help:
 *
 *   --persistent   the panel's own prompt; hiding it empties the window
 *   --warning      stakes, not instructions — what you stand to lose
 */
class HintNotes extends UIComponent {
    static SELECTOR = '.setting-hint';
    // The notes the switch actually governs. A panel whose every note is a
    // prompt or a warning has nothing for it to turn off.
    static HIDEABLE_SELECTOR = '.setting-hint:not(.setting-hint--persistent):not(.setting-hint--warning)';
    static PREFERENCE = 'panelHintsEnabled';
    static HIDDEN_CLASS = 'panel-hints-hidden';

    /**
     * A note built the same way the markup ones end up, so a hint created at
     * runtime is not a second design that happens to share a class name.
     */
    static create(text, { variant = null } = {}) {
        const note = document.createElement('p');
        note.className = `setting-hint${variant ? ` setting-hint--${variant}` : ''}`;
        note.textContent = text;
        HintNotes.decorate(note);
        return note;
    }

    /**
     * Give every undecorated note its icon.
     *
     * The icon is a real sprite symbol rather than a pseudo-element glyph, so it
     * is the same ℹ the rest of the interface uses. That means it has to be put
     * there by hand — which is this, once, rather than in eight places in the
     * markup where the ninth would be forgotten.
     */
    static decorate(root = document) {
        const notes = root.matches?.(HintNotes.SELECTOR)
            ? [root]
            : [...root.querySelectorAll(HintNotes.SELECTOR)];

        for (const note of notes) {
            if (note.querySelector(':scope > .setting-hint__icon')) continue;

            // The words move into their own element so the icon can sit beside
            // the whole paragraph rather than being pushed along by the first
            // line of it.
            const text = document.createElement('span');
            text.className = 'setting-hint__text';
            text.append(...note.childNodes);

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('class', 'icon setting-hint__icon');
            icon.setAttribute('aria-hidden', 'true');
            const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
            use.setAttribute('href', note.classList.contains('setting-hint--warning')
                ? '#icon-warning'
                : '#icon-info');
            icon.appendChild(use);

            note.replaceChildren(icon, text);
        }
        return notes.length;
    }

    constructor(parent) {
        super(parent);
        this.toggles = [];
    }

    get user() {
        return this.container?.core?.user || null;
    }

    get enabled() {
        return this.user?.preferences?.[HintNotes.PREFERENCE] !== false;
    }

    init() {
        HintNotes.decorate(document);
        this.addPanelToggles();
        this.apply();
    }

    /**
     * An ℹ in the title bar of every window with something it can stop saying.
     *
     * Not merely every window with a note in it: the Surface panel's note is
     * its empty state, which is never hidden, so the switch sat there over a
     * panel it could not change and read as broken. A control that does nothing
     * teaches people the control does nothing everywhere.
     */
    addPanelToggles() {
        for (const panel of document.querySelectorAll('.window-panel')) {
            if (!panel.querySelector(HintNotes.HIDEABLE_SELECTOR)) continue;
            const controls = panel.querySelector('.window-panel__controls');
            if (!controls || controls.querySelector('.panel-hints-toggle')) continue;

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'panel-hints-toggle';
            button.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#icon-info"></use></svg>';
            // Every one of these buttons drives the same preference, so they all
            // have to say so — otherwise turning hints off here and finding them
            // gone there reads as a bug rather than as the setting it is.
            button.title = 'Show hints in every panel';
            button.setAttribute('aria-label', 'Show hints in every panel');
            controls.prepend(button);
            this.bindClick(button, () => this.setEnabled(!this.enabled));
            this.toggles.push(button);
        }
    }

    setEnabled(enabled) {
        this.user?.setPreference?.(HintNotes.PREFERENCE, enabled === true);
        this.apply();
        this.parent?.settingsPanel?.syncHintPreference?.();
    }

    apply() {
        const enabled = this.enabled;
        document.body.classList.toggle(HintNotes.HIDDEN_CLASS, !enabled);
        for (const button of this.toggles) {
            button.classList.toggle('active', enabled);
            button.setAttribute('aria-pressed', String(enabled));
        }
    }

    dispose() {
        super.dispose?.();
        this.toggles = [];
    }
}
