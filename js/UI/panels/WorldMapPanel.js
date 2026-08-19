// ─────────────────────────────────────────────────────────────────────────────
// WorldMapPanel — the world as WorldGraph knows it: every map as a node placed
// on the layout grid from its own .tmx worldX/worldY, every portal link as a
// connector, and hop distance from wherever the player currently is.
//
// A map that names a parentMap is drawn inside its parent rather than beside
// it, on a grid of its own — so a house reads as standing in its yard. Nesting
// only moves where a node is drawn: it is still one node, still tied to the
// same portal lines, and the nested grids are deliberately left unpositioned so
// every node keeps measuring its offset against the one chart the connectors
// are drawn on.
//
// Travel means two different things depending on what is out. With no myte
// deployed the camera simply goes there. With one out, moving between maps is
// the myte's job, so Travel plots the walk instead: it heads for the portal on
// the way, steps through, and carries on until it arrives.
// ─────────────────────────────────────────────────────────────────────────────

class WorldMapPanel extends ModalWindow {
    constructor(parent) {
        super(parent, {
            id: 'world-map-panel',
            // The stage chip is this window's trigger, so ModalWindow owns both
            // the click and the pressed look the chip wears while it is open.
            buttonId: 'world-map-chip',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            // A world of any size deserves the whole window when you want it —
            // the chart grows into whatever room it is given.
            fullscreen: true,
            closeButtonSelector: '.modal-close-btn',
            // Maximizing resizes every cell, so both the measured links and the
            // centring have to be redone for the new size.
            onMaximize: () => {
                this.layoutConnectors();
                this.centerOnCurrentMap();
            }
        });

        this.selectedMapId = null;
        this.nodeElements = new Map();
        this.gridElement = null;
        this.linksElement = null;
        this.resizeObserver = null;
        this.panHandler = null;
        this.panFrom = null;
        this.init();
    }

    // ModalWindow owns `this.container`, so the game container needs its own name.
    get gameContainer() {
        return this.parent.parent;
    }

    get currentMapId() {
        return this.gameContainer.gameMap?.id ?? null;
    }

    open() {
        this.render();
        // Before the window is shown, not after: a panel that is not `is-visible`
        // yet is still laid out and measurable, so the chart can be scrolled into
        // place without the player watching it slide there.
        this.centerOnCurrentMap();
        super.open();
    }

    // Open looking at where you are. Scroll offsets clamp themselves, so a chart
    // that already fits is left exactly as the grid centred it — centring can
    // never push an outlying map out of view in a small world.
    centerOnCurrentMap() {
        const canvas = this.getCanvas();
        const node = this.nodeElements.get(this.currentMapId);
        if (!canvas || !node) return;

        canvas.scrollLeft = node.offsetLeft + (node.offsetWidth / 2) - (canvas.clientWidth / 2);
        canvas.scrollTop = node.offsetTop + (node.offsetHeight / 2) - (canvas.clientHeight / 2);
    }

    getCanvas() {
        return this.modalElement?.querySelector('.world-map__canvas') ?? null;
    }

    render() {
        const canvas = this.modalElement?.querySelector('.world-map__canvas');
        const detail = this.modalElement?.querySelector('.world-map__detail');
        if (!canvas || !detail) return;

        const maps = WorldGraph.getMaps();
        if (maps.length === 0) {
            canvas.replaceChildren(this.buildEmptyState('No maps are charted yet.'));
            detail.replaceChildren();
            return;
        }

        if (!this.selectedMapId || !WorldGraph.getMap(this.selectedMapId)) {
            this.selectedMapId = this.currentMapId ?? maps[0].id;
        }

        this.renderGrid(canvas);
        this.renderDetail(detail);
    }

    // Compact for a one-line aside inside the detail box; full size for the
    // chart, where the message is holding the whole window open.
    buildEmptyState(message, { compact = false } = {}) {
        const empty = document.createElement('div');
        empty.className = compact
            ? 'window-empty-state window-empty-state--compact'
            : 'window-empty-state';
        empty.textContent = message;
        return empty;
    }

