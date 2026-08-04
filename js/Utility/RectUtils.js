const RectUtils = {
    getEntityBoundsAt(entity, x = 0, y = 0, options = {}) {
        const useCollider = options.useCollider !== false && !!entity?.collider;
        const collider = entity?.collider || {};
        const rect = options.rect || entity?.getOffsetRect?.() || entity?.getRect?.() || entity?.size || {
            width: 0,
            height: 0
        };

        const offsetX = useCollider ? (collider.offsetX ?? 0) : 0;
        const offsetY = useCollider ? (collider.offsetY ?? 0) : 0;
        const width = useCollider ? (collider.width ?? rect.width ?? 0) : (rect.width ?? entity?.size?.width ?? 0);
        const height = useCollider ? (collider.height ?? rect.height ?? 0) : (rect.height ?? entity?.size?.height ?? 0);

        return {
            left: x + offsetX,
            top: y + offsetY,
            right: x + offsetX + width,
            bottom: y + offsetY + height,
            width,
            height,
            offsetX,
            offsetY
        };
    },

    clampEntityPosition(entity, x = 0, y = 0, worldBounds, options = {}) {
        const entityBounds = this.getEntityBoundsAt(entity, x, y, options);

        return {
            x: Math.max(
                worldBounds.left - entityBounds.offsetX,
                Math.min(x, worldBounds.right - entityBounds.offsetX - entityBounds.width)
            ),
            y: Math.max(
                worldBounds.top - entityBounds.offsetY,
                Math.min(y, worldBounds.bottom - entityBounds.offsetY - entityBounds.height)
            )
        };
    },

    getEntityColliderBounds(entity, x = entity?.posX ?? 0, y = entity?.posY ?? 0) {
        const offsetX = entity?.collider?.offsetX ?? 0;
        const offsetY = entity?.collider?.offsetY ?? 0;
        const width = entity?.collider?.width ?? entity?.size?.width ?? 0;
        const height = entity?.collider?.height ?? entity?.size?.height ?? 0;
        return {
            left: x + offsetX,
            top: y + offsetY,
            right: x + offsetX + width,
            bottom: y + offsetY + height,
            width,
            height,
            offsetX,
            offsetY
        };
    },

    getRectIntersection(r1, r2) {
        const l1 = r1.left ?? r1.x ?? 0, t1 = r1.top ?? r1.y ?? 0;
        const r1r = r1.right ?? (l1 + (r1.width ?? 0)), b1 = r1.bottom ?? (t1 + (r1.height ?? 0));
        const l2 = r2.left ?? r2.x ?? 0, t2 = r2.top ?? r2.y ?? 0;
        const r2r = r2.right ?? (l2 + (r2.width ?? 0)), b2 = r2.bottom ?? (t2 + (r2.height ?? 0));
        const left = Math.max(l1, l2), top = Math.max(t1, t2);
        const right = Math.min(r1r, r2r), bottom = Math.min(b1, b2);
        if (left >= right || top >= bottom) return null;
        return { left, top, right, bottom, width: right - left, height: bottom - top };
    },

    getIntersectionRatio(innerRect, outerRect) {
        const ix = this.getRectIntersection(innerRect, outerRect);
        if (!ix) return 0;
        const w = innerRect.width ?? (innerRect.right - innerRect.left);
        const h = innerRect.height ?? (innerRect.bottom - innerRect.top);
        return (w > 0 && h > 0) ? (ix.width * ix.height) / (w * h) : 0;
    },

    boundsOverlap(b1, b2) {
        return this.getRectIntersection(b1, b2) !== null;
    },

    getRectGap(a, b) {
        const dx = Math.max(b.left - a.right, a.left - b.right, 0);
        const dy = Math.max(b.top - a.bottom, a.top - b.bottom, 0);
        return Math.hypot(dx, dy);
    },

    checkBoxCollision(entityA, entityB, options = {}) {
        const boundsA = this.getEntityColliderBounds(entityA);
        const boundsB = this.getEntityColliderBounds(entityB);

        const isColliding = !(
            boundsA.right < boundsB.left ||
            boundsA.left > boundsB.right ||
            boundsA.bottom < boundsB.top ||
            boundsA.top > boundsB.bottom
        );

        if (isColliding && entityB.config?.oneWayPlatform) {
            const isAbove = entityA.posY + entityA.size.height <= entityB.posY + 5;
            const isMovingDown = entityA.velocity > 0;
            return isAbove && isMovingDown;
        }

        return isColliding;
    }
};
