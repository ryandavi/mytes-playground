// ─────────────────────────────────────────────────────────────────────────────
// CalendarPanel — the year as the world keeps it, opened by clicking the clock.
//
// One season at a time, laid out as a week grid: the columns are the days of the
// week from SiteConfig, the squares are the days of the season, and anything
// happening on a day shows as a dot on that square. Paging moves whole seasons,
// forward into the future as far as SiteConfig.time.calendar allows, because the
// question a player actually has is "when is the next festival?" rather than
// "what happened last year".
//
// The panel computes no dates of its own. GameTime says what day it is and what
// weekday any date falls on; CalendarRegistry says what happens then. This class
// only decides what that looks like.
// ─────────────────────────────────────────────────────────────────────────────

class CalendarPanel extends ModalWindow {
    static MAX_DAY_MARKS = 3;

    constructor(parent) {
        super(parent, {
            id: 'calendar-panel',
            buttonId: 'header-clock-button',
            closeOnOutsideClick: false,
            position: 'top-right',
            draggable: true,
            closeButtonSelector: '.modal-close-btn'
        });

        // Which season is on screen, and which square is picked out. Both are
        // set from the clock the first time the panel opens.
        this.viewYear = null;
        this.viewSeason = null;
        this.selectedDay = null;
        this.init();
    }

    // ModalWindow owns `this.container`, so the game container needs its own name.
    get gameContainer() {
        return this.parent.parent;
    }

    get gameTime() {
        return this.gameContainer?.core?.gameTime ?? null;
    }

    init() {
        super.init();
        if (!this.modalElement) return;

        this.titleElement = this.modalElement.querySelector('.calendar__title');
        this.weekdaysElement = this.modalElement.querySelector('.calendar__weekdays');
        this.gridElement = this.modalElement.querySelector('.calendar__grid');
        this.detailElement = this.modalElement.querySelector('.calendar__detail');
        this.upcomingElement = this.modalElement.querySelector('.calendar__upcoming');

        this.modalElement.querySelectorAll('[data-calendar-step]').forEach(button => {
            button.addEventListener('click', () => this.stepSeason(Number(button.dataset.calendarStep)));
        });
        // The readout between the steps is the reset, the way the zoom stepper's
        // percentage is — a separate "Today" button was a second control saying
        // what the first one already reads.
        this.titleElement?.addEventListener('click', () => this.goToToday());
    }

    // Always open on today, whatever season was left on screen last time —
    // the clock is what the player just clicked, so that is what they meant.
    open() {
        this.goToToday();
        super.open();
    }

    goToToday() {
        const today = this.gameTime?.getCurrentDate();
        if (!today) return;
        this.viewYear = today.year;
        this.viewSeason = today.season;
        this.selectedDay = today.day;
        this.render();
    }

    // Paging is clamped rather than the buttons being merely disabled-looking:
    // there is nothing before year 1, and no point charting a decade ahead.
    stepSeason(offset) {
        const gameTime = this.gameTime;
        if (!gameTime || !offset) return;

        const target = gameTime.offsetSeason(this.viewYear, this.viewSeason, offset);
        const today = gameTime.getCurrentDate();
        const distance = gameTime.getSeasonDistance(today.year, today.season, target.year, target.season);
        const bounds = SiteConfig.time.calendar;
        if (distance > bounds.seasonsAhead || distance < -bounds.seasonsBehind) return;
        if (target.year < 1) return;

        this.viewYear = target.year;
        this.viewSeason = target.season;
        // A day picked in one season means nothing in the next; keep the number
        // so paging back and forth lands where it started.
        this.render();
    }

    render() {
        const gameTime = this.gameTime;
        if (!gameTime || !this.gridElement) return;

        const eventsByDay = CalendarRegistry.getEventsForSeason(this.viewYear, this.viewSeason, gameTime);
        this.renderTitle();
        this.renderWeekdays(gameTime);
        this.renderGrid(gameTime, eventsByDay);
        this.renderDetail(gameTime, eventsByDay);
        this.renderUpcoming(gameTime);
        this.syncStepButtons(gameTime);
    }

    renderTitle() {
        if (!this.titleElement) return;
        this.titleElement.querySelector('.calendar__year').textContent = `Year ${this.viewYear}`;
        this.titleElement.querySelector('.calendar__season').textContent =
            CalendarRegistry.humanize(this.viewSeason);
    }

    renderWeekdays(gameTime) {
        if (!this.weekdaysElement) return;
        this.weekdaysElement.replaceChildren(...gameTime.config.daysOfTheWeek.map(name => {
            const cell = document.createElement('span');
            cell.className = 'calendar__weekday';
            // Three letters is what fits a square; the full name stays as the title.
            cell.textContent = name.slice(0, 3);
            cell.title = name;
            return cell;
        }));
    }

