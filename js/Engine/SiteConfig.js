/**
 * SiteConfig — single source of truth for all tunable simulation values.
 *
 * Adjust values here to change how quickly stats decay/recover, how restful
 * different objects feel, how the AI perceives and weights its world, and how
 * the game clock runs. Individual objects and myte definitions can declare
 * their own overrides on top of these defaults.
 */
const SiteConfig = Object.freeze({

    // ── Myte stat rates ───────────────────────────────────────────────────────

    stats: Object.freeze({
        // Energy decay while moving (per ms of delta)
        energyDecayRate: 0.0005,

        // Base energy regen while idle/standing still (per ms)
        energyRegenRate: 0.002,

        // Energy regen rate while resting on a surface (per ms).
        // Individual objects multiply this with their restEnergyRegenMultiplier.
        // At 0.0015 a myte fills from 0→100 in ~67 seconds of bed rest.
        bedRestEnergyRegenRate: 0.0015,

        // Energy regen rate while parked in home slot (per ms).
        // Slower than bed rest — home slot is passive recovery, not active sleep.
        homeSlotEnergyRegenRate: 0.003,

        // Mood decay rate while active (per ms)
        moodDecayRate: 0.0005,

        // Mood decay is reduced to this fraction while in home slot
        homeSlotMoodDecayMultiplier: 0.18,

        // Scales all behavior-drive (boredom/comfort/confidence) update rates
        behaviorDriveRate: 0.42,

        // Behavior drives update slower while parked in home slot
        homeSlotBehaviorRateMultiplier: 0.55,

        // Comfort/confidence slowly improve just from being in the home slot
        homeSlotComfortBoostRate: 0.0011,
        homeSlotConfidenceBoostRate: 0.00055,

        // Energy threshold at which exhaustion effects clear
        exhaustionRecoveryThreshold: 12,

        // How long before the same need-signal fires again (ms)
        needSignalCooldown: 45000,

        // Full-charge announcement cooldown (ms) and reset threshold
        fullChargeAnnounceCooldown: 30000,
        fullChargeResetThreshold: 0.94,

        // Energy must be below this value (0–100) to initiate resting on a surface.
        // Prevents mytes from using rest slots when they don't need recovery.
        restEnergyThreshold: 90,

        // Minimum time (ms) a myte must stay on a rest surface before it can exit,
        // even if restUntilFull is true and energy is already full.
        minRestDuration: 2000,
    }),

    // ── Food defaults ─────────────────────────────────────────────────────────
    // Applied when the myte finishes eating food from the ground.
    // Inventory hand-feeding uses inventory.itemTypes below.

    food: Object.freeze({
        energyRestore: 20,
        moodBoost: 8,
        healthRestore: 3,
    }),

    // ── Inventory ─────────────────────────────────────────────────────────────

    inventory: Object.freeze({
        maxItems:    50,
        stackSize:   99,
        feedCooldown: 2000,

        // Per-type effects when an item is dragged from inventory onto a Myte.
        // moodBoost is separate from food.moodBoost (hand-feeding vs ground eating).
        itemTypes: Object.freeze({
            FOOD:     Object.freeze({ moodBoost: 15, expressions: ['eat'],                consumeTime: 1000 }),
            TOY:      Object.freeze({ moodBoost: 10, expressions: ['play', 'happy'],      consumeTime: 2000 }),
            MEDICINE: Object.freeze({ moodBoost: 5,  expressions: ['surprised', 'happy'], consumeTime: 1500 }),
            FLOWER:   Object.freeze({ moodBoost: 6,  expressions: ['happy'],              consumeTime: 1200 }),
            HEALTH:   Object.freeze({ moodBoost: 5,  expressions: ['surprised', 'happy'], consumeTime: 1500 }),
        }),
    }),

    // ── Object interaction flags ──────────────────────────────────────────────

    objects: Object.freeze({
        // Set to true to allow R-key rotation during drag.
        // Keep false while art for rotated variants isn't ready.
        canRotate: false,
    }),

    // ── World defaults ────────────────────────────────────────────────────────

    world: Object.freeze({
        defaultMap: 'House',
    }),

    // ── Myte defaults ─────────────────────────────────────────────────────────

    myte: Object.freeze({

        // Default animation frame rate for sprite sheets
        defaultAnimationFPS: 8,

        // How long a myte must be motionless before becoming inactive (ms)
        inactiveTimeout: 8000,

        // Starting stat values for a freshly spawned myte
        initialStats: Object.freeze({
            energy:     75,
            boredom:    28,
            comfort:    72,
            confidence: 58,
        }),

        // Thresholds that gate behavior, effects, and UI state
        thresholds: Object.freeze({
            // Battery display level cutoffs (% of maxEnergy)
            batteryLevels: Object.freeze([
                Object.freeze({ name: 'empty',  threshold: 0  }),
                Object.freeze({ name: 'low',    threshold: 30 }),
                Object.freeze({ name: 'medium', threshold: 60 }),
                Object.freeze({ name: 'full',   threshold: 90 }),
            ]),

            // Min per-ms regen rate to count as rapid charging
            rapidCharging: 0.01,

            // Energy below which walking speed is penalized
            lowEnergyThreshold:       20,
            lowEnergySpeedMultiplier: 0.7,

            // Speed multiplier applied when energy hits zero (exhausted)
            exhaustionSpeedMultiplier: 0.4,

            // Mood values that trigger the sad / happy state rolls
            moodLow:  20,
            moodHigh: 80,
        }),

        // Conditions under which each need-signal speech bubble fires
        needSignals: Object.freeze({
            energyLow:          14,   // energy ≤ this triggers "sleepy..."
            comfortLow:         24,   // comfort ≤ this triggers "cozy?"
            moodLow:            20,   // mood ≤ this triggers "sad..."
            boredomHigh:        92,   // boredom ≥ this (combined with below) triggers "bored..."
            boredomMoodCap:     68,   // mood must also be ≤ this for boredom signal
            boredomDecisionAge: 20000, // AI must also have been idle at least this long (ms)
        }),

        // Timing / cooldown values for sound, interaction, and battery UI
        cooldowns: Object.freeze({
            sound:             8000,
            interaction:       5000,
            // How long the battery icon stays visible after a level change
            batteryHideLow:    5000,
            batteryHideMedium: 6000,
            batteryHideFull:   3000,
        }),

        // Default mood state definitions. Individual myte definitions can
        // override the whole map via statConfig.moods.
        moods: Object.freeze({
            happy:   Object.freeze({ duration: 10000, speedMultiplier: 1.2, expression: 'happy'   }),
            sad:     Object.freeze({ duration: 15000, speedMultiplier: 0.8, expression: 'sad'     }),
            excited: Object.freeze({ duration: 8000,  speedMultiplier: 1.5, expression: 'excited' }),
            sleepy:  Object.freeze({ duration: 12000, speedMultiplier: 0.7, expression: 'sleepy'  }),
            grumpy:  Object.freeze({ duration: 10000, speedMultiplier: 0.9, expression: 'grumpy'  }),
            neutral: Object.freeze({ duration: 5000,  speedMultiplier: 1.0, expression: 'neutral' }),
        }),
    }),

    // ── AI defaults ───────────────────────────────────────────────────────────

    ai: Object.freeze({

        // Decision loop timing (ms)
        timing: Object.freeze({
            baseThinkInterval:      900,
            minThinkInterval:       450,
            maxThinkInterval:       1800,
            // How long completed actions stay in memory
            memoryDuration:         120000,
            // Minimum age before a previously visited target regains full novelty
            targetCooldownDuration: 30000,
            // Window over which repeat history penalties accumulate
            repeatWindow:           90000,
        }),

        // Perception radii (px)
        radii: Object.freeze({
            wander:       220,
            home:         320,
            objectSearch: 280,
            social:       240,
            play:         220,
            homeComfort:  140,
        }),

        // Candidate selection and repeat-penalty tuning
        scoring: Object.freeze({
            // Minimum score for a candidate to be considered at all
            minCandidateScore:      12,
            // Shortlist includes all candidates within this many points of best
            shortlistScoreWindow:   12,
            // Score multiplier when the same label is picked twice in quick succession
            repeatLabelMultiplier:  0.68,
            repeatLabelWindow:      6000,   // ms
            // Score multiplier when the same target is picked twice quickly
            repeatTargetMultiplier: 0.74,
            repeatTargetWindow:     12000,  // ms
            // Flat deductions per history entry (scaled by recency)
            historyLabelPenalty:    12,
            historyTargetPenalty:   18,
        }),
    }),

    // ── Game time ─────────────────────────────────────────────────────────────

    time: Object.freeze({
        // Real-time minutes for one full game day
        dayDurationInMinutes: 5,
        daysPerSeason:        28,
    }),
});
