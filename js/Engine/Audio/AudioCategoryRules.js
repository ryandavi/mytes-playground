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

	isEnabled(soundManager, category) {
		switch (category) {
			case 'music':
				return soundManager.musicEnabled;
			case 'ambient':
				return soundManager.soundEnabled;
			case 'footsteps':
				return soundManager.soundEnabled && soundManager.footstepsEnabled;
			default:
				return soundManager.soundEnabled;
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
