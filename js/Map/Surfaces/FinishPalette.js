// ─────────────────────────────────────────────────────────────────────────────
// FinishPalette — turning one authored surface into many coloured ones.
//
// A finish that ships art declares the flat tones it is built from. A finish
// with no art of its own names that one as a `template` plus its own colour,
// and gets the template's pixels with those tones substituted. Walls use it for
// swatch columns and floors for tiles; the rule is the same either way, so it
// lives here rather than being written twice with two sets of bugs.
//
// Substitution is by EXACT match, not a hue rotation: this art is flat pixel
// colour, so exact replacement is lossless where a rotation muddies the tones.
// It is the same trick the wall registry uses to find cap pixels.
// ─────────────────────────────────────────────────────────────────────────────
class FinishPalette {
    // Palette slot -> the finish key that overrides it. A slot with no override
    // is carried across as the template's own offset from its body tone, so a
    // grain, speckle or motif keeps its contrast against whatever it lands on.
    static OVERRIDES = Object.freeze({ body: 'color', band: 'baseboard', accent: 'accent' });

    static parse(color) {
        return [1, 3, 5].map(index => parseInt(String(color).substr(index, 2), 16));
    }

    static isColor(value) {
        return typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value);
    }

    /**
     * Template tone -> this finish's tone, one entry per declared slot.
     * @param {object} palette the template's declared tones, keyed by slot
     * @param {object} finish the finish doing the borrowing
     * @param {object} overrides slot -> finish key, defaults to OVERRIDES
     * @returns {Array<{from: number[], to: number[]}>}
     */
    static resolve(palette, finish, overrides = FinishPalette.OVERRIDES) {
        const templateBody = FinishPalette.parse(palette.body);
        const body = FinishPalette.parse(finish.color);
        return Object.entries(palette).map(([slot, color]) => {
            const from = FinishPalette.parse(color);
            const override = finish[overrides[slot]];
            const to = FinishPalette.isColor(override)
                ? FinishPalette.parse(override)
                : from.map((value, index) => Math.max(0, Math.min(255,
                    body[index] + value - templateBody[index])));
            return { from, to };
        });
    }

    /**
     * A recoloured copy of `source`. Transparent pixels are left alone so a
     * surface's authored transparency survives untouched.
     * @returns {HTMLCanvasElement}
     */
    static recolor(source, substitutions) {
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(source, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = image.data;
        for (let index = 0; index < data.length; index += 4) {
            if (data[index + 3] === 0) continue;
            const match = substitutions.find(({ from }) =>
                data[index] === from[0] && data[index + 1] === from[1] && data[index + 2] === from[2]);
            if (!match) continue;
            data[index] = match.to[0];
            data[index + 1] = match.to[1];
            data[index + 2] = match.to[2];
        }
        context.putImageData(image, 0, 0);
        return canvas;
    }

    /**
     * Why a finish cannot borrow from `templateId`, or null if it can. Shared so
     * the registry and the content validator reject the same things.
     * @returns {string|null}
     */
    static describeTemplateProblem(id, finish, finishes) {
        const template = finishes?.[finish.template];
        if (!template || !template.palette?.body) {
            return `templates on "${finish.template}", which needs its own art and a palette with a "body" slot`;
        }
        if (!FinishPalette.isColor(finish.color)) {
            return `templates on "${finish.template}" and must declare a "color"`;
        }
        return null;
    }
}
