/**
 * MapRenderer — batched DOM writer for map objects.
 *
 * Contract:
 *   - Objects write simulation output into obj.renderState (posX, posY, zIndex,
 *     bgPosition, visible, dirty) during their update() call.
 *   - MapRenderer.flush(objects) is called once per frame AFTER all update() calls
 *     to apply only the dirty entries to the DOM.
 *   - Nothing else should write to element.style inside the update loop.
 *
 * This eliminates scattered DOM writes that previously triggered a browser
 * style-recalculation for every moving object every frame.
 */
class MapRenderer {
    constructor() {
        // Reusable stats for debugging/profiling
        this.stats = {
            flushCount: 0,
            dirtyCount: 0,
            skippedCount: 0
        };
    }

    /**
     * Flush all dirty render states to the DOM.
     * @param {Iterable} objects - the active objects to flush (typically gridSystem.activeObjects)
     */
    flush(objects) {
        let dirty = 0;
        let skipped = 0;
        // dataset.sortY is a devtools inspection aid — skip the attribute writes in production
        const debugMode = document.body.classList.contains('debug');

        for (const obj of objects) {
            if (!obj.renderState || !obj.element) {
                skipped++;
                continue;
            }

            const rs = obj.renderState;

            if (!rs.dirty) {
                skipped++;
                continue;
            }

            // Position
            obj.element.style.left   = `${rs.posX}px`;
            obj.element.style.top    = `${rs.posY}px`;

            // Z-index (Y-sort depth)
            if (rs.zIndex !== undefined) {
                obj.element.style.zIndex = rs.zIndex;
            }

            if (debugMode && rs.sortY !== undefined) {
                EntityMethods.writeSortY(obj.element, rs.sortY);
            }

            // Visibility (culled objects are hidden, not removed)
            if (!rs.visible) {
                obj.element.style.visibility = 'hidden';
            } else if (obj.element.style.visibility === 'hidden') {
                obj.element.style.visibility = '';
            }

            // Animation frame (background-position on the sprite child)
            if (rs.bgPosition !== null && rs.bgPosition !== undefined) {
                const sprite = obj.animation?.sprite || obj._spriteElement || (obj._spriteElement = obj.element.querySelector('.sprite'));
                if (sprite) {
                    sprite.style.backgroundPosition = rs.bgPosition;
                }
                // Don't clear bgPosition — it stays valid until the next frame change
            }

            this.applyShadowState(obj);

            // Mark clean
            rs.dirty = false;
            obj._prevRenderX = rs.posX;
            obj._prevRenderY = rs.posY;

            dirty++;
        }

        this.stats.flushCount++;
        this.stats.dirtyCount  = dirty;
        this.stats.skippedCount = skipped;
    }

    /**
     * Force-flush a single object immediately (for drag, teleport, init).
     * Bypasses the dirty flag.
     */
    flushOne(obj) {
        if (!obj?.element || !obj.renderState) return;
        const rs = obj.renderState;

        obj.element.style.left   = `${rs.posX}px`;
        obj.element.style.top    = `${rs.posY}px`;
        if (rs.zIndex !== undefined) obj.element.style.zIndex = rs.zIndex;
        if (rs.sortY !== undefined && document.body.classList.contains('debug')) {
            EntityMethods.writeSortY(obj.element, rs.sortY);
        }

        if (rs.bgPosition !== null && rs.bgPosition !== undefined) {
            const sprite = obj.animation?.sprite || obj._spriteElement || (obj._spriteElement = obj.element.querySelector('.sprite'));
            if (sprite) sprite.style.backgroundPosition = rs.bgPosition;
        }

        this.applyShadowState(obj);

        rs.dirty = false;
        obj._prevRenderX = rs.posX;
        obj._prevRenderY = rs.posY;
    }

    applyShadowState(obj) {
        const shadowElement = obj?.shadowElement;
        const shadowState = obj?.renderState?.shadow;
        if (!shadowElement || obj._appliedShadowState === shadowState) return;
        obj._appliedShadowState = shadowState;

        if (!shadowState?.visible) {
            shadowElement.style.display = 'none';
            return;
        }

        Object.assign(shadowElement.style, {
            display: '',
            width: `${shadowState.width}px`,
            height: `${shadowState.height}px`,
            left: `${shadowState.left}px`,
            top: `${shadowState.top}px`,
            opacity: `${shadowState.opacity}`,
            transform: `scale(${shadowState.scale})`,
            backgroundColor: shadowState.color,
            filter: `blur(${shadowState.blur}px)`
        });
    }

    getStats() {
        return { ...this.stats };
    }
}
