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
        // At 0.0009 with movement multiplier (1.2×): ~75 seconds of walking drains ~81 energy.
        energyDecayRate: 0.0009,

        // Drain multiplier applied to stationary active actions (inspect, eat, interact, etc.)
        // Keeps them cheaper than walking but still meaningful. 0 = free, 1 = same as moving.
        actionEnergyDrainFactor: 0.38,

        // Base energy regen while truly idle/standing still (per ms) — very slow.
        // Real recovery requires resting on a surface or the home slot.
        // At 0.0003: recovering 100 energy takes ~5.5 minutes of doing nothing.
        energyRegenRate: 0.0003,

        // Energy regen rate while resting on a surface (per ms).
        // Individual objects multiply this with their restEnergyRegenMultiplier.
        // At 0.002 a myte fills from 0→100 in ~50 seconds of bed rest.
        bedRestEnergyRegenRate: 0.002,

        // Energy regen rate while parked in home slot (per ms).
        // Home slot is passive recovery — faster than idle, slower than bed rest.
        homeSlotEnergyRegenRate: 0.003,

        // Mood decay rate while active (per ms)
        moodDecayRate: 0.0005,

        // Mood decay is reduced to this fraction while in home slot
        homeSlotMoodDecayMultiplier: 0.18,

        // Scales all behavior-drive (boredom/comfort/confidence) update rates
        behaviorDriveRate: 0.42,

        // Behavior drives update slower while parked in home slot
        homeSlotBehaviorRateMultiplier: 0.55,

        // Home slot stasis recovery rates (per ms).
        // These must overcome the competing decay in updateBehaviorDrives (still runs at 0.55×).
        // Net positive ensures every stat slowly fills while docked.
        homeSlotComfortBoostRate:    0.0011,
        homeSlotConfidenceBoostRate: 0.00055,
        homeSlotFunRestoreRate:      0.0030,  // beats resting fun decay (~0.0014/ms), net ~+0.002/ms
        homeSlotSocialRestoreRate:   0.0008,  // beats social decay (~0.0004/ms), net ~+0.0004/ms
        homeSlotHungerRestoreRate:   0.0025,  // beats hunger decay (~0.0017/ms), net ~+0.0008/ms

        // Stat-condition modifiers on energy drain rate.
        // hungerDrainScale: fraction of extra drain added at 0 hunger (starving). 0.3 = +30%.
        hungerDrainScale: 0.30,
        // healthDrainScale: fraction of extra drain added at 0 health (critical). 0.25 = +25%.
        healthDrainScale: 0.25,
        // wellConditionedThreshold/Scale: above this health ratio, drain is reduced.
        // At full health (1.0): (1.0 - 0.8) * 0.40 = 0.08 → 8% discount.
        wellConditionedThreshold: 0.8,
        wellConditionedBonusScale: 0.40,

        // Energy threshold at which exhaustion effects clear
        exhaustionRecoveryThreshold: 12,

        // Energy ratio below which exhaustion cascade starts (0.30 = 30% energy).
        // Penalty scales linearly from 0 at threshold to 1.0 at 0% energy.
        exhaustionPenaltyThreshold: 0.30,

        // Per-stat decay bonuses applied at full exhaustion (energy = 0).
        // Each scales with _getExhaustionPenalty() — e.g. at 15% energy, penalty = 0.5.
        exhaustionCascade: Object.freeze({
            healthDrainPerMs:     0.00018,  // extra damage/ms; at full → ~10.8 health/min net loss
            hungerDecayScale:     0.50,     // up to +50% faster hunger decay
            funDecayScale:        0.60,     // up to +60% faster fun decay
            socialDecayScale:     0.35,     // up to +35% faster social decay
            comfortDrainPerMs:    0.0006,   // direct comfort drain/ms at full penalty
            confidenceDrainPerMs: 0.000018, // direct confidence drain/ms at full penalty
        }),

        // Passive health regen per ms (active) — 1.5× in home slot
        healthRegenRate: 0.000025,

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

        // Activity completion and live-action rewards.
        // Positive boredom values increase boredom; negative values reduce it.
        activityRewards: Object.freeze({
            moodEffectMultiplier: 0.32,
            missingNeedMultiplier: 0.7,
            categories: Object.freeze({
                default:   Object.freeze({ mood: 0.3, boredom: -0.4, comfort: 0.1, confidence: 0.1 }),
                movement:  Object.freeze({ mood: 0.45, boredom: -1.3, comfort: 0.0, confidence: 0.2 }),
                state:     Object.freeze({ mood: 0.8, boredom: -1.0, comfort: 0.35, confidence: 0.2 }),
                interactions: Object.freeze({ mood: 0.65, boredom: -2.4, comfort: 0.2, confidence: 0.35 }),
                play:      Object.freeze({ mood: 1.4, boredom: -6.5, comfort: 0.2, confidence: 0.8 }),
                social:    Object.freeze({ mood: 1.0, boredom: -3.2, comfort: 0.55, confidence: 0.6 }),
                carrying:  Object.freeze({ mood: 0.35, boredom: -0.8, comfort: 0.0, confidence: 0.15 }),
                reactive:  Object.freeze({ mood: -0.8, boredom: 1.2, comfort: -0.35, confidence: -0.45 }),
                idle:      Object.freeze({ mood: 0.0, boredom: 0.0, comfort: 0.0, confidence: 0.0 }),
            }),
            microInteractions: Object.freeze({
                ballBump: Object.freeze({
                    id: 'ball_bump',
                    category: 'play',
                    affectsMood: true,
                    fun: 16,
                    energy: -10,
                    rewardScale: 0.42
                }),
            }),
            liveMoodRates: Object.freeze({
                play: 0.0011,
                social: 0.00075,
                stimulating: 0.00055,
                movement: 0.00018,
                idle: -0.0002
            }),
        }),
    }),

    // ── Food defaults ─────────────────────────────────────────────────────────
    // Applied when the myte finishes eating food from the ground.
    // Inventory hand-feeding uses inventory.itemTypes below.

    food: Object.freeze({
        energyRestore: 20,
        moodBoost: 8,
        healthRestore: 3,
        // How long the Nourished buff lasts after eating world food (ms).
        // Eating another food item replaces the timer. Better food should declare
        // a higher saturationMs in its object config to override this default.
        saturationMs: 90000,
    }),

    // ── Inventory ─────────────────────────────────────────────────────────────

    inventory: Object.freeze({
        maxItems:    50,
        stackSize:   99,
        feedCooldown: 2000,

        // Per-type effects when an item is dragged from inventory onto a Myte.
        // moodBoost is separate from food.moodBoost (hand-feeding vs ground eating).
        itemTypes: Object.freeze({
            FOOD:     Object.freeze({ moodBoost: 15, expressions: ['eat'],                consumeTime: 1000, saturationMs: 60000 }),
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
        defaultMap: 'Outside',
    }),

    // ── Myte defaults ─────────────────────────────────────────────────────────

    myte: Object.freeze({

        // Default animation frame rate for sprite sheets
        defaultAnimationFPS: 8,

        // How long a myte must be motionless before becoming inactive (ms)
        inactiveTimeout: 8000,

        // Radius (px) within which another active myte grants companionship_aura
        companionRadius: 120,

        // Starting stat values for a freshly spawned myte
        initialStats: Object.freeze({
            energy:     75,
            fun:        70,
            social:     80,
            hunger:     100,
            comfort:    72,
            confidence: 0.55,
        }),

        // Thresholds that gate behavior, effects, and UI state
        thresholds: Object.freeze({
            // Battery display level cutoffs (% of maxEnergy).
            // animation: CSS class applied while the icon is shown at this level.
            // hideDelay: ms until the icon auto-hides (null = never auto-hide).
            batteryLevels: Object.freeze([
                Object.freeze({ name: 'empty',  threshold: 0,  animation: 'critical-pulse', hideDelay: null  }),
                Object.freeze({ name: 'low',    threshold: 20, animation: 'blinking',       hideDelay: 5000  }),
                Object.freeze({ name: 'medium', threshold: 50, animation: null,             hideDelay: 6000  }),
                Object.freeze({ name: 'full',   threshold: 70, animation: null,             hideDelay: 3000  }),
            ]),

            // Min per-ms regen rate to count as rapid charging
            rapidCharging: 0.01,

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

        // Timing / cooldown values for sound and interaction
        cooldowns: Object.freeze({
            sound:             8000,
            interaction:       5000,
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

        zoneSeeking: Object.freeze({
            searchRadius: 320,
            travelCommitmentMs: 2200,
            distanceWeight: 0.06,
            typeScores: Object.freeze({
                play:   Object.freeze({ need: 'play',    base: 10, weight: 52, secondaryNeed: 'enrichment', secondaryWeight: 10, minNeed: 0.34 }),
                social: Object.freeze({ need: 'social',  base: 9,  weight: 48, secondaryNeed: 'play',       secondaryWeight: 8,  minNeed: 0.3 }),
                rest:   Object.freeze({ need: 'comfort', base: 8,  weight: 42, secondaryNeed: 'home',       secondaryWeight: 18, minNeed: 0.28 }),
            })
        }),
    }),

    zones: Object.freeze({
        defaults: Object.freeze({
            active: true,
            visible: false,
            strength: 1.0,
            cooldown: 0,
            threshold: 'halfway'
        }),
        types: Object.freeze({
            rest: Object.freeze({
                stay: Object.freeze({
                    moodPerMs: 0.00045,
                    boredomPerMs: -0.00055,
                    comfortPerMs: 0.00085,
                    confidencePerMs: 0.0002
                })
            }),
            play: Object.freeze({
                enterActionChance: 0.2,
                stay: Object.freeze({
                    moodPerMs: 0.00065,
                    boredomPerMs: -0.0015,
                    comfortPerMs: 0.0001,
                    confidencePerMs: 0.0004
                })
            }),
            social: Object.freeze({
                stay: Object.freeze({
                    moodPerMs: 0.00045,
                    boredomPerMs: -0.00085,
                    comfortPerMs: 0.00035,
                    confidencePerMs: 0.00065
                })
            }),
            boost: Object.freeze({
                stay: Object.freeze({
                    moodPerMs: 0,
                    boredomPerMs: 0,
                    comfortPerMs: 0,
                    confidencePerMs: 0
                })
            })
        })
    }),

    // ── Camera ────────────────────────────────────────────────────────────────

    camera: Object.freeze({
        // Follow mode used when no Myte is active (e.g. after deactivation or undeploy)
        defaultFollowMode: 'CURSOR_EDGE',   // key of CAMERA_FOLLOW_MODES

        // Movement easing (higher = slower/smoother)
        easing:         10,
        draggingEasing: 20,
        zoomEasing:     5,

        // Zoom limits and scroll wheel step
        minZoom:  0.5,
        maxZoom:  2.5,
        zoomStep: 0.1,

        // CURSOR_EDGE: fraction of viewport that counts as the trigger zone (0–1)
        edgeThreshold: 0.20,

        // LEASH: myte must drift beyond this fraction of the viewport before camera moves
        leashThreshold: 0.28,

        // OVERVIEW: world-space padding (px) added around the myte bounding box
        overviewPadding: 120,

        // CINEMATIC: pan cycle speed (radians per second — lower is slower)
        cinematicSpeed: 0.1,
    }),

    // ── Game time ─────────────────────────────────────────────────────────────

    time: Object.freeze({
        // Real-time minutes for one full game day
        dayDurationInMinutes: 5,
        daysPerSeason:        28,
        initialDate: Object.freeze({
            year: 1,
            season: 'spring',
            day: 1,
            hour: 8,
            minute: 0,
        }),
    }),
});
