class AudioPresetLibrary {
    static definitions = null;

    static async preload() {
        if (this.definitions) return true;
        try {
            const response = await fetch(AppConfig.content.audioPresetsPath);
            if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
            this.definitions = await response.json();
            return true;
        } catch (error) {
            console.error('[AudioPresetLibrary] Failed to load presets:', error);
            return false;
        }
    }

    static create(manager) {
        if (!this.definitions) {
            throw new Error('Audio presets must be preloaded before use.');
        }

        return Object.fromEntries(Object.entries(this.definitions).map(([id, definition]) => [
            id,
            {
                ...definition,
                create: () => this.createSound(id, definition, manager)
            }
        ]));
    }

    static createSound(id, definition, manager) {
        if (definition.factory === 'footstep') {
            return manager.createFootstepPreset(definition.options);
        }

        const nodes = new Map();
        for (const nodeDefinition of definition.graph?.nodes ?? []) {
            const Constructor = Tone[nodeDefinition.type];
            if (typeof Constructor !== 'function') {
                throw new Error(`Unknown Tone node type: ${nodeDefinition.type}`);
            }
            const args = this.hydrate(nodeDefinition.args, nodes);
            nodes.set(nodeDefinition.id, new Constructor(...args));
        }

        // Destination nodes route through a per-sound Panner instead of straight to
        // Tone.Destination, so SoundManager.play() can steer the dry signal left/right
        // based on map position without every preset graph needing its own pan node.
        const hasDestinationNode = (definition.graph?.nodes ?? []).some(node => node.destination);
        const panner = hasDestinationNode ? new Tone.Panner(0).toDestination() : null;

        for (const nodeDefinition of definition.graph?.nodes ?? []) {
            const node = nodes.get(nodeDefinition.id);
            for (const [key, value] of Object.entries(nodeDefinition.properties ?? {})) {
                if (key === 'volume' && value && typeof value === 'object') {
                    Object.assign(node.volume, value);
                } else {
                    node[key] = this.hydrate(value, nodes);
                }
            }
            for (const targetId of nodeDefinition.connections ?? []) {
                node.connect(nodes.get(targetId));
            }
            if (nodeDefinition.destination) node.connect(panner);
            if (nodeDefinition.started) node.start();
        }

        const sound = this.hydrate(definition.output, nodes);
        if (panner) sound.panner = panner;
        if (definition.patternGenerator) {
            sound.pattern = this.createPattern(definition.patternGenerator);
        }
        if (definition.triggerProfile) {
            sound.trigger = this.createTrigger(definition.triggerProfile);
        }
        return sound;
    }

    static createPattern(config) {
        const pattern = [];
        if (config.kind === 'birdChirps') {
            for (let index = 0; index < config.count; index++) {
                const time = index * config.spacing + Math.random() * config.jitter;
                pattern.push({
                    note: Utility.randomChoice(config.notes),
                    time,
                    duration: config.duration
                });
                if (Math.random() > config.trillChance) {
                    pattern.push({
                        note: Utility.randomChoice(config.notes),
                        time: time + config.trillOffset,
                        duration: config.duration
                    });
                }
            }
            return pattern;
        }
        if (config.kind === 'pulseGroups') {
            for (let group = 0; group < config.groups; group++) {
                const time = group * config.spacing + Math.random() * config.jitter;
                for (let pulse = 0; pulse < config.pulses; pulse++) {
                    pattern.push({
                        note: config.note,
                        time: time + pulse * config.pulseSpacing,
                        duration: config.duration
                    });
                }
            }
            return pattern;
        }
        throw new Error(`Unknown audio pattern generator: ${config.kind}`);
    }

    static hydrate(value, nodes) {
        if (Array.isArray(value)) return value.map(item => this.hydrate(item, nodes));
        if (!value || typeof value !== 'object') return value;
        if (value.$node) return nodes.get(value.$node);
        if (value.$toneClass) return Tone[value.$toneClass];
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.hydrate(item, nodes)]));
    }

    static createTrigger(profile) {
        if (profile === 'pickupSparkle') {
            return ({ sound, effectiveVolume, options, manager }) => {
                const pitchScale = options.pitchScale ?? (1 + manager.getCenteredVariation(0.018));
                const now = Tone.now();
                sound.synth.body.triggerAttackRelease(manager.applyPitchToNote('E5', pitchScale), '64n', now, effectiveVolume * 0.95);
                sound.synth.sparkle.triggerAttackRelease(manager.applyPitchToNote('B5', pitchScale * 1.003), '32n', now + 0.032, effectiveVolume * 0.75);
                sound.synth.sparkle.triggerAttackRelease(manager.applyPitchToNote('E6', pitchScale * 1.006), '16n', now + 0.072, effectiveVolume * 0.55);
            };
        }
        if (profile === 'cropTend') {
            return ({ sound, effectiveVolume, options, manager }) => {
                const now = Tone.now();
                const pitchScale = options.pitchScale ?? (1 + manager.getCenteredVariation(0.01));
                sound.synth.body.triggerAttackRelease('32n', now, effectiveVolume * 0.7);
                sound.synth.pluck.triggerAttackRelease(
                    manager.applyPitchToNote('G5', pitchScale),
                    '64n',
                    now + 0.02,
                    effectiveVolume * 0.28
                );
            };
        }
        throw new Error(`Unknown audio trigger profile: ${profile}`);
    }
}
