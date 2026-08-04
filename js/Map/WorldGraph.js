// ─────────────────────────────────────────────────────────────────────────────
// WorldGraph — how the maps of the world connect to each other.
//
// A map file describes itself completely: its `region` and `worldX`/`worldY`
// place it on the world map, its Portal objects say what it connects to, and its
// Spawn objects say where a traveller arrives. So the graph is *discovered*
// rather than declared — start at the default map, read its portals, follow them
// into their targets, and repeat. Adding a connected map to the world is a
// matter of dropping the .tmx in and pointing a portal at it.
//
// There is no world manifest to keep in step: a map is part of the world when
// something opens onto it, which is the same rule the player experiences. A map
// nothing links to is not in the world graph — it can still be loaded directly,
// it just isn't anywhere yet. Portals are treated as bidirectional when both
// sides declare each other, and one-way otherwise.
//
// Distance is hop count — the number of map transitions a traveller makes —
// which is what "is this myte too far away to walk over?" actually means.
//
// Each map's geometry comes out of the same .tmx pass: map size, portal centres,
// spawn points. That is what lets a journey be measured in the ground a
// traveller actually has to cover — the walk from the portal it came in by to
// the portal it is leaving through — rather than a flat per-map timer, and it
// works for maps that are not loaded, which is most of them.
// ─────────────────────────────────────────────────────────────────────────────

class WorldGraph {
    static nodes = new Map();
    static edges = new Map();
    static geometry = new Map();
    static preloaded = false;
    static preloadPromise = null;

    static normalizeId(mapId) {
        return String(mapId || '').replace(/\.tmx$/i, '');
    }

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = (async () => {
            await this.discover();
            this.preloaded = true;
            return true;
        })();

