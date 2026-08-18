const AudioScheduleProfiles = {
	// Each profile defines ambient layers and music for a location type.
	// ambientBase  — always playing in this location
	// ambientDay   — added during daytime hours (7–17)
	// ambientNight — added during night hours (19–4)
	// music*       — music IDs keyed by time window, see getMusicForHour.
	//                One track per part of the day: morning / noon / evening /
	//                night, each named for the window it belongs to.
	_profiles: {
		outside: {
			ambientBase:  ['env_wind'],
			ambientDay:   ['env_birds'],
			ambientNight: ['env_cricket'],
			musicMorning: 'music_morning',
			musicDay:     'music_noon',
			musicEvening: 'music_evening',
			musicNight:   'music_night',
			musicDefault: 'music_evening'
		},
		inside: {
			ambientBase:  ['env_indoor_cozy'],
			ambientDay:   [],
			ambientNight: [],
			musicMorning: 'music_morning',
			musicDay:     'music_noon',
			musicEvening: 'music_evening',
			musicNight:   'music_night',
			musicDefault: 'music_evening'
		}
	},

	_getProfile(location) {
		return this._profiles[location] || this._profiles.outside;
	},

	/**
	 * Four windows, one per part of the day.
	 *
	 * A day is five real minutes, so an in-game hour is ~12.5 real seconds and
	 * these are shorter than they look. The two long stretches get the two long
	 * loops and the two transitions get the two short ones, so every track is
	 * heard several times over rather than cut off part-way:
	 *
	 *   05-08  morning   3h ≈ 38s   music_morning
	 *   08-17  noon      9h ≈ 112s  music_noon
	 *   17-20  evening   3h ≈ 38s   music_evening
	 *   20-05  night     9h ≈ 112s  music_night
	 *
	 * Each track's melody and pad loop at coprime lengths and drift apart, so
	 * what you actually hear takes minutes to come round — the loop length in
	 * bars is not the length of the experience. See SoundManager._resolveLoopEnd.
	 *
	 * The evening piece was `music_main`, the fallback for whatever the other
	 * windows left over, which is why it never seemed to play. It has its own
	 * window now, and the unknown-hour fallback stays pointed at it.
	 */
	getMusicForHour(hour, location = 'outside') {
		const p = this._getProfile(location);
		if (!Number.isFinite(hour)) return p.musicDefault;
		if (hour >= 5  && hour < 8)  return p.musicMorning;
		if (hour >= 8  && hour < 17) return p.musicDay;
		if (hour >= 17 && hour < 20) return p.musicEvening;
		return p.musicNight;
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
