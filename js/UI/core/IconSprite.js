// ─────────────────────────────────────────────────────────────────────────────
// IconSprite — pulls images/icons/sprite.svg into the document so that every
// <use href="#icon-name"> in the page resolves.
//
// The sprite lives in one file rather than inline in each page, so index.html
// and ui-gallery.html share exactly one set of glyph definitions. Inlining it
// (rather than referencing the file directly from `use`) is what lets CSS
// `fill: currentColor` reach the symbols.
// ─────────────────────────────────────────────────────────────────────────────

class IconSprite {
    static PATH = 'images/icons/sprite.svg';
    static HOST_ID = 'icon-sprite-host';
    static loadPromise = null;

    static load() {
        if (this.loadPromise) return this.loadPromise;
        if (document.getElementById(this.HOST_ID)) {
            this.loadPromise = Promise.resolve(true);
            return this.loadPromise;
        }

        this.loadPromise = fetch(this.PATH)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load icon sprite: ${response.status} ${response.statusText}`);
                }
                return response.text();
            })
            .then(markup => {
                this.inject(markup);
                return true;
            })
            .catch(error => {
                console.error('[IconSprite] Failed to load icon sprite:', error);
                return false;
            });

        return this.loadPromise;
    }

    static inject(markup) {
        const host = document.createElement('div');
        host.id = this.HOST_ID;
        host.hidden = true;
        // The sprite is authored markup, not user content — but parse it as a
        // document rather than assigning innerHTML on a live node so that no
        // scripts inside it could ever execute.
        const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
        const sprite = parsed.querySelector('svg');
        if (!sprite) throw new Error('Icon sprite contains no <svg> root.');

        host.appendChild(document.importNode(sprite, true));
        document.body.prepend(host);
    }
}

IconSprite.load();
