class WallHitTest {
    static hit(piece, x, y, tolerance = 2) {
        if (!piece || piece.element?.hidden || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        const regions = piece.hitRegions || [];
        for (let index = regions.length - 1; index >= 0; index--) {
            const region = regions[index];
            if (!WallHitTest.contains(region, x, y, tolerance)) continue;
            if ((region.holes || []).some(hole => WallHitTest.contains(hole, x, y, 0))) continue;
            return region;
        }
        return null;
    }

    static contains(rect, x, y, tolerance = 0) {
        return x >= rect.left - tolerance && x < rect.right + tolerance &&
            y >= rect.top - tolerance && y < rect.bottom + tolerance;
    }
}
