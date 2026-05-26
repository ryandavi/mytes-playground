class TreeMapObject extends GrowingPlantMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        // Override growth stages for trees
        this.stages = ['seed', 'sprout', 'half_grown', 'grown'];

        // Shake-to-harvest state
        this.shakeCooldown = this.getConfig('shakeConfig.cooldown', 30000);
        this._shakeElapsed = this.shakeCooldown; // ready immediately
        this.shakeItemDrops = this.getConfig('shakeConfig.drops', []);
        this.minShakeYield = this.getConfig('shakeConfig.yield.min', 1);
        this.maxShakeYield = this.getConfig('shakeConfig.yield.max', 3);

        // Chop state
        this.chopItemDrops = this.getConfig('chopConfig.drops', []);
        this.minChopYield = this.getConfig('chopConfig.yield.min', 2);
        this.maxChopYield = this.getConfig('chopConfig.yield.max', 5);
    }

    // ── capability checks ────────────────────────────────────────────────────

    isGrown() {
        return this.growthStage === 'grown' && !this.fullyGrown === false;
    }

    canShake() {
        return this.growthStage === 'grown' && this._shakeElapsed >= this.shakeCooldown;
    }

    canChop() {
        return this.growthStage === 'grown';
    }

    // ── actions ──────────────────────────────────────────────────────────────

    shake() {
        if (!this.canShake()) return false;

        this._shakeElapsed = 0;
        this.playAnimation('shake', () => this.playAnimation('grown'));

        const drops = this._rollDrops(this.shakeItemDrops, this.minShakeYield, this.maxShakeYield);
        drops.forEach(drop => this.spawnDroppedInventoryItem(drop, { parent: this.container ?? this.parent }));
        this.playConfiguredSound?.('shake');

        return true;
    }

    chop() {
        if (!this.canChop()) return false;

        this.playAnimation('chop', () => this._transformToStump());
        this.playConfiguredSound?.('chop');

        return true;
    }

    _transformToStump() {
        const map = this.gameMap ?? this.parent;
        if (!map) return;

        const stump = MapObjectFactory.create(
            'TREE_STUMP',
            this.variant ? `${this.variant}_stump` : 'stump',
            this.posX,
            this.posY,
            map,
            { configOverrides: this.getConfig('chopConfig.stumpConfig', {}) }
        );

        if (stump) {
            // Drop chop items before removing the tree
            const drops = this._rollDrops(this.chopItemDrops, this.minChopYield, this.maxChopYield);
            drops.forEach(drop => this.spawnDroppedInventoryItem(drop, { parent: this.container ?? this.parent }));

            map.addObject(stump);
        }

        this.remove();
    }

    // ── time skip ────────────────────────────────────────────────────────────

    onTimeSkip(realMs) {
        super.onTimeSkip(realMs);
        this._shakeElapsed = Math.min(this._shakeElapsed + realMs, this.shakeCooldown);
    }

    // ── tick ─────────────────────────────────────────────────────────────────

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);

        if (this.growthStage === 'grown' && this._shakeElapsed < this.shakeCooldown) {
            this._shakeElapsed = Math.min(this._shakeElapsed + tickDelta, this.shakeCooldown);
        }
    }

    // ── interaction ──────────────────────────────────────────────────────────

    press(parent) {
        const myte = this.activeMyte;
        if (!myte) return false;

        if (this.growthStage !== 'grown') {
            if (!this.canWater()) return false;
            return this.runInteractionWhenInRange(() => this.water(), myte, {
                queueVerb: 'Water Tree',
                userInitiated: true
            });
        }

        if (this.canShake()) {
            return this.runInteractionWhenInRange(() => this.shake(), myte, {
                queueVerb: 'Shake Tree',
                userInitiated: true,
                postActionIdleDuration: 1200
            });
        }

        return false;
    }

    handleDoubleClick(event) {
        const myte = this.activeMyte;
        if (!myte || !this.canChop()) return false;

        return this.runInteractionWhenInRange(() => this.chop(), myte, {
            queueVerb: 'Chop Tree',
            userInitiated: true,
            postActionIdleDuration: 1200
        });
    }

    runDebugDirectInteraction(parent = this.container ?? this.parent) {
        if (!this.active) return false;
        this.selectInUi?.();

        if (this.growthStage !== 'grown') {
            if (this.canWater()) { this.water(); return true; }
            return false;
        }

        if (this.canShake()) return this.shake();
        return false;
    }

    // ── render ───────────────────────────────────────────────────────────────

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('tree');
        element.dataset.treeStage = this.growthStage;
        return element;
    }

    // ── info ─────────────────────────────────────────────────────────────────

    getSidebarDetailRows() {
        const rows = [...(super.getSidebarDetailRows?.() ?? [])];

        if (this.growthStage === 'grown') {
            const cooldownRemaining = Math.max(0, this.shakeCooldown - this._shakeElapsed);
            rows.push({ label: 'Shake Ready', value: cooldownRemaining <= 0 ? 'Yes' : `${Math.ceil(cooldownRemaining / 1000)}s` });
        }

        return rows;
    }
}
