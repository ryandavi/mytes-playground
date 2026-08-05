class HUDManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.clockElement = this.parent.containerWrapper.querySelector('.date-time .clock');
        this.clockTextElement = this.clockElement?.querySelector('.clock__time') ?? null;
        this.clockSeasonElement = this.clockElement?.querySelector('.clock__season') ?? null;
        this.coinElement = this.parent.containerWrapper.querySelector('.coin-count');
        this._lastUpdate = 0;
        this._currencyUnsubscribe = null;
        this._coinAnimationFrame = null;
        this._coinAnimationToken = 0;
        this._coinDisplayedValue = 0;
        this._coinScale = 1;
        this._lastCoinTickAt = -Infinity;
        this.numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
        this.lastRenderedState = {
            clock: null,
            clockTitle: null,
            season: null,
            coins: null
        };
    }

    init() {
        const core = this.parent.parent?.core;
        const initialCoins = Number(core?.user?.currency?.coins) || 0;
        this.renderCoinValue(initialCoins);

        if (!this._currencyUnsubscribe && core?.eventManager) {
            this._currencyUnsubscribe = core.eventManager.on('user:currency_changed', (payload) => {
                if (payload?.type === 'coins') this.animateCoinTotal(payload.total, payload.delta);
            });
        }

        this.update(true);
    }

    update(force = false) {
        const now = performance.now();
        if (!force && now - this._lastUpdate < SiteConfig.ui.hud.updateIntervalMs) return;
        this._lastUpdate = now;

        this.updateClock();
    }

    updateClock() {
        if (!this.clockTextElement || !this.clockSeasonElement) return;

        const gameTime = this.parent.parent?.core?.gameTime;
        if (!gameTime) return;

        const season = gameTime.getCurrentSeason?.();
        const seasonIcon = SiteConfig.ui.hud.seasonIcons[season] ?? '';
        const clock = gameTime.getFormattedTime();
        const title = gameTime.getFormattedDate();

        if (this.lastRenderedState.clock !== clock) {
            this.clockTextElement.textContent = clock;
            this.lastRenderedState.clock = clock;
        }
        if (this.lastRenderedState.season !== seasonIcon) {
            Utility.setIcon(this.clockSeasonElement, seasonIcon);
            this.clockSeasonElement.hidden = !seasonIcon;
            this.lastRenderedState.season = seasonIcon;
        }
        if (this.lastRenderedState.clockTitle !== title) {
            this.clockElement.title = title;
            this.lastRenderedState.clockTitle = title;
        }
    }

    renderCoinValue(value) {
        const roundedValue = Math.round(value);
        this._coinDisplayedValue = value;
        if (this.coinElement && this.lastRenderedState.coins !== roundedValue) {
            this.coinElement.textContent = Utility.formatCurrency('coins', roundedValue);
            this.lastRenderedState.coins = roundedValue;
        }
    }

    animateCoinTotal(total, eventDelta = null) {
        const target = Number(total);
        if (!Number.isFinite(target)) return;

        const start = this.lastRenderedState.coins ?? this._coinDisplayedValue;
        const delta = target - start;

        this._coinAnimationToken++;
        const token = this._coinAnimationToken;
        if (this._coinAnimationFrame !== null) cancelAnimationFrame(this._coinAnimationFrame);
        this._coinAnimationFrame = null;

        if (delta === 0) {
            this.resetCoinEmphasis();
            this.renderCoinValue(target);
            return;
        }

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) {
            const soundConfig = SiteConfig.ui.hud.numericAnimation.sound;
            const isPositive = delta > 0;
            this.resetCoinEmphasis();
            this.renderCoinValue(target);
            this.playCoinSound(soundConfig.tickId, {
                volume: isPositive ? soundConfig.gainTickVolume : soundConfig.spendTickVolume,
                pitchScale: isPositive ? soundConfig.gainPitchStart : soundConfig.spendPitchStart
            });
            return;
        }

        const config = SiteConfig.ui.hud.numericAnimation;
        const authoritativeDelta = eventDelta != null && Number.isFinite(Number(eventDelta))
            ? Number(eventDelta)
            : delta;
        const magnitude = Math.abs(authoritativeDelta);
        const duration = Utility.clamp(
            config.minDurationMs + Math.log10(magnitude + 1) * config.durationLogScaleMs,
            config.minDurationMs,
            config.maxDurationMs
        );
        const scaleStrength = Math.min(
            config.maxScale - 1,
            config.scalePerLogMagnitude * Math.log10(magnitude + 1)
        );
        const startingScaleOffset = Math.max(0, this._coinScale - 1);
        const startedAt = performance.now();
        const isPositive = authoritativeDelta > 0;
        this._lastCoinTickAt = -Infinity;
        const directionClass = isPositive ? 'is-gaining' : 'is-spending';
        this.coinElement?.classList.remove('is-gaining', 'is-spending');
        this.coinElement?.classList.add(directionClass);

        const step = (now) => {
            if (token !== this._coinAnimationToken) return;

            const progress = Math.min(1, (now - startedAt) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            this.renderCoinValue(start + delta * eased);

            const emphasisProgress = Math.min(1, progress / 0.65);
            const emphasis = Math.sin(Math.PI * emphasisProgress) * scaleStrength;
            this._coinScale = 1 + startingScaleOffset * (1 - progress) + emphasis;
            if (this.coinElement) this.coinElement.style.transform = `scale(${this._coinScale})`;

            this.playCoinTick(progress, magnitude, isPositive, now);

            if (progress < 1) {
                this._coinAnimationFrame = requestAnimationFrame(step);
                return;
            }

            this._coinAnimationFrame = null;
            this.renderCoinValue(target);
            this.resetCoinEmphasis();
            if (isPositive && magnitude >= config.finalChimeMinDelta) {
                this.playCoinSound(config.sound.chimeId, { volume: config.sound.chimeVolume });
            }
        };

        this._coinAnimationFrame = requestAnimationFrame(step);
    }

    playCoinTick(progress, magnitude, isPositive, now) {
        const config = SiteConfig.ui.hud.numericAnimation;
        const soundConfig = config.sound;
        if (magnitude < config.tickMinDelta) return;

        const interval = config.tickStartIntervalMs
            + (config.tickEndIntervalMs - config.tickStartIntervalMs) * progress;
        if (now - this._lastCoinTickAt < interval) return;

        this._lastCoinTickAt = now;
        this.playCoinSound(soundConfig.tickId, {
            volume: isPositive ? soundConfig.gainTickVolume : soundConfig.spendTickVolume,
            pitchScale: (isPositive ? soundConfig.gainPitchStart : soundConfig.spendPitchStart)
                + progress * soundConfig.pitchRise
        });
    }

    playCoinSound(soundId, options) {
        const soundManager = this.parent.parent?.core?.soundManager;
        if (!soundManager?.initialized || typeof Tone === 'undefined' || Tone.context?.state !== 'running') return;
        soundManager.play(soundId, options);
    }

    resetCoinEmphasis() {
        this._coinScale = 1;
        if (!this.coinElement) return;
        this.coinElement.style.transform = '';
        this.coinElement.classList.remove('is-gaining', 'is-spending');
    }

    dispose() {
        this._currencyUnsubscribe?.();
        this._currencyUnsubscribe = null;
        this._coinAnimationToken++;
        if (this._coinAnimationFrame !== null) cancelAnimationFrame(this._coinAnimationFrame);
        this._coinAnimationFrame = null;
        this.resetCoinEmphasis();
        this.clockElement = null;
        this.clockTextElement = null;
        this.clockSeasonElement = null;
        this.coinElement = null;
        this.numberFormatter = null;
    }
}
