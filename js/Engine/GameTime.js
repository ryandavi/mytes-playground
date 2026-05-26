class GameTime {
	constructor() {
		if (GameTime.instance) {
			return GameTime.instance;
		}
		GameTime.instance = this;

		// Core time tracking
		this.totalElapsedSeconds = 0;
		this.isPaused = false;
		this.timeScale = 1;

		// Configuration
		this.config = {
			dayDurationInMinutes: SiteConfig.time.dayDurationInMinutes,
			daysPerSeason: SiteConfig.time.daysPerSeason,
			seasons: ['spring', 'summer', 'autumn', 'winter'],
			daysOfTheWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],

			// Natural day/night cycle times (in hours)
			naturalCycle: {
				dawn: { hour: 5, minute: 0 },
				sunrise: { hour: 6, minute: 0 },
				noon: { hour: 12, minute: 0 },
				sunset: { hour: 18, minute: 0 },
				dusk: { hour: 19, minute: 0 },
				midnight: { hour: 0, minute: 0 }
			},

			// Time periods array - easier to maintain
			timePeriods: [
				{ name: 'deep_night', start: { hour: 22, minute: 0 }, end: { hour: 23, minute: 30 } },
				{ name: 'midnight', start: { hour: 23, minute: 30 }, end: { hour: 0, minute: 30 } },
				{ name: 'dead_of_night', start: { hour: 0, minute: 30 }, end: { hour: 2, minute: 0 } },
				{ name: 'witching_hour', start: { hour: 2, minute: 0 }, end: { hour: 3, minute: 0 } },
				{ name: 'night_watch', start: { hour: 3, minute: 0 }, end: { hour: 4, minute: 0 } },
				{ name: 'late_night', start: { hour: 4, minute: 0 }, end: { hour: 4, minute: 30 } },
				{ name: 'predawn', start: { hour: 4, minute: 30 }, end: { hour: 5, minute: 30 } },
				{ name: 'dawn', start: { hour: 5, minute: 30 }, end: { hour: 6, minute: 30 } },
				{ name: 'sunrise', start: { hour: 6, minute: 30 }, end: { hour: 7, minute: 30 } },
				{ name: 'aurora_hour', start: { hour: 7, minute: 30 }, end: { hour: 9, minute: 0 } },
				{ name: 'morning', start: { hour: 9, minute: 0 }, end: { hour: 12, minute: 0 } },
				{ name: 'midday', start: { hour: 12, minute: 0 }, end: { hour: 15, minute: 0 } },
				{ name: 'afternoon', start: { hour: 15, minute: 0 }, end: { hour: 17, minute: 0 } },
				{ name: 'evening', start: { hour: 17, minute: 0 }, end: { hour: 18, minute: 0 } },
				{ name: 'magic_hour', start: { hour: 18, minute: 0 }, end: { hour: 19, minute: 0 } },
				{ name: 'sunset', start: { hour: 19, minute: 0 }, end: { hour: 19, minute: 30 } },
				{ name: 'dusk', start: { hour: 19, minute: 30 }, end: { hour: 20, minute: 30 } },
				{ name: 'gloaming', start: { hour: 20, minute: 30 }, end: { hour: 21, minute: 30 } },
				{ name: 'nightfall', start: { hour: 21, minute: 30 }, end: { hour: 22, minute: 0 } }
			],

			timePeriodsSimple: [
				{ name: 'late_night', start: { hour: 0, minute: 0 }, end: { hour: 5, minute: 0 } },
				{ name: 'dawn', start: { hour: 5, minute: 0 }, end: { hour: 7, minute: 0 } },
				{ name: 'morning', start: { hour: 7, minute: 0 }, end: { hour: 12, minute: 0 } },
				{ name: 'midday', start: { hour: 12, minute: 0 }, end: { hour: 14, minute: 0 } },
				{ name: 'afternoon', start: { hour: 14, minute: 0 }, end: { hour: 17, minute: 0 } },
				{ name: 'evening', start: { hour: 17, minute: 0 }, end: { hour: 20, minute: 0 } },
				{ name: 'night', start: { hour: 20, minute: 0 }, end: { hour: 0, minute: 0 } }
			],

			// Moon configuration
			moonPhases: {
				daysPerPhase: 3.5,
				phases: ['new', 'waxingCrescent', 'firstQuarter', 'waxingGibbous',
					'full', 'waningGibbous', 'lastQuarter', 'waningCrescent'],
				phaseEffects: {
					new: { lightBonus: 0, growthMultiplier: 0.8 },
					waxingCrescent: { lightBonus: 0.2, growthMultiplier: 0.9 },
					firstQuarter: { lightBonus: 0.3, growthMultiplier: 1.0 },
					waxingGibbous: { lightBonus: 0.4, growthMultiplier: 1.1 },
					full: { lightBonus: 0.5, growthMultiplier: 1.2 },
					waningGibbous: { lightBonus: 0.4, growthMultiplier: 1.1 },
					lastQuarter: { lightBonus: 0.3, growthMultiplier: 1.0 },
					waningCrescent: { lightBonus: 0.2, growthMultiplier: 0.9 }
				}
			}
		};

		// Event handling
		this.subscribers = {
			minute: new Set(),
			hour: new Set(),
			day: new Set(),
			season: new Set(),
			year: new Set(),
			dayNight: new Set(),
			light: new Set(),
			moonPhase: new Set(),
			timeSkip: new Set()
		};

		const initialDate = SiteConfig.time.initialDate || {
			year: 1,
			season: 'spring',
			day: 1,
			hour: 8,
			minute: 0
		};

		this.setDateTime(
			initialDate.year,
			initialDate.season,
			initialDate.day,
			initialDate.hour,
			initialDate.minute
		);

		this.lastMinute = this.getCurrentMinute();
		this.lastHour = this.getCurrentHour();
		this.lastDay = this.getCurrentDay();
		this.lastSeason = this.getCurrentSeason();
		this.lastYear = this.getCurrentYear();
		this.lastTimeOfDay = this.getTimeOfDay();
		this.lastLightLevel = this.getLightLevel();
		this.lastMoonPhase = this.getMoonPhase();
	}

	// Helper methods for common calculations
	_timeToMinutes(hour, minute) {
		return hour * 60 + minute;
	}

	_getTotalGameDays() {
		return Math.floor(this.getCurrentGameMinutes() / (24 * 60));
	}

	_getGameMinuteToRealSecondsRatio() {
		return (this.config.dayDurationInMinutes * 60) / (24 * 60);
	}

	// Time getters
	getCurrentGameMinutes() {
		const gameMinuteToRealSeconds = this._getGameMinuteToRealSecondsRatio();
		const realToGameScalingFactor = 1 / gameMinuteToRealSeconds;
		return Math.floor(this.totalElapsedSeconds * realToGameScalingFactor);
	}

	getCurrentMinute() {
		return this.getCurrentGameMinutes() % 60;
	}

	getCurrentHour() {
		return Math.floor(this.getCurrentGameMinutes() / 60) % 24;
	}

	getCurrentDay() {
		return Math.floor(this.getCurrentGameMinutes() / (60 * 24)) % this.config.daysPerSeason;
	}

	getCurrentDayOfWeek() {
		const totalDays = this._getTotalGameDays();
		return this.config.daysOfTheWeek[totalDays % this.config.daysOfTheWeek.length];
	}

	getCurrentSeason() {
		const totalDays = this._getTotalGameDays();
		const seasonIndex = Math.floor(totalDays / this.config.daysPerSeason) % this.config.seasons.length;
		return this.config.seasons[seasonIndex];
	}

	getCurrentYear() {
		const totalDays = this._getTotalGameDays();
		return Math.floor(totalDays / (this.config.daysPerSeason * this.config.seasons.length)) + 1;
	}

	// Moon-related methods
	getMoonPhase() {
		const totalDays = this._getTotalGameDays();
		const cycleLength = this.config.moonPhases.daysPerPhase * this.config.moonPhases.phases.length;
		const phaseIndex = Math.floor((totalDays % cycleLength) / this.config.moonPhases.daysPerPhase);
		return this.config.moonPhases.phases[phaseIndex];
	}

	getMoonIllumination() {
		const phase = this.getMoonPhase();
		const effects = this.config.moonPhases.phaseEffects[phase];
		return effects ? effects.lightBonus : 0;
	}

	getMoonGrowthMultiplier() {
		const phase = this.getMoonPhase();
		const effects = this.config.moonPhases.phaseEffects[phase];
		return effects ? effects.growthMultiplier : 1;
	}

	// Time of day and light calculations
	getTimeOfDay() {
		const currentMinutes = this._timeToMinutes(this.getCurrentHour(), this.getCurrentMinute());

		const isBetween = (time, start, end) => {
			const startMins = this._timeToMinutes(start.hour, start.minute);
			const endMins = this._timeToMinutes(end.hour, end.minute);

			if (startMins <= endMins) {
				return time >= startMins && time < endMins;
			} else {
				// Handle overnight period (e.g., 22:00 - 03:00)
				return time >= startMins || time < endMins;
			}
		};

		const period = this.config.timePeriods.find(period =>
			isBetween(currentMinutes, period.start, period.end)
		);

		return period ? period.name : 'night';
	}

	getLightLevel() {
		const hour = this.getCurrentHour();
		const minute = this.getCurrentMinute();

		// Calculate base daylight
		let baseLight = this.calculateDaylightLevel(hour, minute);

		// Add moonlight at night
		if (baseLight === 0) {
			const moonPhase = this.getMoonPhase();
			const moonEffect = this.config.moonPhases.phaseEffects[moonPhase];
			baseLight = moonEffect ? moonEffect.lightBonus : 0;
		}

		return Math.min(1, Math.max(0, baseLight));
	}

	calculateDaylightLevel(hour, minute) {
		const currentMinutes = this._timeToMinutes(hour, minute);
		const cycle = this.config.naturalCycle;

		const times = Object.entries(cycle).reduce((acc, [key, value]) => {
			acc[key] = this._timeToMinutes(value.hour, value.minute);
			return acc;
		}, {});

		if (currentMinutes < times.dawn) return 0;
		if (currentMinutes < times.sunrise) {
			return (currentMinutes - times.dawn) / (times.sunrise - times.dawn) * 0.3;
		}
		if (currentMinutes < times.noon) {
			return 0.3 + (currentMinutes - times.sunrise) / (times.noon - times.sunrise) * 0.7;
		}
		if (currentMinutes < times.sunset) {
			return 1 - (currentMinutes - times.noon) / (times.sunset - times.noon) * 0.7;
		}
		if (currentMinutes < times.dusk) {
			return 0.3 - (currentMinutes - times.sunset) / (times.dusk - times.sunset) * 0.3;
		}
		return 0;
	}

	// Formatting methods
	getFormattedTime() {
		const hour = this.getCurrentHour();
		const minute = this.getCurrentMinute();

		const display12hour = true;
		let displayHour = display12hour ? (hour % 12 || 12) : hour;
		let period = display12hour ? (hour >= 12 ? 'PM' : 'AM') : '';
		let hourString = `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`.trim();

		return hourString;
	}

	getFormattedDate() {
		const dayOfWeek = this.getCurrentDayOfWeek();
		const day = this.getCurrentDay() + 1;
		const season = this.getCurrentSeason();
		const year = this.getCurrentYear();

		return `${dayOfWeek}, day ${day} of ${season}, year ${year}`;
	}

	getTimeData() {
		return {
			minute: this.getCurrentMinute(),
			hour: this.getCurrentHour(),
			day: this.getCurrentDay() + 1,
			dayOfWeek: this.getCurrentDayOfWeek(),
			season: this.getCurrentSeason(),
			year: this.getCurrentYear(),
			timeOfDay: this.getTimeOfDay(),
			lightLevel: this.getLightLevel(),
			moonPhase: this.getMoonPhase(),
			moonIllumination: this.getMoonIllumination(),
			moonGrowthMultiplier: this.getMoonGrowthMultiplier(),
			formattedTime: this.getFormattedTime(),
			formattedDate: this.getFormattedDate(),
			seasonProgress: this.getCurrentDay() / this.config.daysPerSeason,
			dayProgress: (this.getCurrentHour() * 60 + this.getCurrentMinute()) / (24 * 60),
			totalDays: this._getTotalGameDays(),
			totalElapsedSeconds: this.totalElapsedSeconds,
			timeScale: this.timeScale,
			isPaused: this.isPaused
		};
	}

	// Event handling methods
	subscribe(event, callback) {
		if (this.subscribers[event]) {
			this.subscribers[event].add(callback);
			if (event !== 'timeSkip') {
				callback(this.getTimeData());
			}
		}
	}

	unsubscribe(event, callback) {
		if (this.subscribers[event]) {
			this.subscribers[event].delete(callback);
		}
	}

	checkAndNotifyChanges() {
		const currentMinute = this.getCurrentMinute();
		const currentHour = this.getCurrentHour();
		const currentDay = this.getCurrentDay();
		const currentSeason = this.getCurrentSeason();
		const currentYear = this.getCurrentYear();
		const currentTimeOfDay = this.getTimeOfDay();
		const currentLightLevel = this.getLightLevel();
		const currentMoonPhase = this.getMoonPhase();

		if (currentMinute !== this.lastMinute) {
			this.notifySubscribers('minute');
			this.lastMinute = currentMinute;
		}

		if (currentHour !== this.lastHour) {
			this.notifySubscribers('hour');
			this.lastHour = currentHour;
		}

		if (currentDay !== this.lastDay) {
			this.notifySubscribers('day');
			this.lastDay = currentDay;
		}

		if (currentSeason !== this.lastSeason) {
			this.notifySubscribers('season');
			this.lastSeason = currentSeason;
		}

		if (currentYear !== this.lastYear) {
			this.notifySubscribers('year');
			this.lastYear = currentYear;
		}

		if (currentTimeOfDay !== this.lastTimeOfDay) {
			this.notifySubscribers('dayNight');
			this.lastTimeOfDay = currentTimeOfDay;
		}

		if (Math.abs(currentLightLevel - this.lastLightLevel) >= 0.05) {
			this.notifySubscribers('light');
			this.lastLightLevel = currentLightLevel;
		}

		if (currentMoonPhase !== this.lastMoonPhase) {
			this.notifySubscribers('moonPhase');
			this.lastMoonPhase = currentMoonPhase;
		}
	}

	notifySubscribers(event) {
		const timeData = this.getTimeData();
		this.subscribers[event]?.forEach(callback => callback(timeData));
	}

	_notifyTimeSkip(realMs) {
		if (realMs <= 0) return;
		this.subscribers.timeSkip?.forEach(cb => cb(realMs));
	}

	// Time control methods
	update(deltaTime) {
		if (this.isPaused) return;

		this.totalElapsedSeconds += (deltaTime / 1000) * this.timeScale;
		this.checkAndNotifyChanges();
	}

	tickUpdate(deltaTime) {
		this.update(deltaTime);
	}

	pause() {
		this.isPaused = true;
	}

	resume() {
		this.isPaused = false;
	}

	setTimeScale(scale = 1) {
		this.timeScale = Math.min(32, Math.max(0, Number(scale) || 0));
		return this.timeScale;
	}

	// Set specific time
	setTime(hour, minute = 0) {
		if (hour < 0 || hour > 23) throw new Error('Invalid hour');
		if (minute < 0 || minute > 59) throw new Error('Invalid minute');

		const currentYear = this.getCurrentYear();
		const currentSeason = this.getCurrentSeason();
		const currentDay = this.getCurrentDay() + 1;

		const before = this.totalElapsedSeconds;
		this.setDateTime(currentYear, currentSeason, currentDay, hour, minute);
		this._notifyTimeSkip((this.totalElapsedSeconds - before) * 1000);
	}

	// Set specific date and time
	setDateTime(year, season, day, hour = 0, minute = 0) {
		// Validate inputs
		if (year < 1) throw new Error('Year must be 1 or greater');
		const targetSeason = this.config.seasons.indexOf(season.toLowerCase());
		if (targetSeason === -1) throw new Error('Invalid season');
		if (day < 1 || day > this.config.daysPerSeason) throw new Error('Invalid day');
		if (hour < 0 || hour > 23) throw new Error('Invalid hour');
		if (minute < 0 || minute > 59) throw new Error('Invalid minute');

		// Calculate total game minutes first (same way we read them)
		const yearMinutes = (year - 1) * this.config.seasons.length * this.config.daysPerSeason * 60 * 24;
		const seasonMinutes = targetSeason * this.config.daysPerSeason * 60 * 24;
		const dayMinutes = (day - 1) * 60 * 24;
		const hourMinutes = hour * 60;
		const totalGameMinutes = yearMinutes + seasonMinutes + dayMinutes + hourMinutes + minute;

		// Convert game minutes back to real seconds: 1 game-min = dayDurationInMinutes/24 real seconds
		this.totalElapsedSeconds = totalGameMinutes * this._getGameMinuteToRealSecondsRatio();

		this.checkAndNotifyChanges();
	}


	// Skip forward by a specific amount
	skipTime(hours = 0, minutes = 0) {
		const totalMinutes = hours * 60 + minutes;
		const secondsPerGameMinute = this._getGameMinuteToRealSecondsRatio();
		const realMs = totalMinutes * secondsPerGameMinute * 1000;
		this.totalElapsedSeconds += totalMinutes * secondsPerGameMinute;
		this.checkAndNotifyChanges();
		this._notifyTimeSkip(realMs);
	}

	skipDays(days) {
		if (days < 0) throw new Error('Cannot skip negative days');

		const currentYear = this.getCurrentYear();
		const currentSeason = this.getCurrentSeason();
		const currentDay = this.getCurrentDay() + 1;
		const currentHour = this.getCurrentHour();
		const currentMinute = this.getCurrentMinute();

		let newDay = currentDay + days;
		let newSeason = currentSeason;
		let newYear = currentYear;

		while (newDay > this.config.daysPerSeason) {
			newDay -= this.config.daysPerSeason;
			const seasonIndex = (this.config.seasons.indexOf(newSeason) + 1) % this.config.seasons.length;
			newSeason = this.config.seasons[seasonIndex];
			if (seasonIndex === 0) {
				newYear++;
			}
		}

		const before = this.totalElapsedSeconds;
		this.setDateTime(newYear, newSeason, newDay, currentHour, currentMinute);
		this._notifyTimeSkip((this.totalElapsedSeconds - before) * 1000);
	}

	skipToNextDay() {
		const currentYear = this.getCurrentYear();
		const currentSeason = this.getCurrentSeason();
		const currentDay = this.getCurrentDay() + 1;

		let nextDay = currentDay + 1;
		let nextSeason = currentSeason;
		let nextYear = currentYear;

		if (nextDay > this.config.daysPerSeason) {
			nextDay = 1;
			const seasonIndex = (this.config.seasons.indexOf(nextSeason) + 1) % this.config.seasons.length;
			nextSeason = this.config.seasons[seasonIndex];
			if (seasonIndex === 0) {
				nextYear++;
			}
		}

		const before = this.totalElapsedSeconds;
		this.setDateTime(nextYear, nextSeason, nextDay, 0, 0);
		this._notifyTimeSkip((this.totalElapsedSeconds - before) * 1000);
	}

	// Change how long a day takes in real-time minutes
	setDayDuration(realMinutes) {
		// Store current game time
		const currentGameMinutes = this.getCurrentGameMinutes();

		// Update configuration
		this.config.dayDurationInMinutes = realMinutes;

		// Recalculate totalElapsedSeconds to maintain game time
		const newSecondsPerGameMinute = this._getGameMinuteToRealSecondsRatio();
		this.totalElapsedSeconds = currentGameMinutes * newSecondsPerGameMinute;

		this.checkAndNotifyChanges();
	}

	dispose() {
		Object.values(this.subscribers).forEach(subscribers => subscribers.clear());
		GameTime.instance = null;
	}
}
