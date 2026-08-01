// Single source of truth for the Myte save/roster schema.
// ContainerManager (restore/normalize) and User (save) both go through these
// helpers, so field names, defaults, and clamping rules live in one place.
class MyteRosterSchema {

    static createStarterRoster(existingRoster = []) {
        const starters = SiteConfig.myte.starterRoster || [];
        const candidates = Array.isArray(existingRoster) ? existingRoster : [];
        const usedCandidates = new Set();

        return starters.map((starter, index) => {
            const candidateIndex = candidates.findIndex((entry, candidateIndex) =>
                !usedCandidates.has(candidateIndex) &&
                MyteDefinitionRegistry.normalizeSpeciesId?.(entry?.species || entry?.speciesId) === starter.species
            );
            const candidate = candidateIndex >= 0 ? candidates[candidateIndex] : {};
            if (candidateIndex >= 0) usedCandidates.add(candidateIndex);

            return this.normalizeEntry({
                ...candidate,
                ...starter,
                stats: candidate?.stats,
                isActive: false
            }, index);
        });
    }

    static statDefaults() {
        const initial = SiteConfig.myte.initialStats;
        return {
            health:     initial.health,
            energy:     initial.energy,
            fun:        initial.fun,
            social:     initial.social,
            satiety:    initial.satiety,
            comfort:    initial.comfort,
            confidence: initial.confidence
        };
    }

    // Normalize a raw roster entry (saved data, DOM extraction, or fallback)
    // into the canonical shape ContainerManager.setupMytes consumes.
    static normalizeEntry(entry = {}, index = 0, options = {}) {
        const preserveSlotPosition = options.preserveSlotPosition === true;
        const species = MyteDefinitionRegistry.normalizeSpeciesId?.(entry.species || entry.speciesId || 'snail') || 'snail';
        const name = String(entry.name || entry.displayName || `Myte ${index + 1}`).trim() || `Myte ${index + 1}`;
        const slotId = String(entry.slotId || `myte-slot-${index + 1}`);
        const slotLabel = String(entry.slotLabel || `${name}'s Slot`).trim() || `${name}'s Slot`;
        const starter = SiteConfig.myte.starterRoster?.find(candidate =>
            String(candidate.id) === String(entry.id || index + 1) ||
            candidate.slotId === slotId
        );
        const homeMapId = String(entry.homeMapId || starter?.homeMapId || SiteConfig.world.defaultMap);
        const stats = entry.stats || {};
        const defaults = this.statDefaults();
        const slotX = Number.isFinite(Number(entry.slotX)) ? Number(entry.slotX) : 0;
        const slotY = Number.isFinite(Number(entry.slotY)) ? Number(entry.slotY) : 0;
        const hasExplicitSlotPosition = preserveSlotPosition && (
            entry.hasSlotPosition === true ||
            (entry.hasSlotPosition == null && (slotX !== 0 || slotY !== 0))
        );
        const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

        return {
            id: String(entry.id || index + 1),
            name,
            species,
            slotId,
            slotLabel,
            homeMapId,
            slotX,
            slotY,
            hasSlotPosition: hasExplicitSlotPosition,
            isActive: entry.isActive === true,
            goal: entry.goal ?? DEFAULT_MODE,
            followGoal: entry.followGoal ?? DEFAULT_FOLLOW_MODE,
            autonomyGoal: entry.autonomyGoal ?? DEFAULT_AUTONOMY_MODE,
            posX: Number.isFinite(Number(entry.posX)) ? Number(entry.posX) : null,
            posY: Number.isFinite(Number(entry.posY)) ? Number(entry.posY) : null,
            stats: {
                health:     num(stats.health, defaults.health),
                energy:     num(stats.energy, defaults.energy),
                fun:        num(stats.fun, defaults.fun),
                social:     num(stats.social, defaults.social),
                satiety:    num(stats.satiety ?? stats.hunger, defaults.satiety),
                comfort:    num(stats.comfort, defaults.comfort),
                confidence: num(stats.confidence, defaults.confidence)
            }
        };
    }