    // Layout coords are small integers, so the grid is sized from their extent
    // rather than hard-coded — giving a map worldX/worldY is enough to chart it.
    // Only ever asked about one layout space: the roots, or one parent's
    // children, never a mix of the two.
    getLayoutExtent(maps) {
        const xs = maps.map(map => Number(map.layout?.x) || 0);
        const ys = maps.map(map => Number(map.layout?.y) || 0);
        return {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            columns: Math.max(...xs) - Math.min(...xs) + 1,
            rows: Math.max(...ys) - Math.min(...ys) + 1
        };
    }

    // The chart is its own element inside the canvas: the canvas is the window
    // onto it, the chart is as big as the world needs. That way a world too big
    // for the panel scrolls instead of squeezing its maps into slivers, and the
    // connector SVG still spans exactly the charted area.
    renderGrid(canvas) {
        // Selecting a map re-renders the chart; where the player had panned to is
        // not part of what changed, so it survives the rebuild.
        const scrolledTo = { x: canvas.scrollLeft, y: canvas.scrollTop };
        const roots = WorldGraph.getChildren(null);
        const extent = this.getLayoutExtent(roots);
        const grid = document.createElement('div');
        grid.className = 'world-map__grid';
        grid.style.setProperty('--world-map-columns', extent.columns);
        grid.style.setProperty('--world-map-rows', extent.rows);
        this.linksElement = this.buildConnectors();
        grid.appendChild(this.linksElement);

        this.nodeElements.clear();
        roots.forEach(map => grid.appendChild(this.buildCell(map, extent)));

        canvas.replaceChildren(grid);
        canvas.scrollTo(scrolledTo.x, scrolledTo.y);
        this.gridElement = grid;
        // Cells resize with the window; the lines between them are measured, so
        // they have to be re-measured whenever that happens.
        this.observeGrid(grid);
        this.layoutConnectors();
        this.enablePanning(canvas);
    }

    // A chart bigger than its window is dragged around, the same gesture as
    // panning the world itself. DragHandler is the shared pointer-drag primitive
    // — mouse and touch, thresholds, cleanup — so this only has to say what a
    // drag means here: move the view the opposite way to the hand.
    enablePanning(canvas) {
        if (this.panHandler) return;

        this.panHandler = new DragHandler({
            element: canvas,
            canDrag: () => this.canPan(),
            onDragStart: () => {
                this.panFrom = {
                    scrollX: canvas.scrollLeft,
                    scrollY: canvas.scrollTop,
                    pointerX: this.panHandler.initialTouchPos.x + window.scrollX,
                    pointerY: this.panHandler.initialTouchPos.y + window.scrollY,
                    moved: false
                };
                canvas.classList.add('is-panning');
            },
            onDragUpdate: ({ x, y }) => {
                if (!this.panFrom) return;

                const dx = x - this.panFrom.pointerX;
                const dy = y - this.panFrom.pointerY;
                if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.panFrom.moved = true;

                canvas.scrollLeft = this.panFrom.scrollX - dx;
                canvas.scrollTop = this.panFrom.scrollY - dy;
            },
            onDragEnd: () => {
                canvas.classList.remove('is-panning');
                // Letting go over a map node would otherwise read as picking it.
                if (this.panFrom?.moved) this.swallowNextClick(canvas);
                this.panFrom = null;
            }
        });
    }

    canPan() {
        const canvas = this.getCanvas();
        if (!canvas) return false;
        return canvas.scrollWidth > canvas.clientWidth + 1 ||
            canvas.scrollHeight > canvas.clientHeight + 1;
    }

    swallowNextClick(canvas) {
        const swallow = event => {
            event.stopPropagation();
            event.preventDefault();
        };
        canvas.addEventListener('click', swallow, { capture: true, once: true });
        // Nothing to swallow if the drag ended on empty ground.
        setTimeout(() => canvas.removeEventListener('click', swallow, { capture: true }), 0);
    }

