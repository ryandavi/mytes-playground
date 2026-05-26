const AudioScheduleProfiles = {
	// Each profile defines ambient layers and music for a location type.
	// ambientBase  — always playing in this location
	// ambientDay   — added during daytime hours (7–17)
	// ambientNight — added during night hours (19–4)
	// music*       — music IDs keyed by time window
	_profiles: {
		outside: {
			ambientBase:  ['env_wind'],
			ambientDay:   ['env_birds'],
			ambientNight: ['env_cricket'],
			musicDay:     'music_sunny',
			musicNight:   'music_night',
			musicDefault: 'music_main'
		},
		inside: {
			ambientBase:  ['env_indoor_cozy'],
			ambientDay:   [],
			ambientNight: [],
			musicDay:     'music_sunny',
			musicNight:   'music_night',
			musicDefault: 'music_main'
		}
	},

	_getProfile(location) {
		return this._profiles[location] || this._profiles.outside;
	},

	getMusicForHour(hour, location = 'outside') {
		const p = this._getProfile(location);
		if (!Number.isFinite(hour)) return p.musicDefault;
		if (hour >= 8 && hour < 18) return p.musicDay;
		if (hour >= 20 || hour < 6) return p.musicNight;
		return p.musicDefault;
	},

	getAmbientForHour(hour, location = 'outside') {
		const p = this._getProfile(location);
		const tracks = [...p.ambientBase];
		if (Number.isFinite(hour)) {
			if (hour >= 7 && hour <= 17) tracks.push(...p.ambientDay);
			if (hour >= 19 || hour <= 4) tracks.push(...p.ambientNight);
		}
		return tracks;
	}
};
