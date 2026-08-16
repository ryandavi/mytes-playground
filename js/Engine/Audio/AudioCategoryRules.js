const AudioCategoryRules = {
	resolve(id, preset = null) {
		const resolvedPreset = preset || {};
		if (resolvedPreset.category) {
			return resolvedPreset.category;
		}

		switch (resolvedPreset.type) {
			case "music":
				return "music";
			case "ambient":
				return "ambient";
			case "ui":
				return "ui";
			default:
				break;
		}

		if (String(id || '').startsWith('myte_')) return 'entities';
		if (String(id || '').startsWith('footstep_')) return 'footsteps';
		if (['obj_fountain', 'obj_lantern'].some(prefix => String(id || '').startsWith(prefix))) return 'machines';
		if (String(id || '').startsWith('obj_')) return 'world';
		return 'sfx';
	},

	// The mute switch that owns each category. Everything answers to
	// `soundEnabled` first — that is what makes it the master — and then to the
	// one switch beside its own slider.
	MUTE_FLAGS: Object.freeze({
		master: 'soundEnabled',
		music: 'musicEnabled',
		ambient: 'ambientEnabled',
		sfx: 'sfxEnabled',
		footsteps: 'footstepsEnabled',
		ui: 'uiEnabled'
	}),

	isEnabled(soundManager, category) {
		if (!soundManager.soundEnabled) return false;
		switch (category) {
			case 'music':
				return soundManager.musicEnabled;
			case 'ambient':
				return soundManager.ambientEnabled;
			case 'ui':
				return soundManager.uiEnabled;
			// Footsteps are mixed through the SFX bus, so silencing effects
			// silences them too — the switch beside the Footsteps slider only
			// narrows that further.
			case 'footsteps':
				return soundManager.sfxEnabled && soundManager.footstepsEnabled;
			default:
				return soundManager.sfxEnabled;
		}
	},

	getVolume(soundManager, category) {
		switch (category) {
			case 'music':
				return soundManager.volume.music;
			case 'ambient':
				return soundManager.volume.ambient;
			case 'ui':
				return soundManager.volume.ui;
			case 'footsteps':
				return soundManager.volume.sfx * soundManager.volume.footsteps;
			case 'entities':
			case 'machines':
			case 'notifications':
			case 'world':
			case 'sfx':
			default:
				return soundManager.volume.sfx;
		}
	}
};
