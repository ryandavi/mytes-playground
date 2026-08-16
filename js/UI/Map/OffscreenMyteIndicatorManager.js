class OffscreenMyteIndicatorManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.overlay = null;
        this.markers = new Map();
        this.edgePadding = 14;
        this.preferredGap = 18;
        this._elapsed = 0;
    }

    init() {
        const containerElement = this.parent.parent?.element;
        if (!containerElement) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'myte-offscreen-indicators';
        this.overlay.setAttribute('aria-hidden', 'true');
        containerElement.appendChild(this.overlay);

        this.boundMarkerClick = (event) => this.handleMarkerClick(event);
        this.overlay.addEventListener('click', this.boundMarkerClick);
    }

    getMarker(myte) {
        const markerId = String(myte?.id ?? '');
        if (!markerId || !this.overlay) return null;

        if (!this.markers.has(markerId)) {
            const marker = document.createElement('div');
            marker.className = 'myte-offscreen-indicator is-hidden';
            marker.dataset.myteId = markerId;
            this.overlay.appendChild(marker);
            this.markers.set(markerId, marker);
        }

        return this.markers.get(markerId);
    }

    hideMarker(marker) {
        if (!marker) return;
        marker.classList.add('is-hidden');
    }

    hideAllMarkers() {
        this.markers.forEach(marker => this.hideMarker(marker));
    }

    /**
     * The slice of the world the player can currently see, in world coordinates.
     *
     * The render offset matters: walls reserve a strip above the map for their
     * height, and every other world↔screen conversion subtracts it. This read it
     * off `this.parent` — the UserInterface, which has no `gameMap` — so it was
     * silently zero, and the whole visible band was wrong by the wall overhang.
     * That is why a myte you could plainly see got a marker and one off the
     * bottom edge did not. The container is the thing that owns the offset, and
     * it is the same object the caller already has in hand.
     */
    getViewportWorldBounds(container, camera, viewportWidth, viewportHeight) {
        const safeZoom = Number.isFinite(camera?.zoomLevel) && camera.zoomLevel > 0
            ? camera.zoomLevel
            : 1;
        const renderOffset = container?.getRenderOffset?.() || { x: 0, y: 0 };
        const left = (Number.isFinite(camera?.posX) ? -camera.posX : 0) - renderOffset.x;
        const top = (Number.isFinite(camera?.posY) ? -camera.posY : 0) - renderOffset.y;
        const width = viewportWidth / safeZoom;
        const height = viewportHeight / safeZoom;

        return {
            left,
            top,
            right: left + width,
            bottom: top + height,
            width,
            height
        };
    }

    projectWorldPointToViewport(point, viewportBounds, viewportWidth, viewportHeight) {
        const normalizedX = viewportBounds.width > 0
            ? (point.x - viewportBounds.left) / viewportBounds.width
            : 0.5;
        const normalizedY = viewportBounds.height > 0
            ? (point.y - viewportBounds.top) / viewportBounds.height
            : 0.5;

        return {
            x: normalizedX * viewportWidth,
            y: normalizedY * viewportHeight
        };
    }

    isPointInsideViewport(point, viewportBounds) {
        return (
            point.x >= viewportBounds.left &&
            point.x <= viewportBounds.right &&
            point.y >= viewportBounds.top &&
            point.y <= viewportBounds.bottom
        );
    }

    getMarkerEdge(x, y, viewportWidth, viewportHeight) {
        const touchesTop = y <= this.edgePadding;
        const touchesBottom = y >= viewportHeight - this.edgePadding;
        const touchesLeft = x <= this.edgePadding;
        const touchesRight = x >= viewportWidth - this.edgePadding;

        if (touchesTop && touchesLeft) return 'top-left';
        if (touchesTop && touchesRight) return 'top-right';
        if (touchesBottom && touchesLeft) return 'bottom-left';
        if (touchesBottom && touchesRight) return 'bottom-right';
        if (touchesTop) return 'top';
        if (touchesBottom) return 'bottom';
        if (touchesLeft) return 'left';
        if (touchesRight) return 'right';
        return 'inside';
    }

    resolveEdgeOverlap(markers, axis, min, max) {
        if (!Array.isArray(markers) || markers.length <= 1) return;

        markers.sort((a, b) => a[axis] - b[axis]);

        const availableSpace = Math.max(0, max - min);
        const gap = Math.max(
            0,
            Math.min(
                this.preferredGap,
                markers.length > 1 ? availableSpace / (markers.length - 1) : this.preferredGap
            )
        );

        let nextPosition = min;
        markers.forEach(marker => {
            marker[axis] = Math.max(marker[axis], nextPosition);
            nextPosition = marker[axis] + gap;
        });

        markers[markers.length - 1][axis] = Math.min(markers[markers.length - 1][axis], max);

        for (let i = markers.length - 2; i >= 0; i -= 1) {
            markers[i][axis] = Math.min(markers[i][axis], markers[i + 1][axis] - gap);
        }

        for (let i = 0; i < markers.length; i += 1) {
            markers[i][axis] = Utility.clamp(markers[i][axis], min, max);
        }

        for (let i = 1; i < markers.length; i += 1) {
            markers[i][axis] = Math.max(markers[i][axis], markers[i - 1][axis] + gap);
            markers[i][axis] = Utility.clamp(markers[i][axis], min, max);
        }
    }

    /**
     * The box markers are allowed to sit in, and where it starts relative to the
     * stage. CSS owns the inset — see `.myte-offscreen-indicators` — because the
     * thing it has to clear is the chips, which CSS also places.
     */
    getMarkerBand(viewport) {
        const rect = this.overlay?.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) {
            return { offsetX: 0, offsetY: 0, width: viewport.width, height: viewport.height };
        }
        return {
            offsetX: rect.left - viewport.left,
            offsetY: rect.top - viewport.top,
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * How far outside the view a point is, as 0–1 against a full viewport's
     * worth of distance. A dot right past the edge and one three screens away
     * were identical before, which is half of "a general idea of where it is".
     */
    distanceOutside(point, viewportBounds) {
        const dx = Math.max(viewportBounds.left - point.x, point.x - viewportBounds.right, 0);
        const dy = Math.max(viewportBounds.top - point.y, point.y - viewportBounds.bottom, 0);
        const reference = Math.max(1, Math.hypot(viewportBounds.width, viewportBounds.height));
        return Utility.clamp(Math.hypot(dx, dy) / reference, 0, 1);
    }

    updateMarker(markerData, activeMyte) {
        const marker = this.getMarker(markerData.myte);
        if (!marker) return;

        marker.classList.remove('is-hidden');
        marker.classList.toggle('active-myte', markerData.myte === activeMyte);
        marker.dataset.edge = markerData.edge;
        marker.dataset.myteId = String(markerData.myte?.id ?? '');
        marker.title = `${markerData.myte?.name || 'Myte'} — click to look`;
        marker.style.left = `${Math.round(markerData.x)}px`;
        marker.style.top = `${Math.round(markerData.y)}px`;
        // Near dots are full size and opaque, far ones shrink and fade. Read as
        // custom properties so the whole treatment stays in CSS.
        marker.style.setProperty('--marker-distance', markerData.distance.toFixed(3));
    }

    /**
     * Clicking a marker looks at the myte it stands for. The dot already knows
     * which myte and roughly where — following it is the obvious next thing to
     * want, and it saves hunting the roster for a name you cannot see.
     */
    handleMarkerClick(event) {
        const markerId = event.target?.closest?.('.myte-offscreen-indicator')?.dataset?.myteId;
        if (!markerId) return;

        event.preventDefault();
        event.stopPropagation();

        const myte = (this.parent.getMytes() || []).find(m => String(m.id) === markerId);
        if (!myte) return;

        this.parent.parent?.camera?.centerToPosition?.(myte.posX, myte.posY, myte.size, false);
        this.parent.setSelected?.(myte);
    }

    update() {
        if (!this.overlay) return;
        if (++this._elapsed % 4 !== 0) return; // throttle to ~15fps

        const container = this.parent.parent;
        const viewport = container?.getContainerRect?.();
        const camera = container?.camera;

        if (!camera || !viewport?.width || !viewport?.height) {
            this.hideAllMarkers();
            return;
        }

        const viewportWidth = viewport.width;
        const viewportHeight = viewport.height;
        const viewportBounds = this.getViewportWorldBounds(container, camera, viewportWidth, viewportHeight);
        // The overlay is inset from the stage so the dots clear the chips. Its
        // box is where markers may sit; the projection below is still in stage
        // coordinates, so the offset converts between the two.
        const band = this.getMarkerBand(viewport);
        const activeMyte = this.parent.getActiveMyte();
        const markerData = [];
        const visibleMarkerIds = new Set();

        (this.parent.getMytes() || []).forEach(myte => {
            const marker = this.getMarker(myte);

            if (!myte?.isActive) {
                this.hideMarker(marker);
                return;
            }

            const worldCenter = {
                x: (Number.isFinite(myte.posX) ? myte.posX : 0) + ((myte.size?.width || 0) / 2),
                y: (Number.isFinite(myte.posY) ? myte.posY : 0) + ((myte.size?.height || 0) / 2)
            };

            if (this.isPointInsideViewport(worldCenter, viewportBounds)) {
                this.hideMarker(marker);
                return;
            }

            const projectedCenter = this.projectWorldPointToViewport(
                worldCenter,
                viewportBounds,
                viewportWidth,
                viewportHeight
            );

            let x = Utility.clamp(
                projectedCenter.x - band.offsetX,
                this.edgePadding,
                Math.max(this.edgePadding, band.width - this.edgePadding)
            );
            let y = Utility.clamp(
                projectedCenter.y - band.offsetY,
                this.edgePadding,
                Math.max(this.edgePadding, band.height - this.edgePadding)
            );
            const edge = this.getMarkerEdge(x, y, band.width, band.height);

            visibleMarkerIds.add(String(myte.id));
            markerData.push({
                myte,
                edge,
                x,
                y,
                distance: this.distanceOutside(worldCenter, viewportBounds)
            });
        });

        markerData.forEach(marker => this.updateMarker(marker, activeMyte));

        this.markers.forEach((marker, markerId) => {
            if (!visibleMarkerIds.has(markerId)) {
                this.hideMarker(marker);
            }
        });
    }

    dispose() {
        if (this.overlay && this.boundMarkerClick) {
            this.overlay.removeEventListener('click', this.boundMarkerClick);
        }
        this.boundMarkerClick = null;
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.overlay?.remove();
        this.overlay = null;
    }
}
