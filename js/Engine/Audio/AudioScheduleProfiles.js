const AudioScheduleProfiles = {
	getMusicForHour(hour) {
		if (!Number.isFinite(hour)) {
			return "music_main";
		}

		if (hour >= 8 && hour < 18) {
			return "music_sunny";
		}

		if (hour >= 20 || hour < 6) {
			return "music_night";
		}

		return "music_main";
	},

	getAmbientForHour(hour) {
		const ambientTracks = ["env_wind"];

		if (Number.isFinite(hour)) {
			if (hour >= 7 && hour <= 17) {
				ambientTracks.push("env_birds");
			}

			if (hour >= 19 || hour <= 4) {
				ambientTracks.push("env_cricket");
			}
		}

		return ambientTracks;
	}
};