    // One SVG behind the nodes, one line per link. The endpoints are filled in
    // by layoutConnectors from where the nodes really are — grid-cell units
    // cannot do it, because the gap between cells is a fixed size while the
    // cells themselves stretch, so the two only agree at one window size.
    buildConnectors() {
        const svg = document.createElementNS(Utility.SVG_NAMESPACE, 'svg');
        svg.setAttribute('class', 'world-map__links');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');

        const drawn = new Set();
        WorldGraph.getConnections().forEach(connection => {
            const key = [connection.from, connection.to].sort().join('|');
            if (connection.bidirectional && drawn.has(key)) return;
            drawn.add(key);

            const line = document.createElementNS(Utility.SVG_NAMESPACE, 'line');
            line.dataset.from = connection.from;
            line.dataset.to = connection.to;
            line.setAttribute('class', connection.bidirectional ? 'world-map__link' : 'world-map__link is-one-way');
            svg.appendChild(line);
        });

        return svg;
    }

    observeGrid(grid) {
        if (!this.resizeObserver) {
            this.resizeObserver = new ResizeObserver(() => this.layoutConnectors());
        }

        this.resizeObserver.disconnect();
        this.resizeObserver.observe(grid);
    }

    // Draw each link between the two nodes as they actually sit, in the SVG's
    // own pixel space, anchored on the side or corner that faces the other node.
    // Which of the two it is comes from the world layout rather than the pixels:
    // maps sharing a row are joined side to side, maps sharing a column top to
    // bottom, and anything else corner to corner.
    layoutConnectors() {
        const grid = this.gridElement;
        const svg = this.linksElement;
        if (!grid || !svg || !grid.clientWidth || !grid.clientHeight) return;

        svg.setAttribute('viewBox', `0 0 ${grid.clientWidth} ${grid.clientHeight}`);
        this.getCanvas()?.classList.toggle('is-pannable', this.canPan());

        svg.querySelectorAll('line').forEach(line => {
            const from = this.getNodeBox(line.dataset.from);
            const to = this.getNodeBox(line.dataset.to);
            if (!from || !to) {
                line.setAttribute('x1', 0);
                line.setAttribute('y1', 0);
                line.setAttribute('x2', 0);
                line.setAttribute('y2', 0);
                return;
            }

            const heading = this.getHeading(line.dataset.from, line.dataset.to, from, to);
            const start = this.getAnchorPoint(from, heading);
            const end = this.getAnchorPoint(to, { x: -heading.x, y: -heading.y });
            line.setAttribute('x1', start.x);
            line.setAttribute('y1', start.y);
            line.setAttribute('x2', end.x);
            line.setAttribute('y2', end.y);
        });
    }

    // Which way the second map lies from the first, as one of the eight compass
    // directions of the layout grid. Falls back to where the nodes ended up when
    // two maps claim the same square — and for a link that crosses between a
    // parent and something nested inside it, where the nodes ended up is the
    // only answer there is: the two layouts are measured in different spaces.
    getHeading(fromMapId, toMapId, fromBox, toBox) {
        const pixels = { x: Math.sign(toBox.x - fromBox.x), y: Math.sign(toBox.y - fromBox.y) };
        if (!WorldGraph.areSiblings(fromMapId, toMapId)) return pixels;

        const from = WorldGraph.getMap(fromMapId)?.layout;
        const to = WorldGraph.getMap(toMapId)?.layout;
        const heading = {
            x: Math.sign((Number(to?.x) || 0) - (Number(from?.x) || 0)),
            y: Math.sign((Number(to?.y) || 0) - (Number(from?.y) || 0))
        };

        return (heading.x || heading.y) ? heading : pixels;
    }

    // Where on a node a link is tied. Straight across, that is the middle of the
    // facing side. Diagonally, it is the middle of the corner's curve — the point
    // the eye reads as the corner once the sharp one has been rounded away, and
    // the reason a line aimed at the box's true corner looks like it stops short.
    getAnchorPoint(box, heading) {
        const arcInset = box.radius * (1 - Math.SQRT1_2);

        return {
            x: box.x + heading.x * (box.halfWidth - (heading.y === 0 ? 0 : arcInset)),
            y: box.y + heading.y * (box.halfHeight - (heading.x === 0 ? 0 : arcInset))
        };
    }

