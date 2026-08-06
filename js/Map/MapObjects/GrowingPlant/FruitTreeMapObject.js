class FruitTreeMapObject extends TreeMapObject {
    constructor(parent, type, variant, posX, posY, config = {}, options = {}) {
        super(parent, type, variant, posX, posY, config, options);

        this.hasFruit = false;
        this._fruitRegrowthElapsed = 0;
        this.fruitRegrowthTime = this.getConfig('fruitConfig.regrowthTime', 300000);
        this.readyOnFirstGrown = this.getConfig('fruitConfig.readyOnFirstGrown', true);
        this.fruitDrops = this.getConfig('fruitConfig.drops', this.shakeItemDrops);
        this.minFruitYield = this.getConfig('fruitConfig.yield.min', this.minShakeYield);
        this.maxFruitYield = this.getConfig('fruitConfig.yield.max', this.maxShakeYield);

        // Fruit readiness is tracked via hasFruit — disable the base shake cooldown
        this.shakeCooldown = 0;
        this._shakeElapsed = 0;
    }

    // ── capability checks ────────────────────────────────────────────────────

    canShake() {
        return this.growthStage === 'grown' && this.hasFruit;
    }

    serializeState() {
        return {
            ...super.serializeState(),
            hasFruit: this.hasFruit,
            fruitRegrowthElapsed: this._fruitRegrowthElapsed
        };
    }

    restoreState(data = {}) {
        super.restoreState(data);
        this.hasFruit = data.hasFruit === true;
        this._fruitRegrowthElapsed = Utility.clamp(
            Number(data.fruitRegrowthElapsed) || 0,
            0,
            this.fruitRegrowthTime
        );
        this._updateFruitVisuals();
    }

    // ── growth callback ──────────────────────────────────────────────────────

    onGrowthStageComplete(stage) {
        if (stage === 'grown' && this.readyOnFirstGrown) {
            this.hasFruit = true;
            this._fruitRegrowthElapsed = this.fruitRegrowthTime;
            this._updateFruitVisuals();
        }
    }

    // ── actions ──────────────────────────────────────────────────────────────

    shake() {
        if (!this.canShake()) return false;

        this.hasFruit = false;
        this._fruitRegrowthElapsed = 0;
        this._updateFruitVisuals();

        this.playAnimation('shake', () => this.playAnimation('grown'));

        const drops = this._rollDrops(this.fruitDrops, this.minFruitYield, this.maxFruitYield);
        drops.forEach(drop => this.spawnDroppedInventoryItem(drop, { parent: this.container ?? this.parent }));
        this.playConfiguredSound?.('shake');

        return true;
    }

    // ── fruit regrowth ───────────────────────────────────────────────────────

    _advanceFruitTimer(deltaMs) {
        if (this.growthStage !== 'grown' || this.hasFruit) return;

        this._fruitRegrowthElapsed = Math.min(
            this._fruitRegrowthElapsed + deltaMs,
            this.fruitRegrowthTime
        );

        if (this._fruitRegrowthElapsed >= this.fruitRegrowthTime) {
            this.hasFruit = true;
            this._updateFruitVisuals();
        }
    }

    _updateFruitVisuals() {
        if (!this.element) return;
        this.element.classList.toggle('has-fruit', this.hasFruit);
    }

    // ── time ─────────────────────────────────────────────────────────────────

    onTimeSkip(realMs) {
        super.onTimeSkip(realMs);
        this._advanceFruitTimer(realMs);
    }

    tickUpdate(tickDelta) {
        super.tickUpdate(tickDelta);
        this._advanceFruitTimer(tickDelta);
    }

    // ── render ───────────────────────────────────────────────────────────────

    render(container, parent) {
        const element = super.render(container, parent);
        element.classList.add('fruit-tree');
        if (this.hasFruit) element.classList.add('has-fruit');
        return element;
    }

    // ── info ─────────────────────────────────────────────────────────────────

    getSidebarDetailRows() {
        const rows = [];

        if (this.growthStage === 'grown') {
            if (this.hasFruit) {
                rows.push({ label: 'Fruit', value: 'Ready to pick' });
            } else {
                const remaining = Math.max(0, this.fruitRegrowthTime - this._fruitRegrowthElapsed);
                rows.push({ label: 'Fruit regrows in', value: `${Math.ceil(remaining / 1000)}s` });
            }
        }

        return rows;
    }
}
