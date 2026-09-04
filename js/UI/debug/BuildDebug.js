class BuildDebug {
    static counters = new WeakMap();

    static activeMap() {
        return MyteCore.instance?.getFirstContainer?.()?.gameMap ?? null;
    }

    static increment(name, map = BuildDebug.activeMap()) {
        if (!map) return 0;
        const counters = BuildDebug.counters.get(map) || { hitTests: 0, imageDataReads: 0 };
        counters[name] = (counters[name] || 0) + 1;
        BuildDebug.counters.set(map, counters);
        return counters[name];
    }

    static stats(map = BuildDebug.activeMap()) {
        const transaction = map?.buildTransaction?.stats?.() || {};
        const hasTransaction = !!map?.buildTransaction;
        const counters = BuildDebug.counters.get(map) || {};
        return Object.freeze({
            transactions: transaction.transactions || 0,
            wallRebuilds: hasTransaction ? transaction.wallRebuilds || 0 : map?.wallBuilder?.rebuilds || 0,
            ownershipSolves: hasTransaction ? transaction.ownershipSolves || 0 : map?.floorBuilder?.ownershipSolves || 0,
            topologyRebuilds: hasTransaction ? transaction.topologyRebuilds || 0 : 0,
            floorChunksRedrawn: map?.floorBuilder?.chunksRedrawn || transaction.floorChunksRedrawn || 0,
            wallPiecesRedrawn: map?.wallBuilder?.piecesRedrawn || transaction.wallPiecesRedrawn || 0,
            hitTests: counters.hitTests || transaction.hitTests || 0,
            imageDataReads: counters.imageDataReads || transaction.imageDataReads || 0
        });
    }
}

window.__build = Object.freeze({ stats: map => BuildDebug.stats(map) });