    // Node geometry in the chart's coordinates — offsets, not client rects, so
    // it is unaffected by the canvas being scrolled or the stage transformed.
    getNodeBox(mapId) {
        const node = this.nodeElements.get(mapId);
        if (!node) return null;

        const halfWidth = node.offsetWidth / 2;
        const halfHeight = node.offsetHeight / 2;

        return {
            x: node.offsetLeft + halfWidth,
            y: node.offsetTop + halfHeight,
            halfWidth,
            halfHeight,
            // A node's corner is a curve, not a point, and a link tied to the
            // sharp corner of the box lands out in the open where the rounding
            // has already pulled the edge away.
            radius: Math.min(
                parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0,
                halfWidth,
                halfHeight
            )
        };
    }

    // What actually goes in a grid square. A map with nothing inside it is just
    // its node; a map with children is that node plus their grid, wrapped in a
    // holder that takes the square instead. The holder stays unpositioned on
    // purpose — see the note at the top of the file.
    buildCell(map, extent) {
        const node = this.buildNode(map, extent);
        const children = WorldGraph.getChildren(map.id);
        if (children.length === 0) return node;

        const nest = document.createElement('div');
        nest.className = 'world-map__nest';
        nest.style.gridColumn = node.style.gridColumn;
        nest.style.gridRow = node.style.gridRow;
        node.style.gridColumn = '';
        node.style.gridRow = '';
        node.classList.add('is-parent');

        const inner = document.createElement('div');
        inner.className = 'world-map__grid world-map__grid--nested';
        const innerExtent = this.getLayoutExtent(children);
        inner.style.setProperty('--world-map-columns', innerExtent.columns);
        inner.style.setProperty('--world-map-rows', innerExtent.rows);
        children.forEach(child => inner.appendChild(this.buildCell(child, innerExtent)));

        nest.append(node, inner);
        return nest;
    }

    buildNode(map, extent) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = 'world-map__node button';
        node.dataset.mapId = map.id;
        node.style.gridColumn = String((Number(map.layout?.x) || 0) - extent.minX + 1);
        node.style.gridRow = String((Number(map.layout?.y) || 0) - extent.minY + 1);

        const name = document.createElement('span');
        name.className = 'world-map__node-name';
        name.textContent = this.gameContainer.getMapDisplayName(map.id);

        // Rows are a fixed height, so an empty badge row buys no evenness — it
        // just puts the name off centre. A node with nothing to report gets none.
        const badges = document.createElement('span');
        badges.className = 'world-map__node-badges';
        const residents = this.getResidents(map.id).length;
        const present = this.getPresent(map.id).length;
        const pointsOfInterest = map.pointsOfInterest?.length ?? 0;
        if (residents > 0) badges.appendChild(this.buildBadge(`${residents} home`, 'is-resident'));
        if (present > 0) badges.appendChild(this.buildBadge(`${present} here`, 'is-traveller'));
        if (pointsOfInterest > 0) {
            badges.appendChild(this.buildBadge(pointsOfInterest === 1 ? 'Shop' : `${pointsOfInterest} shops`, 'is-poi'));
        }

        node.append(name);
        if (badges.childElementCount > 0) node.appendChild(badges);
        node.classList.toggle('is-current', map.id === this.currentMapId);
        node.classList.toggle('is-selected', map.id === this.selectedMapId);
        node.classList.toggle('is-unreachable', !WorldGraph.areConnected(this.currentMapId, map.id));
        node.addEventListener('click', event => {
            // A child node sits inside its parent's holder, so a click on it
            // would otherwise read as a click on the parent too.
            event.stopPropagation();
            this.selectedMapId = map.id;
            this.render();
        });