    // Serialize a live Myte into the save shape.
    static serializeMyte(myte, index = 0) {
        const defaults = this.statDefaults();
        return {
            id: myte.id,
            name: myte.name,
            species: myte.species,
            posX: myte.posX,
            posY: myte.posY,
            slotId: myte.elements?.wrapper?.id || `myte-slot-${index + 1}`,
            slotLabel: myte.elements?.wrapper?.querySelector?.('.myte-home-label .name')?.textContent?.trim?.() || `${myte.name}'s Slot`,
            homeMapId: myte.homeMapId || SiteConfig.world.defaultMap,
            isActive: !!myte.isActive,
            goal: myte.goal ?? null,
            followGoal: myte.followGoal ?? null,
            autonomyGoal: myte.autonomyGoal ?? null,
            stats: {
                health:     myte.stats?.health     ?? defaults.health,
                energy:     myte.stats?.energy     ?? defaults.energy,
                fun:        myte.stats?.fun        ?? defaults.fun,
                social:     myte.stats?.social     ?? defaults.social,
                satiety:    myte.stats?.satiety    ?? defaults.satiety,
                comfort:    myte.stats?.comfort    ?? defaults.comfort,
                confidence: myte.stats?.confidence ?? defaults.confidence,
                speed:      myte.stats?.speed      ?? 1,
                level:      myte.stats?.level      ?? 1,
                experience: myte.stats?.experience ?? 0,
                traits: myte.stats?.traits ? { ...myte.stats.traits } : undefined,
            },
        };
    }

    // Apply a normalized roster entry to a live Myte (name, display labels, stats).
    static applyToMyte(myte, rosterEntry = {}) {
        if (!myte?.stats || !rosterEntry) {
            return;
        }

        myte.name = rosterEntry.name || myte.name;
        myte.homeMapId = rosterEntry.homeMapId || SiteConfig.world.defaultMap;
        myte.element.dataset.myteName = myte.name;
        myte.element.dataset.myteHomeMap = myte.homeMapId;
        if (myte.elements.wrapper) {
            myte.elements.wrapper.dataset.myteHomeMap = myte.homeMapId;
        }
        myte.duplicate?.setAttribute?.('data-myte-name', myte.name);

        const displayNameElements = [
            myte.element.querySelector('.name-wrapper .name'),
            myte.duplicate?.querySelector?.('.name-wrapper .name'),
            myte.elements.wrapper?.querySelector?.('.myte-home-label .name')
        ].filter(Boolean);
        displayNameElements.forEach((element, index) => {
            element.textContent = index === 2
                ? (rosterEntry.slotLabel || `${myte.name}'s Slot`)
                : myte.name;
        });

        const stats = rosterEntry.stats || {};
        myte.stats.health = Math.max(myte.stats.minHealth, Math.min(myte.stats.maxHealth, stats.health ?? myte.stats.health));
        myte.stats.energy = Math.max(myte.stats.minEnergy, Math.min(myte.stats.maxEnergy, stats.energy ?? myte.stats.energy));
        if (stats.fun     != null) myte.stats.fun    = Math.max(myte.stats.minFun,    Math.min(myte.stats.maxFun,    stats.fun));
        if (stats.social  != null) myte.stats.social = Math.max(myte.stats.minSocial, Math.min(myte.stats.maxSocial, stats.social));
        const savedSatiety = stats.satiety ?? stats.hunger;
        if (savedSatiety != null) myte.stats.satiety = Math.max(myte.stats.minSatiety, Math.min(myte.stats.maxSatiety, savedSatiety));
        myte.stats.comfort    = Math.max(myte.stats.minComfort,    Math.min(myte.stats.maxComfort,    stats.comfort    ?? myte.stats.comfort));
        // Migrate old 0–100 confidence saves to new 0–1 scale
        const savedConfidence = stats.confidence != null && stats.confidence > 1
            ? stats.confidence / 100
            : stats.confidence;
        myte.stats.confidence = Math.max(myte.stats.minConfidence, Math.min(myte.stats.maxConfidence, savedConfidence ?? myte.stats.confidence));

        // Restore progression and personality traits from the canonical save schema.
        if (stats.speed != null) myte.stats.speed = stats.speed;
        if (stats.level != null) myte.stats.level = stats.level;
        if (stats.experience != null) myte.stats.experience = stats.experience;
        if (stats.traits && typeof stats.traits === 'object') {
            myte.stats.traits = { ...myte.stats.traits, ...stats.traits };
        }

        myte.stats.updateBatteryDisplay?.();
    }
}