        return this.preloadPromise;
    }

    // Walk out from the starting maps through every portal, reading each map file
    // once. Whatever a portal points at becomes part of the world, so long as the
    // file is really there — a typo in a targetMap leaves an edge to nowhere
    // rather than inventing a map.
    static async discover(startingMaps = [SiteConfig.world.defaultMap]) {
        this.nodes.clear();
        this.edges.clear();
        this.geometry.clear();

        const seeds = startingMaps.map(id => this.normalizeId(id)).filter(Boolean);
        const pending = [...new Set(seeds)];
        const visited = new Set(pending);

        while (pending.length > 0) {
            // One frontier at a time, so sibling maps are read in parallel.
            const frontier = await Promise.all(
                pending.splice(0).map(async id => [id, await this._readMapGeometry(id)])
            );

            frontier.forEach(([mapId, geometry]) => {
                if (!geometry) {
                    visited.delete(mapId);
                    return;
                }

                this.geometry.set(mapId, geometry);
                this.nodes.set(mapId, Object.freeze({
                    id: mapId,
                    region: geometry.region,
                    displayName: geometry.displayName,
                    layout: geometry.layout
                }));
                this.edges.set(mapId, new Map());

                geometry.portals.forEach(portal => {
                    if (visited.has(portal.targetMap)) return;
                    visited.add(portal.targetMap);
                    pending.push(portal.targetMap);
                });
            });
        }

        // Edges last: a portal only counts once the map it points at is known.
        this.geometry.forEach((geometry, mapId) => {
            geometry.portals.forEach(portal => {
                if (!this.nodes.has(portal.targetMap)) return;
                this.edges.get(mapId).set(portal.targetMap, portal);
            });
        });
    }

    static _emptyGeometry() {
        return Object.freeze({
            width: 0,
            height: 0,
            region: 'world',
            displayName: '',
            layout: Object.freeze({ x: 0, y: 0 }),
            portals: Object.freeze([]),
            spawns: new Map()
        });
    }

    // Everything the world needs to know about a map, straight from the map: how
    // big it is, where it sits on the world map, what it connects to and where a
    // traveller arrives. Returns null when there is no such map file, which is
    // how a portal pointing at nothing is told apart from an empty map.
    static async _readMapGeometry(mapId) {
        try {
            const response = await fetch(`${AppConfig.content.mapsPath}/${mapId}.tmx`);
            if (!response.ok) return null;

            const xml = new DOMParser().parseFromString(await response.text(), 'text/xml');
            const number = (node, attribute) => Number(node?.getAttribute(attribute)) || 0;
            const mapNode = xml.querySelector('map');
            if (!mapNode || xml.querySelector('parsererror')) return null;

            // The map's own <properties>, walked as direct children rather than
            // queried: a selector would happily reach down into an object's
            // properties instead, and `:scope` is unreliable across XML parsers.
            const mapProperties = new Map();
            [...mapNode.children]
                .filter(child => child.tagName === 'properties')
                .forEach(properties => {
                    [...properties.children].forEach(property => {
                        mapProperties.set(property.getAttribute('name'), property.getAttribute('value'));
                    });
                });
            const mapProperty = key => mapProperties.get(key) ?? null;

            const portals = [];
            const spawns = new Map();

            [...xml.querySelectorAll('objectgroup > object')].forEach(node => {
                const name = node.getAttribute('name');
                if (name !== 'Portal' && name !== 'Spawn') return;

                const property = key => node.querySelector(`property[name="${key}"]`)?.getAttribute('value') || null;
                const center = Object.freeze({
                    x: number(node, 'x') + number(node, 'width') / 2,
                    y: number(node, 'y') + number(node, 'height') / 2
                });

                if (name === 'Spawn') {
                    spawns.set(property('type') || 'default', center);
                    return;
                }

                const targetMap = this.normalizeId(property('targetMap'));
                if (!targetMap) return;

                portals.push(Object.freeze({
                    portalId: property('portalId'),
                    targetMap,
                    targetPortalId: property('targetPortalId'),
                    center
                }));
            });

            return Object.freeze({
                width: number(mapNode, 'width') * number(mapNode, 'tilewidth'),
                height: number(mapNode, 'height') * number(mapNode, 'tileheight'),
                region: mapProperty('region') || 'world',
                displayName: mapProperty('displayName') || mapProperty('name') || '',
                layout: Object.freeze({
                    x: Number(mapProperty('worldX')) || 0,
                    y: Number(mapProperty('worldY')) || 0
                }),
                portals: Object.freeze(portals),
                spawns
            });
        } catch (error) {
            Utility.warnDebug(`[WorldGraph] Could not read geometry for ${mapId}:`, error);
            return null;
        }
    }

    static getGeometry(mapId) {
        return this.geometry.get(this.normalizeId(mapId)) ?? this._emptyGeometry();
    }

    // The portal on `mapId` that leads to `targetMapId`, as the map file knows
    // it — available whether or not that map is the one currently loaded.
    static getPortalTo(mapId, targetMapId) {
        return this.edges.get(this.normalizeId(mapId))?.get(this.normalizeId(targetMapId)) ?? null;
    }

    // Where a traveller stands when it arrives on `mapId` from `fromMapId`: the
    // portal facing back the way it came, or the spawn point when it is starting
    // out rather than arriving.
    static getEntryPoint(mapId, fromMapId = null) {
        const geometry = this.getGeometry(mapId);
        const back = fromMapId ? this.getPortalTo(mapId, fromMapId) : null;
        return back?.center
            ?? geometry.spawns.get('myte')
            ?? geometry.spawns.get('default')
            ?? { x: geometry.width / 2, y: geometry.height / 2 };
    }

    // How far a traveller walks to cross `mapId` on its way from `fromMapId` to
    // `toMapId`, in map pixels. Straight-line: obstacles make the real path
    // longer, but this is a schedule, not a simulation.
    static getCrossingDistance(mapId, fromMapId, toMapId) {
        const entry = this.getEntryPoint(mapId, fromMapId);
        const exit = this.getPortalTo(mapId, toMapId)?.center;
        if (!exit) return 0;
        return Math.hypot(exit.x - entry.x, exit.y - entry.y);
    }

    static getMaps() {
        return [...this.nodes.values()];
    }

    static getMap(mapId) {
        return this.nodes.get(this.normalizeId(mapId)) || null;
    }

    // Every edge as a flat list, for a world-map view to draw lines from.
    static getConnections() {
        const connections = [];
        this.edges.forEach((targets, fromMapId) => {
            targets.forEach((portal, toMapId) => {
                connections.push({
                    from: fromMapId,
                    to: toMapId,
                    portalId: portal.portalId,
                    // A link is two-way only when the far side also points back.
                    bidirectional: this.edges.get(toMapId)?.has(fromMapId) ?? false
                });
            });
        });
        return connections;
    }

    static getNeighbors(mapId) {
        return [...(this.edges.get(this.normalizeId(mapId))?.keys() ?? [])];
    }

    // Shortest sequence of maps from `fromMapId` to `toMapId`, inclusive of both.
    // Returns null when the two are not connected. Breadth-first: every edge is
    // one transition, so the first path found is the shortest.
    static getRoute(fromMapId, toMapId) {
        const from = this.normalizeId(fromMapId);
        const to = this.normalizeId(toMapId);
        if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
        if (from === to) return [from];

        const cameFrom = new Map([[from, null]]);
        const queue = [from];

        while (queue.length > 0) {
            const current = queue.shift();

            for (const neighbor of this.getNeighbors(current)) {
                if (cameFrom.has(neighbor)) continue;
                cameFrom.set(neighbor, current);

                if (neighbor === to) {
                    const route = [];
                    for (let step = to; step !== null; step = cameFrom.get(step)) {
                        route.unshift(step);
                    }
                    return route;
                }

                queue.push(neighbor);
            }
        }

        return null;
    }

    // Number of map transitions between two maps, or Infinity when unreachable.
    static getDistance(fromMapId, toMapId) {
        const route = this.getRoute(fromMapId, toMapId);
        return route ? route.length - 1 : Infinity;
    }

    static areConnected(fromMapId, toMapId) {
        return Number.isFinite(this.getDistance(fromMapId, toMapId));
    }
}