        this.nodeElements.set(map.id, node);
        return node;
    }

    buildBadge(text, modifier) {
        const badge = document.createElement('span');
        badge.className = `world-map__badge ${modifier}`;
        badge.textContent = text;
        return badge;
    }

    // Two different questions, and the map answers both: whose home this is, and
    // who is standing on it right now. A myte at home counts as both.
    getResidents(mapId) {
        return (this.gameContainer.mytes ?? []).filter(myte => myte.homeMapId === mapId);
    }

    // Where a myte actually is, asked of the container rather than worked out
    // here — it is the same answer the rest of the game uses, and it covers the
    // myte crossing a map, the one out with you, and the one asleep in its slot.
    getPresent(mapId) {
        return (this.gameContainer.mytes ?? [])
            .filter(myte => this.gameContainer.getMyteMapId?.(myte) === mapId);
    }

    getNames(mytes) {
        return mytes.map(myte => myte.name).join(', ') || 'None';
    }

    // Every branch renders the same set of parts — heading, four rows, one
    // action — so switching maps never resizes the window.
    renderDetail(detail) {
        const map = WorldGraph.getMap(this.selectedMapId);
        if (!map) {
            detail.replaceChildren(this.buildEmptyState('Select a map.', { compact: true }));
            return;
        }

        const isHere = map.id === this.currentMapId;
        const distance = WorldGraph.getDistance(this.currentMapId, map.id);
        const neighbors = WorldGraph.getNeighbors(map.id).map(id => this.gameContainer.getMapDisplayName(id));

        const head = document.createElement('div');
        head.className = 'panel-detail__head';
        const heading = document.createElement('h3');
        heading.className = 'panel-detail__title';
        heading.textContent = this.gameContainer.getMapDisplayName(map.id);
        const region = document.createElement('span');
        region.className = 'panel-detail__caption';
        region.textContent = this.humanize(map.region);
        head.append(heading, region);

        // The shared label/value list, so every row's value starts in the same
        // place however long its label is — "Points of interest" no longer sets
        // its own column width against everything else's.
        const rows = DetailRows.build([
            ['Distance', this.getDistanceLabel(isHere, distance)],
            ['Connects to', neighbors.join(', ') || 'Nowhere'],
            ['Lives here', this.getNames(this.getResidents(map.id))],
            ['Here now', this.getNames(this.getPresent(map.id))],
            ['Points of interest', this.getPointOfInterestNames(map).join(', ') || 'None']
        ], { className: 'world-map__rows' });

        // The action row is always present even when empty — panel-detail
        // reserves its height, so a map you cannot travel to is the same size
        // as one you can.
        const actions = document.createElement('div');
        actions.className = 'panel-detail__actions';
        if (!isHere) actions.appendChild(this.buildTravelButton(map, distance));

        detail.replaceChildren(head, rows, actions);
    }

    getDistanceLabel(isHere, distance) {
        if (isHere) return 'You are here';
        if (!Number.isFinite(distance)) return 'No known route';
        return `${distance} map${distance === 1 ? '' : 's'} away`;
    }

    getPointOfInterestNames(map) {
        return (map?.pointsOfInterest ?? []).map(point => {
            if (point.type === 'shop') {
                return ShopRegistry.getShop(point.id)?.name || this.humanize(point.id);
            }
            return this.humanize(point.id || point.type);
        });
    }

    humanize(value) {
        const text = String(value || '');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    buildTravelButton(map, distance) {
        const activeMyte = this.gameContainer.activeMyte;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'world-map__travel';
        // With a myte out, travelling is a walk it takes, not a jump the camera
        // makes — so the button says what will actually happen.
        button.textContent = activeMyte ? 'Walk There' : 'Travel Here';

        if (!Number.isFinite(distance)) {
            button.disabled = true;
            button.title = 'No portal route leads there.';
            return button;
        }

        if (activeMyte) {
            const travelManager = this.gameContainer.travelManager;
            const isHeadingHere = travelManager?.isEscorting(activeMyte) &&
                travelManager.getDestination(activeMyte) === map.id;

            button.textContent = isHeadingHere ? 'Stop Walking' : 'Walk There';
            button.title = isHeadingHere
                ? `${activeMyte.name} keeps going until it arrives, or you stop it.`
                : `${activeMyte.name} walks there through every portal on the way.`;

            button.addEventListener('click', () => {
                if (isHeadingHere) {
                    travelManager.cancelTravel(activeMyte, { keepDeployed: true });
                    this.render();
                    return;
                }

                // Changing your mind mid-walk just changes where it is walking.
                travelManager?.cancelTravel(activeMyte, { keepDeployed: true });
                this.gameContainer.travelActiveMyteTo(map.id);
                this.close();
            });

            return button;
        }

        button.addEventListener('click', () => {
            this.gameContainer.loadMap(map.id);
            this.close();
        });

        return button;
    }

    dispose() {
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.panHandler?.dispose();
        this.panHandler = null;
        this.panFrom = null;
        this.gridElement = null;
        this.linksElement = null;
        this.nodeElements.clear();
        super.dispose();
    }
}
