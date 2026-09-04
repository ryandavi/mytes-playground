class BuildKeys {
    static FACES = Object.freeze(['north', 'east', 'south', 'west']);

    static cell(x, y) {
        return `${BuildKeys.integer(x, 'x')},${BuildKeys.integer(y, 'y')}`;
    }

    static block(bx, by) {
        return `${BuildKeys.integer(bx, 'bx')},${BuildKeys.integer(by, 'by')}`;
    }

    static atom(x, y, face, half) {
        return `${BuildKeys.cell(x, y)}/${BuildKeys.face(face)}/${BuildKeys.half(half)}`;
    }

    static parseCell(key) {
        const match = /^(-?\d+),(-?\d+)$/.exec(String(key));
        if (!match) throw new Error(`Invalid build cell key: ${key}`);
        return { x: Number(match[1]), y: Number(match[2]) };
    }

    static parseBlock(key) {
        const { x, y } = BuildKeys.parseCell(key);
        return { bx: x, by: y };
    }

    static parseAtom(key) {
        const match = /^(-?\d+),(-?\d+)\/(north|east|south|west)\/([01])$/.exec(String(key));
        if (!match) throw new Error(`Invalid wall surface atom key: ${key}`);
        return {
            x: Number(match[1]),
            y: Number(match[2]),
            face: match[3],
            half: Number(match[4])
        };
    }

    static blocksOfCell(x, y) {
        x = BuildKeys.integer(x, 'x');
        y = BuildKeys.integer(y, 'y');
        return Object.freeze([
            Object.freeze([2 * x, 2 * y]),
            Object.freeze([(2 * x) + 1, 2 * y]),
            Object.freeze([2 * x, (2 * y) + 1]),
            Object.freeze([(2 * x) + 1, (2 * y) + 1])
        ]);
    }

    static lookBlock(x, y, face, half) {
        x = BuildKeys.integer(x, 'x');
        y = BuildKeys.integer(y, 'y');
        half = BuildKeys.half(half);
        switch (BuildKeys.face(face)) {
            case 'north': return Object.freeze([2 * x + half, (2 * y) - 1]);
            case 'south': return Object.freeze([2 * x + half, (2 * y) + 2]);
            case 'west': return Object.freeze([(2 * x) - 1, 2 * y + half]);
            case 'east': return Object.freeze([(2 * x) + 2, 2 * y + half]);
        }
    }

    static integer(value, label) {
        if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`);
        return value;
    }

    static face(value) {
        if (!BuildKeys.FACES.includes(value)) throw new Error(`Invalid wall face: ${value}`);
        return value;
    }

    static half(value) {
        if (value !== 0 && value !== 1) throw new Error(`Atom half must be 0 or 1: ${value}`);
        return value;
    }
}
