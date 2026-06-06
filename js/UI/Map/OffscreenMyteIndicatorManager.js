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

    isBoundsVisible(bounds, viewportWidth, viewportHeight) {
        return !(
            bounds.right < 0 ||
            bounds.left > viewportWidth ||
            bounds.bottom < 0 ||
            bounds.top > viewportHeight
        );
    }

    getViewportWorldBounds(camera, viewportWidth, viewportHeight) {
        const safeZoom = Number.isFinite(camera?.zoomLevel) && camera.zoomLevel > 0
            ? camera.zoomLevel
            : 1;
        const left = Number.isFinite(camera?.posX) ? -camera.posX : 0;
        const top = Number.isFinite(camera?.posY) ? -camera.posY : 0;
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

    updateMarker(markerData, activeMyte) {
        const marker = this.getMarker(markerData.myte);
        if (!marker) return;

        marker.classList.remove('is-hidden');
        marker.classList.toggle('active-myte', markerData.myte === activeMyte);
        marker.dataset.edge = markerData.edge;
        marker.title = markerData.myte?.name || 'Myte';
        marker.style.left = `${Math.round(markerData.x)}px`;
        marker.style.top = `${Math.round(markerData.y)}px`;
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
        const viewportBounds = this.getViewportWorldBounds(camera, viewportWidth, viewportHeight);
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

            let x = Utility.clamp(projectedCenter.x, this.edgePadding, viewportWidth - this.edgePadding);
            let y = Utility.clamp(projectedCenter.y, this.edgePadding, viewportHeight - this.edgePadding);
            const edge = this.getMarkerEdge(x, y, viewportWidth, viewportHeight);

            visibleMarkerIds.add(String(myte.id));
            markerData.push({ myte, edge, x, y });
        });

        markerData.forEach(marker => this.updateMarker(marker, activeMyte));

        this.markers.forEach((marker, markerId) => {
            if (!visibleMarkerIds.has(markerId)) {
                this.hideMarker(marker);
            }
        });
    }

    dispose() {
        this.markers.forEach(marker => marker.remove());
        this.markers.clear();
        this.overlay?.remove();
        this.overlay = null;
    }
}
