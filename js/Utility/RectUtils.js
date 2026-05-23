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

    getColliderBounds(entity) {
        return this.getEntityColliderBounds(entity);
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
