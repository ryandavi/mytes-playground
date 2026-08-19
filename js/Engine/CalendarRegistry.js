// ─────────────────────────────────────────────────────────────────────────────
// CalendarRegistry — the one place that answers "what happens on that date?".
//
// Two kinds of thing land on the calendar and they are deliberately the same
// shape, because nothing downstream should care which it is looking at:
//
//   holidays   authored content from data/metadata/calendar.json — a weekly
//              market, one festival per season.
//   birthdays  game state, one per myte, which lives in the save rather than in
//              a data file. The registry never reaches into the container for
//              them; whatever owns the roster registers a source and the
//              registry asks.
//
// A date is (year, season, day) with a 1-based day, exactly as GameTime counts
// it, and every piece of date arithmetic here is GameTime's — season length,
// weekday, season stepping. The registry knows what recurs; the clock knows
// when. Neither keeps a second copy of the other's answer.
// ─────────────────────────────────────────────────────────────────────────────

class CalendarRegistry {
    static defaults = { icon: 'star', category: 'holiday' };
    static categories = new Map();
    static holidays = [];
    static birthdaySource = null;
    static preloaded = false;
    static preloadPromise = null;

    static async preload() {
        if (this.preloaded) return true;
        if (this.preloadPromise) return this.preloadPromise;

        this.preloadPromise = fetch(Utility.preventCache(AppConfig.content.calendarPath))
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load calendar metadata: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                this.loadFromData(data);
                this.preloaded = true;
                return true;
            })
            .catch(error => {
                console.error('[CalendarRegistry] Failed to preload calendar metadata:', error);
                return false;
            });

        return this.preloadPromise;
    }

    static loadFromData(data = {}) {
        this.defaults = Object.freeze({ ...this.defaults, ...(data.defaults ?? {}) });

        this.categories.clear();
        for (const [id, category] of Object.entries(data.categories ?? {})) {
            this.categories.set(id, Object.freeze({
                id,
                label: category.label ?? this.humanize(id),
                icon: category.icon ?? this.defaults.icon
            }));
        }

        this.holidays = Object.freeze((data.holidays ?? [])
            .map(entry => this.normalizeHoliday(entry))
            .filter(Boolean));
    }

    static normalizeHoliday(entry = {}) {
        const id = Utility.normalizeId(entry.id);
        if (!id || !entry.recurrence?.type) return null;

        const category = entry.category ?? this.defaults.category;
        return Object.freeze({
            id,
            name: entry.name ?? this.humanize(id),
            category,
            icon: entry.icon ?? this.categories.get(category)?.icon ?? this.defaults.icon,
            description: entry.description ?? '',
            recurrence: Object.freeze({ ...entry.recurrence })
        });
    }

    static getCategory(id) {
        return this.categories.get(id) ?? { id, label: this.humanize(id), icon: this.defaults.icon };
    }

    // ── Birthdays ────────────────────────────────────────────────────────────

    /**
     * Register where myte birthdays come from. The source returns entries of
     * `{ id, name, birthday: { season, day } }` — normally the live roster.
     */
    static registerBirthdaySource(source) {
        this.birthdaySource = typeof source === 'function' ? source : null;
    }

    static getBirthdayEntries() {
        try {
            return this.birthdaySource?.() ?? [];
        } catch (error) {
            console.error('[CalendarRegistry] Birthday source failed:', error);
            return [];
        }
    }

    /**
     * A stable birthday for a myte that has none saved. Derived from its id, so
     * the same myte gets the same day on every load and an existing roster is
     * not left blank — but a real saved birthday always wins.
     */
    static deriveBirthday(id, gameTime = GameTime.instance) {
        const seasons = gameTime?.config?.seasons ?? SiteConfig.time.seasons;
        const daysPerSeason = gameTime?.config?.daysPerSeason ?? SiteConfig.time.daysPerSeason;

        let hash = 0;
        for (const character of String(id ?? '')) {
            hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
        }

        return {
            season: seasons[hash % seasons.length],
            day: (Math.floor(hash / seasons.length) % daysPerSeason) + 1
        };
    }

    /**
     * The birthday to use for a roster entry: what the save holds, or a derived
     * one when the save holds nothing and the world is configured to fill in.
     */
    static resolveBirthday(entry, gameTime = GameTime.instance) {
        const saved = entry?.birthday;
        if (this.isValidDate(saved, gameTime)) {
            return { season: String(saved.season).toLowerCase(), day: Number(saved.day) };
        }
        if (!SiteConfig.time.calendar.birthdayFallbackEnabled) return null;
        return this.deriveBirthday(entry?.id ?? entry?.name, gameTime);
    }

    static isValidDate(date, gameTime = GameTime.instance) {
        const seasons = gameTime?.config?.seasons ?? SiteConfig.time.seasons;
        const daysPerSeason = gameTime?.config?.daysPerSeason ?? SiteConfig.time.daysPerSeason;
        const day = Number(date?.day);
        return seasons.includes(String(date?.season ?? '').toLowerCase()) &&
            Number.isFinite(day) && day >= 1 && day <= daysPerSeason;
    }

    // ── Lookups ──────────────────────────────────────────────────────────────

    /**
     * Everything happening on one date, holidays and birthdays together, in the
     * order a day should read: what the whole world is doing, then whose day it
     * is.
     */
    static getEventsForDate(date, gameTime = GameTime.instance) {
        if (!gameTime || !this.isValidDate(date, gameTime)) return [];

        const season = String(date.season).toLowerCase();
        const day = Number(date.day);
        const dayOfWeek = gameTime.getDayOfWeekFor(date.year, season, day);
        const events = [];

        for (const holiday of this.holidays) {
            if (!this.matchesRecurrence(holiday.recurrence, { season, day, dayOfWeek })) continue;
            events.push({
                id: holiday.id,
                name: holiday.name,
                category: holiday.category,
                icon: holiday.icon,
                description: holiday.description
            });
        }

        for (const entry of this.getBirthdayEntries()) {
            const birthday = this.resolveBirthday(entry, gameTime);
            if (!birthday || birthday.season !== season || birthday.day !== day) continue;
            events.push({
                id: `birthday:${entry.id}`,
                name: `${entry.name}'s Birthday`,
                category: 'birthday',
                icon: this.getCategory('birthday').icon,
                description: `${entry.name} was born on this day.`,
                entityId: entry.id
            });
        }

        return events;
    }

    static matchesRecurrence(recurrence, on) {
        switch (recurrence.type) {
            case 'weekly':
                return String(recurrence.dayOfWeek).toLowerCase() === String(on.dayOfWeek).toLowerCase();
            case 'annual':
                return String(recurrence.season).toLowerCase() === on.season &&
                    Number(recurrence.day) === on.day;
            default:
                return false;
        }
    }

    /**
     * One whole season at once, as `day → events`. The panel draws a season grid,
     * so asking day by day from outside would mean walking the roster once per
     * square.
     */
    static getEventsForSeason(year, season, gameTime = GameTime.instance) {
        const byDay = new Map();
        if (!gameTime) return byDay;

        for (let day = 1; day <= gameTime.config.daysPerSeason; day++) {
            const events = this.getEventsForDate({ year, season, day }, gameTime);
            if (events.length > 0) byDay.set(day, events);
        }
        return byDay;
    }

    /**
     * The next few dates with something on them, starting from today. This is
     * why the calendar can say "in 3 days" without doing its own date walking.
     */
    static getUpcoming(limit = 3, gameTime = GameTime.instance, lookaheadDays = null) {
        if (!gameTime) return [];

        const today = gameTime.getCurrentDate();
        const horizon = lookaheadDays ?? gameTime.getDaysPerYear();
        const todayTotal = gameTime.getTotalDaysFor(today.year, today.season, today.day);
        const upcoming = [];

        let cursor = { ...today };
        for (let offset = 0; offset <= horizon && upcoming.length < limit; offset++) {
            const events = this.getEventsForDate(cursor, gameTime);
            if (events.length > 0) {
                upcoming.push({
                    date: { ...cursor },
                    daysAway: gameTime.getTotalDaysFor(cursor.year, cursor.season, cursor.day) - todayTotal,
                    events
                });
            }
            cursor = this.nextDay(cursor, gameTime);
        }

        return upcoming;
    }

    static nextDay(date, gameTime = GameTime.instance) {
        if (date.day < gameTime.config.daysPerSeason) {
            return { ...date, day: date.day + 1 };
        }
        return { ...gameTime.offsetSeason(date.year, date.season, 1), day: 1 };
    }

    static humanize(value) {
        const text = String(value ?? '').replace(/[-_]+/g, ' ');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }
}
