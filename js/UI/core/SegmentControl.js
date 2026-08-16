/**
 * SegmentControl — one row of buttons where exactly one is down.
 *
 * The build panels were reaching for radio inputs to express "pick one of
 * these", which in a 300px tool window costs a stacked row and a label per
 * option for a choice that is two words wide. A segment says the same thing on
 * one line, and it is already the shape the wall-view control uses — so this is
 * that control, generalized, rather than a second way of doing it.
 *
 * Markup: a root carrying `.segment-control` whose buttons carry `.segment-btn`
 * and a `data-value`. The DOM is the state; there is no shadow copy to drift.
 */
class SegmentControl {
    constructor(root, options = {}) {
        this.root = root || null;
        this.onChange = options.onChange || null;
        this.handleClick = this.handleClick.bind(this);
        this.root?.addEventListener('click', this.handleClick);
        if (options.value) this.value = options.value;
    }

    get buttons() {
        return [...(this.root?.querySelectorAll('.segment-btn') || [])];
    }

    get value() {
        return this.root?.querySelector('.segment-btn.active')?.dataset.value ?? null;
    }

    set value(next) {
        for (const button of this.buttons) {
            const selected = button.dataset.value === next;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        }
    }

    get values() {
        return this.buttons.map(button => button.dataset.value);
    }

    handleClick(event) {
        const button = event.target.closest('.segment-btn');
        if (!button || !this.root.contains(button)) return;
        event.preventDefault();
        this.select(button.dataset.value);
    }

    select(value) {
        if (value === null || value === undefined) return false;
        if (!this.values.includes(value)) return false;
        this.value = value;
        this.onChange?.(value);
        return true;
    }

    /** Walk the row by `direction`, wrapping — what Home/End bind to. */
    step(direction) {
        const values = this.values;
        if (values.length === 0) return false;
        const current = values.indexOf(this.value);
        const next = ((current < 0 ? 0 : current) + direction + values.length) % values.length;
        return this.select(values[next]);
    }

    setDisabled(flag) {
        for (const button of this.buttons) button.disabled = flag === true;
    }

    dispose() {
        this.root?.removeEventListener('click', this.handleClick);
        this.root = null;
        this.onChange = null;
    }
}