    renderGrid(gameTime, eventsByDay) {
        const week = gameTime.config.daysOfTheWeek;
        const daysPerSeason = gameTime.config.daysPerSeason;
        const today = gameTime.getCurrentDate();
        const todayTotal = gameTime.getTotalDaysFor(today.year, today.season, today.day);

        this.gridElement.style.setProperty('--calendar-columns', week.length);

        // The first of the season need not be a Monday: the weekday of day 1
        // decides how many blank squares the grid opens with.
        const firstWeekday = gameTime.getDayOfWeekFor(this.viewYear, this.viewSeason, 1);
        const lead = Math.max(0, week.indexOf(firstWeekday));

        const cells = [];
        for (let index = 0; index < lead; index++) {
            const blank = document.createElement('span');
            blank.className = 'calendar__day is-blank';
            blank.setAttribute('aria-hidden', 'true');
            cells.push(blank);
        }

        for (let day = 1; day <= daysPerSeason; day++) {
            const events = eventsByDay.get(day) ?? [];
            const total = gameTime.getTotalDaysFor(this.viewYear, this.viewSeason, day);

            // A button for the keyboard and the screen reader, but not a
            // button to the eye — see the .calendar__day block for why the
            // squares are printed numbers rather than 28 bevelled controls.
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'calendar__day';
            cell.dataset.day = String(day);
            cell.classList.toggle('is-today', total === todayTotal);
            cell.classList.toggle('is-past', total < todayTotal);
            cell.classList.toggle('is-selected', day === this.selectedDay);
            cell.classList.toggle('has-events', events.length > 0);

            const number = document.createElement('span');
            number.className = 'calendar__day-number';
            number.textContent = String(day);
            cell.appendChild(number);

            if (events.length > 0) {
                // Three dots is as many as a square holds; past that the count
                // stops meaning anything and the row runs out of the cell. The
                // tooltip and the day detail still name every one of them.
                const dots = document.createElement('span');
                dots.className = 'calendar__day-marks';
                for (const event of events.slice(0, CalendarPanel.MAX_DAY_MARKS)) {
                    const dot = document.createElement('span');
                    dot.className = `calendar__mark is-${event.category}`;
                    dots.appendChild(dot);
                }
                cell.appendChild(dots);
                cell.title = events.map(event => event.name).join(' · ');
            }

            cell.addEventListener('click', () => {
                this.selectedDay = day;
                this.render();
            });
            cells.push(cell);
        }

        this.gridElement.replaceChildren(...cells);
    }

    renderDetail(gameTime, eventsByDay) {
        if (!this.detailElement) return;

        const day = this.selectedDay;
        const events = eventsByDay.get(day) ?? [];
        const weekday = gameTime.getDayOfWeekFor(this.viewYear, this.viewSeason, day);

        const head = document.createElement('div');
        head.className = 'panel-detail__head';
        const heading = document.createElement('h3');
        heading.className = 'panel-detail__title';
        heading.textContent = `${weekday}, day ${day}`;
        const season = document.createElement('span');
        season.className = 'panel-detail__caption';
        season.textContent = `${CalendarRegistry.humanize(this.viewSeason)}, Year ${this.viewYear}`;
        head.append(heading, season);

        const body = document.createElement('div');
        body.className = 'panel-detail__body';
        if (events.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'window-empty-state window-empty-state--compact';
            empty.textContent = 'Nothing marked on this day.';
            body.appendChild(empty);
        } else {
            // The event is named and then glossed, which is the shared list's
            // --named form — the same shape the keyboard legends take.
            body.appendChild(DetailRows.build(events.map(event => ({
                label: event.name,
                value: event.description || CalendarRegistry.getCategory(event.category).label
            })), { className: 'detail-rows--named' }));
        }

        this.detailElement.replaceChildren(head, body);
    }

    // What is coming stands beside the calendar rather than under the day you
    // happen to have picked: it does not change when you click about the grid,
    // and it is the answer to the question that made you open the panel.
    renderUpcoming(gameTime) {
        if (!this.upcomingElement) return;

        const upcoming = CalendarRegistry.getUpcoming(4, gameTime);
        const heading = document.createElement('h4');
        heading.className = 'calendar__upcoming-title';
        heading.textContent = 'Coming up';

        if (upcoming.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'window-empty-state window-empty-state--compact';
            empty.textContent = 'Nothing on the horizon.';
            this.upcomingElement.replaceChildren(heading, empty);
            return;
        }

        const list = document.createElement('ul');
        list.className = 'calendar__upcoming-list';
        for (const entry of upcoming) {
            const item = document.createElement('li');
            item.className = 'calendar__upcoming-item';

            const when = document.createElement('span');
            when.className = 'calendar__upcoming-when';
            when.textContent = this.formatDaysAway(entry.daysAway);

            const what = document.createElement('span');
            what.className = 'calendar__upcoming-what';
            for (const event of entry.events) {
                const line = document.createElement('span');
                line.className = `calendar__upcoming-event is-${event.category}`;
                line.textContent = event.name;
                what.appendChild(line);
            }

            item.append(when, what);
            list.appendChild(item);
        }

        this.upcomingElement.replaceChildren(heading, list);
    }

    formatDaysAway(days) {
        if (days === 0) return 'Today';
        if (days === 1) return 'Tomorrow';
        return `In ${days} days`;
    }

    syncStepButtons(gameTime) {
        const today = gameTime.getCurrentDate();
        const bounds = SiteConfig.time.calendar;

        this.modalElement?.querySelectorAll('[data-calendar-step]').forEach(button => {
            const step = Number(button.dataset.calendarStep);
            const target = gameTime.offsetSeason(this.viewYear, this.viewSeason, step);
            const distance = gameTime.getSeasonDistance(today.year, today.season, target.year, target.season);
            button.disabled = target.year < 1 ||
                distance > bounds.seasonsAhead ||
                distance < -bounds.seasonsBehind;
        });
    }

    dispose() {
        this.titleElement = null;
        this.weekdaysElement = null;
        this.gridElement = null;
        this.detailElement = null;
        this.upcomingElement = null;
        super.dispose();
    }
}
