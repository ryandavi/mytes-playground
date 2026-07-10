class HUDManager extends UIComponent {
    constructor(parent) {
        super(parent);
        this.hudElement = document.querySelector('#hud-active-pet');
        this.nameElement = this.hudElement?.querySelector('.name') || null;
        this.moodElement = this.hudElement?.querySelector('.mood') || null;
        this.energyElement = this.hudElement?.querySelector('.energy') || null;
        this.clockElement = this.parent.containerWrapper.querySelector('.date-time .clock');
        this.coinElement = this.parent.containerWrapper.querySelector('.coin-count');
        this.currentMoodEffect = null;
        this._lastUpdate = 0;
        this._currencyUnsubscribe = null;
        this._coinAnimationFrame = null;
        this._coinAnimationToken = 0;
        this._coinDisplayedValue = 0;
        this._coinScale = 1;
        this._lastCoinTickAt = -Infinity;
        this.numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
        this.lastRenderedState = {
            visible: false,
            myteId: null,
            name: null,
            mood: null,
            energy: null,
            moodEffect: null,
            clock: null,
            clockTitle: null,
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

    getEnergyLabel(ratio) {
        if (ratio <= 0.1) return 'Critical';
        if (ratio <= 0.3) return 'Low';
        if (ratio <= 0.55) return 'Okay';
        if (ratio <= 0.8) return 'Good';
        return 'Full';
    }

    update(force = false) {
        const now = performance.now();
        if (!force && now - this._lastUpdate < SiteConfig.ui.hud.updateIntervalMs) return;
        this._lastUpdate = now;

        this.updateClock();

        if (!this.hudElement) return;

        const activeMyte = this.parent.getActiveMyte();

        if (!activeMyte) {
            if (this.lastRenderedState.visible) {
                this.hudElement.classList.remove('is-visible');
                this.lastRenderedState.visible = false;
            }
            return;
        }

        if (!this.lastRenderedState.visible) {
            this.hudElement.classList.add('is-visible');
            this.lastRenderedState.visible = true;
        }

        const mood = activeMyte.stats.getDerivedMood?.() ?? 'neutral';
        const energyRatio = activeMyte.stats.getEnergyRatio();
        const energy = `${this.getEnergyLabel(energyRatio)} ${Math.round(energyRatio * 100)}%`;
        const currentAction = activeMyte.queue.getCurrentAction();
        const actionMetadata = currentAction?.constructor?.metadata;
        const moodVal = actionMetadata?.effects?.mood ?? 0;
        const moodEffectText = moodVal !== 0
            ? `Mood ${moodVal > 0 ? '+' : ''}${moodVal}`
            : null;

        if (this.lastRenderedState.myteId !== activeMyte.id || this.lastRenderedState.name !== activeMyte.name) {
            this.nameElement.textContent = activeMyte.name;
            this.lastRenderedState.myteId = activeMyte.id;
            this.lastRenderedState.name = activeMyte.name;
        }

        if (this.lastRenderedState.mood !== mood) {
            this.moodElement.textContent = mood;
            this.lastRenderedState.mood = mood;
        }

        if (this.lastRenderedState.energy !== energy) {
            this.energyElement.textContent = energy;
            this.lastRenderedState.energy = energy;
        }

        if (this.lastRenderedState.moodEffect !== moodEffectText) {
            this.currentMoodEffect?.remove();
            this.currentMoodEffect = null;

            if (moodEffectText) {
                const moodEffect = document.createElement('div');
                moodEffect.className = 'mood-effect';
                moodEffect.textContent = moodEffectText;
                this.hudElement.appendChild(moodEffect);
                this.currentMoodEffect = moodEffect;
            }

            this.lastRenderedState.moodEffect = moodEffectText;
        }
    }

    updateClock() {
        if (!this.clockElement) return;

        const gameTime = this.parent.parent?.core?.gameTime;
        if (!gameTime) return;

        const season = gameTime.getCurrentSeason?.();
        const glyph = SiteConfig.ui.hud.seasonGlyphs[season] ?? '';
        const clock = `${gameTime.getFormattedTime()}${glyph ? ` ${glyph}` : ''}`;
        const title = gameTime.getFormattedDate();

        if (this.lastRenderedState.clock !== clock) {
            this.clockElement.textContent = clock;
            this.lastRenderedState.clock = clock;
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
            this.coinElement.textContent = `¢ ${this.numberFormatter.format(roundedValue)}`;
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
            this.resetCoinEmphasis();
            this.renderCoinValue(target);
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
                this.playCoinSound('ui_select', { volume: 0.3 });
            }
        };

        this._coinAnimationFrame = requestAnimationFrame(step);
    }

    playCoinTick(progress, magnitude, isPositive, now) {
        const config = SiteConfig.ui.hud.numericAnimation;
        if (magnitude < config.tickMinDelta) return;

        const interval = config.tickStartIntervalMs
            + (config.tickEndIntervalMs - config.tickStartIntervalMs) * progress;
        if (now - this._lastCoinTickAt < interval) return;

        this._lastCoinTickAt = now;
        this.playCoinSound('ui_hover', {
            volume: isPositive ? 0.16 : 0.1,
            pitchScale: 0.9 + progress * 0.16
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
        this.hudElement = null;
        this.nameElement = null;
        this.moodElement = null;
        this.energyElement = null;
        this.clockElement = null;
        this.coinElement = null;
        this.numberFormatter = null;
        this.currentMoodEffect = null;
    }
}
