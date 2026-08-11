/**
 * SiteConfig — single source of truth for all tunable simulation values.
 *
 * Adjust values here to change how quickly stats decay/recover, how restful
 * different objects feel, how the AI perceives and weights its world, and how
 * the game clock runs. Individual objects and myte definitions can declare
 * their own overrides on top of these defaults.
 */
const SiteConfig = Object.freeze({
    mapRendering: Object.freeze({
        canvasPaddingCells: Object.freeze({ top: 1, right: 1, bottom: 1, left: 1 }),
    }),

    // Experimental semantic wall renderer. Turning this off restores the
    // legacy behavior: authored wall tiles are baked into the background and
    // no wall geometry, LOS data, controls, or persistence are created.
	floorSystem: Object.freeze({
		enabled: true,
		materialsPath: 'data/map-objects/floor-materials.json',
		// A room with no authored floorFinishId keeps whatever the map's own
		// tile layers already draw. Customisation is opt-in per room, so adding
		// the system changes nothing until a room asks for it.
		defaultFinishId: null,
		// Grow each room's floor by this many cells so it runs UNDER the wall
		// that encloses it. A room's bounds stop one cell short of that wall,
		// and the wall covers only its centred thickness, so without any bleed a
		// strip of the map's own ground shows along every outer edge.
		//
		// Half a cell, because that is the wall's CENTRELINE: the wall is
		// `thickness` centred in its cell, so its middle sits at
		// (cell - thickness) / 2 + thickness / 2 = cell / 2, whatever the
		// thickness is. The floor therefore ends buried under the wall — no
		// ground strip inside, and nothing spilling past the wall's outer face
		// onto the exterior, which is what a full cell did.
		edgeBleedCells: 0.5
	}),

	wallSystem: Object.freeze({
		enabled: true,
		extendCanvasForWallHeight: true,
        materialsPath: 'data/map-objects/wall-materials.json',
        wallTilesetProperty: 'wallTileset',
        wallWangSetName: 'Wall',
        defaultConstructionId: 'plaster_wall',
        defaultFinishId: 'plaster_plain',
        defaultHeightCells: 5,
        defaultPresentation: 'cutaway',
        presentationModes: Object.freeze(['up', 'down', 'cutaway', 'hidden']),
        cursorCutawayEnabled: true,
        // Wall openings declare their footprint, but a sprite may carry a
        // little transparent margin around its frame; clearing the whole
        // footprint would then show a gap of missing wall around it. The hole
        // shrinks by this much — per side, and only where the opening does not
        // meet the floor. Objects override it with wallOpeningConfig.apertureInset,
        // which must be at least as large as their art's transparent margin.
        apertureInsetPx: 1,
        cutawayDebounceMs: 180,
        maxGeneratedNodes: 300,

        // Cutaway engine v2 (per-cell state + authored transition frames). A
        // front wall only cuts when it actually covers the subject on screen,
        // and only over the cells that do the covering. There is no animation:
        // a cell is standing or lowered, and the frame that joins the two is
        // drawn art, so the transition always reads the same way.
        occlusionMarginPx: 48,          // slack on "does the full wall cover the subject"
        cutawayPaddingCells: 1,         // reveal this much extra either side of the subject
        cutawayLowerDelayMs: 80,        // a cell must stay occluding this long before it drops
        cutawayRaiseDelayMs: 300,       // ...and stay clear this long before it comes back up
        cutawayEvaluateThrottleMs: 100, // minimum spacing between occlusion re-evaluations
        // Side (east/west) runs stay full height for now; reserved for a later phase.
        sideWallOcclusion: false,
    }),

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

        // Scales all behavior-drive (boredom/comfort/confidence) update rates
        behaviorDriveRate: 0.42,

        // How often (ms) behavior drives and buff stat effects are recalculated.
        // All calculations are deltaTime-scaled so batching is mathematically equivalent.
        // Lower = more responsive; higher = cheaper. 100ms is imperceptible.
        behaviorDriveTickInterval: 100,

        // Behavior drives update slower while parked in home slot
        homeSlotBehaviorRateMultiplier: 0.55,

        // Home-slot recovery rates (per ms), applied after the 0.55× behavior-drive pass.
        // Idle fun loses ~0.000143/ms while docked, so its 0.00025 restore nets
        // ~0.000107/ms (about 16 minutes from empty). Alone social and satiety each
        // net ~0.000085/ms (about 20 minutes from empty).
        homeSlotComfortBoostRate:    0.00025,
        homeSlotConfidenceBoostRate: 0.0000055,
        homeSlotFunRestoreRate:      0.00025,
        homeSlotSocialRestoreRate:   0.0001,
        homeSlotSatietyRestoreRate:  0.0001,
        // Health remains the slowest serious recovery: 0→100 takes about 17 minutes.
        homeSlotHealthRegenRate:     0.0001,

        // Stat-condition modifiers on energy drain rate.
        // satietyDrainScale: fraction of extra energy drain at 0 satiety (starving). 0.3 = +30%.
        satietyDrainScale: 0.30,
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
            healthDrainPerMs:     0.00004,  // extra damage/ms; at full → ~2.4 health/min before passive regen
            satietyDecayScale:    0.50,     // up to +50% faster satiety decay when exhausted
            funDecayScale:        0.60,     // up to +60% faster fun decay
            socialDecayScale:     0.35,     // up to +35% faster social decay
            comfortDrainPerMs:    0.00015,  // direct comfort drain/ms at full penalty
            confidenceDrainPerMs: 0.000018, // direct confidence drain/ms at full penalty
        }),

        // Scale applied to all noteBehavior / applyActionResult stat deltas
        noteBehaviorScale: 0.45,

        // Per-ms blend rate for the confidence passive drift toward its wellbeing target
        confidenceBlendRate: 0.0013,

        // Passive need decay rates (per ms) while deployed
        funDecayRate: 0.0002,
        socialDecayRate: 0.00013,
        satietyDecayRate: 0.000066,

        // Per-ms blend rate for comfort drifting toward its environmental target
        comfortBlendRate: 0.0016,

        // Energy ratio at/below which the myte counts as exhausted
        exhaustionThreshold: 0.05,

        // Fun delta rates (per ms) by activity context; species override via ai.funDeltaRates
        funDeltaRates: Object.freeze({
            resting:     0.00022,
            stimulating: 0.00034,
            movement:    0.00006,
            idle:        0.00042,
            default:     0.00008,
            moving:      0.00002,
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

        activityRewards: Object.freeze({
            missingNeedMultiplier: 0.7,
            microInteractions: Object.freeze({
                ballBump: Object.freeze({
                    id: 'ball_bump',
                    category: 'play',
                    fun: 16,
                    energy: -10,
                    rewardScale: 0.42
                }),
            }),
        }),

        // Wellbeing ceilings — emotional stats can't stay high when survival vitals are low.
        // vitalRatio = average(energy, health, satiety) as 0–1 ratios.
        // Each minCap is the stat's floor when vitalRatio = 0 (all vitals depleted).
        // The ceiling scales linearly from minCap (vitalRatio=0) to 1.0 (vitalRatio=1).
        // ceilingDrainRate: fraction of excess above the ceiling drained per ms.
        // starvation: persistently low satiety slowly damages health, independent of exhaustion cascade.
        wellbeing: Object.freeze({
            funMinCap:                  0.15,     // fun floor at 0 vitals (15% of maxFun)
            comfortMinCap:              0.10,     // comfort floor at 0 vitals (10% of maxComfort)
            confidenceMinCap:           0.10,     // confidence floor at 0 vitals (0–1 scale)
            ceilingDrainRate:           0.0008,   // fraction of excess above ceiling drained/ms
            starvationThreshold:        0.15,     // satiety ratio below which starvation begins
            starvationHealthDrainPerMs: 0.00003,  // health/ms at full starvation after the grace period
            starvationGraceMs:          120000,  // starvation must persist for 2 sim-minutes before health drains
        }),
    }),

    // ── Food defaults ─────────────────────────────────────────────────────────
    // Applied when the myte finishes eating food from the ground.
    // Inventory hand-feeding uses inventory.itemTypes below.

    food: Object.freeze({
        effects: Object.freeze({ energy: 20, fun: 8, health: 3, satiety: 0 }),
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
            FOOD:     Object.freeze({
                moodBoost: 15,
                effects: Object.freeze({ satiety: 20, energy: 5, fun: 6, comfort: 4 }),
                expressions: ['eat'],
                consumeTime: 1000,
                saturationMs: 60000
            }),
            TOY:      Object.freeze({ moodBoost: 10, expressions: ['play', 'happy'],      consumeTime: 2000 }),
            MEDICINE: Object.freeze({ moodBoost: 5,  expressions: ['surprised', 'happy'], consumeTime: 1500 }),
            FLOWER:   Object.freeze({ moodBoost: 6,  expressions: ['happy'],              consumeTime: 1200 }),
            HEALTH:   Object.freeze({ moodBoost: 5,  expressions: ['surprised', 'happy'], consumeTime: 1500 }),
        }),
    }),

    debug: Object.freeze({
        currencyPresets: Object.freeze([10, 100, 500, 1000]),
        itemStep: 1,
        statStep: 5,
    }),

    // ── Object interaction flags ──────────────────────────────────────────────

    objects: Object.freeze({
        // Set to true to allow R-key rotation during drag.
        // Keep false while art for rotated variants isn't ready.
        canRotate: false,

        // Aura system defaults — individual types can override via their aura config block.
        aura: Object.freeze({
            // How often (ms) aura objects scan for nearby mytes
            proximityInterval: 500,
            // Default aura radius when not specified in types.json
            defaultRadius: 150,
        }),
    }),

    // ── World defaults ────────────────────────────────────────────────────────

    // Interaction / control defaults
    interaction: Object.freeze({
        // Shared gesture timings used across click/tap handlers.
        gestures: Object.freeze({
            doubleClickInterval: 300,
            longPressDelay: 500,
            tapMaxDuration: 300,
            clickMoveThreshold: 10,
        }),

        // Rubbing/petting gesture tuning, shared by RubbingComponent (map objects)
        // and MyteRubbingHandler (mytes). The over-rub limit differs per context:
        // mytes tolerate more rubs before getting overstimulated.
        rubbing: Object.freeze({
            minRubs: 3,
            rubbingThreshold: 2,
            minTimeBetweenRubs: 5000,
            directionThreshold: 10,
            hapticDuration: 50,
            maxRubsObject: 15,
            maxRubsMyte: 25,
        }),

        // Empty-world navigation gestures.
        world: Object.freeze({
            longPressMoveDelay: 500,
            longPressMoveCancelDistance: 10,
        }),

        // Myte-specific click / pickup feel.
        myte: Object.freeze({
            clickPressDuration: 100,
            dragThreshold: 10,
            dragTimeThreshold: 300,
            pickupMaxY: 500,
            pickupMaxX: 300,
            dragModeRestoreDelay: 100,
        }),

        // Default map-object interaction feel. Individual objects can still
        // override these through their own config when needed.
        mapObject: Object.freeze({
            dragThreshold: 3,
            selectDragThreshold: 8,
            selectDragTimeThreshold: 300,
            selectPickupMaxY: 500,
            selectPickupMaxX: 300,
            selectDragModeRestoreDelay: 100,
            selectDragStartDelay: 10,
        }),
    }),

    actions: Object.freeze({
        queueDefaults: Object.freeze({
            idleDuration: 200,
            expressionDuration: 50,
            danceDuration: 2000,
            jumpHeight: 100,
            putDownDuration: 100,
        }),
        surfaceSlot: Object.freeze({
            // Prefer the entry side unless another allowed exit shortens the
            // route to the next queued target by at least this many pixels.
            exitGoalAdvantageThreshold: 64,
        }),
    }),

    // World defaults
    world: Object.freeze({
        defaultMap: 'House',

        // Summoning a myte that lives on another map makes it walk over rather
        // than refusing. Distance is measured in map transitions (WorldGraph).
        travel: Object.freeze({
            maxDistance: 3,
            // How long a map takes to cross is measured from the map file: the
            // walk from the portal it came in by to the portal it is leaving
            // through, at the traveller's own speed. This flat figure is only
            // the fallback for a map whose geometry says nothing useful.
            durationPerMap: 12000,
            // No map should be crossable in a blink just because its portals
            // happen to sit next to each other.
            minLegDuration: 3000,
            // How close to a portal counts as having reached it, when the portal
            // itself does not say.
            portalArrivalRadius: 48,
            // Progress ticks that reach the UI while a myte is en route.
            progressInterval: 4000,
        }),
    }),

    // ── Myte defaults ─────────────────────────────────────────────────────────

    myte: Object.freeze({

        progression: Object.freeze({
            baseXpPerAction: 1,
            accomplishmentWeight: 8,
            noveltyWeight: 1.5,
            exertionWeight: 1,
            xpPerLevel: 100,
            levelExponent: 1.2,
        }),

        starterRoster: Object.freeze([
            Object.freeze({
                id: '1',
                name: 'Snail',
                species: 'snail',
                slotId: 'myte-slot-snail-1',
                slotLabel: "Snail's Slot",
                homeMapId: 'House'
            }),
            Object.freeze({
                id: '2',
                name: 'Snail 2',
                species: 'snail',
                slotId: 'myte-slot-snail-2',
                slotLabel: "Snail 2's Slot",
                homeMapId: 'Outside'
            })
        ]),

        homeSlotLayout: Object.freeze({
            spacing: 224,
            slotSize: 192
        }),

        // Default animation frame rate for sprite sheets
        defaultAnimationFPS: 8,

        // Vertical carry anchor in world px for Myte-on-Myte carry actions.
        carryOffset: 45,

        // How long the player can be inactive before the active myte enters
        // inactivity free-roam (ms)
        inactiveTimeout: 8000,

        // Radius (px) within which another active myte grants companionship_aura
        companionRadius: 120,

        // How often (ms) companion proximity is re-evaluated (tickUpdate runs at 20 Hz / 50 ms,
        // so 1000 ms = every 20 ticks). Buff state is stable enough that 1 Hz is fine.
        companionSyncInterval: 1000,

        // Starting stat values for a freshly spawned myte
        initialStats: Object.freeze({
            health:     100,
            energy:     75,
            fun:        70,
            social:     80,
            satiety:    100,
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
            activityIntervalBase:   1.24,
            activityIntervalWeight: 0.42,
            boredomIntervalWeight:  0.18,
            lowEnergyThreshold:     0.3,
            lowEnergyIntervalScale: 1.22,
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
            selectionJitterMin:     0.9,
            selectionJitterMax:     1.1,
        }),

        wander: Object.freeze({
            edgePaddingCells:       3,
            minDistanceCells:       4,
            targetAttempts:         18,
            originSnapRadius:       8,
            candidateSnapRadius:    16,
            curiositySnapRadius:    10,
            homeTargetSnapRadius:   10,
            defaultConfidence:      0.55,
            confidenceRadiusBase:   0.3,
            confidenceRadiusWeight: 0.7,
            curiosityPlayThreshold: 0.48,
            curiosityTraitThreshold: 0.55,
            noveltyThreshold:       0.55,
        }),

        // Thought-bubble feedback when a myte commits to a need-driven decision.
        // Keyed by candidate label prefix; prefixes without an icon show nothing
        // (wander/idle stay silent on purpose — bubbling every think is noise).
        needBubbles: Object.freeze({
            minIntervalMs: 6000,
            // Sprite symbol names from the #icon-sprite block in index.html.
            icons: Object.freeze({
                safe_return:  'home',
                home_comfort: 'home',
                rest:         'sleep',
                eat:          'bowl',
                social:       'heart',
                play:         'ball',
                interaction:  'sparkle',
                dropped_item: 'eye',
            }),
        }),

        // Candidate scores are recomputed each think and the highest score wins.
        // Most scores land in roughly the 0-100 range. commitmentMs keeps the
        // chosen intention sticky long enough to avoid behavior thrash.
        candidates: Object.freeze({
            safeReturn: Object.freeze({
                score: 999,
                commitmentMs: 3200,
                moveThreshold: 8,
                sleepDuration: 220,
                sleepCommitmentMs: 2200,
                sleepAccomplishment: 0.05,
            }),

            eat: Object.freeze({
                minDrive: 0.28,
                base: 14,
                driveWeight: 72,
                distanceFalloffRange: 160,
                distanceFalloffRate: 0.1,
                urgentThreshold: 0.75,
                urgentBonus: 18,
                offeredBaseBonus: 36,
                offeredFreshnessWindowMs: 18000,
                offeredFreshnessRate: 0.0012,
            }),

            rest: Object.freeze({
                expandedSearchDriveThreshold: 0.55,
                expandedSearchRadiusMultiplier: 2.5,
                base: 16,
                driveWeight: 84,
                comfortDriveWeight: 18,
                modeBonus: 36,
                farFromHomeSafetyWeight: 14,
                cozinessWeight: 10,
                minScore: 28,
                surfaceCommitmentMs: 2400,
                fallbackCommitmentMs: 1600,
                surfaceNoveltyFloor: 0.2,
                surfaceNoveltyScale: 0.4,
                actionNovelty: 0.15,
                emergencySleepEnergyThreshold: 0.18,
                emergencySleepHealthThreshold: 0.4,
                simpleSleepEnergyThreshold: 0.44,
                idleDuration: 90,
                sleepDuration: 220,
                simpleSleepDuration: 160,
            }),

            homeComfort: Object.freeze({
                minSafetyDrive: 0.12,
                base: 8,
                safetyDriveWeight: 42,
                comfortDriveWeight: 22,
                restDriveWeight: 10,
                lowEnergyThreshold: 0.35,
                lowEnergyBonus: 10,
                minScore: 24,
                commitmentMs: 1800,
                fallbackIdleDuration: 50,
                fallbackNovelty: 0.1,
            }),

            social: Object.freeze({
                knownConfidenceThreshold: 0.5,
                base: 14,
                driveWeight: 52,
                modeBonus: 34,
                lowEnergyThreshold: 0.25,
                lowEnergyPenalty: 18,
                lowConfidenceThreshold: 0.3,
                lowConfidencePenalty: 6,
                minScore: 26,
                noveltyFloor: 0.2,
                noveltyScale: 0.45,
                playDriveThreshold: 0.74,
                playEnergyThreshold: 0.6,
                secondaryPlayDriveThreshold: 0.35,
                comfortDriveThreshold: 0.42,
                sociabilityThreshold: 0.62,
            }),

            play: Object.freeze({
                energyFloor: 0.22,
                objectPlayNeedFloor: 0.28,
                noObjectPlayNeedFloor: 0.4,
                momentum: Object.freeze({
                    playDriveWeight: 0.5,
                    activityWeight: 0.28,
                    energyWeight: 0.22,
                }),
                base: 10,
                driveWeight: 64,
                activityWeight: 12,
                restDrivePenaltyWeight: 18,
                funPressureThreshold: 0.45,
                funPressureWeight: 22,
                minScore: 24,
                anchorActivityThreshold: 0.68,
                zigzagActivityThreshold: 0.74,
                repeatPenalty: Object.freeze({
                    labelMultiplier: 0.94,
                    targetMultiplier: 0.96,
                    historyLabelPenaltyScale: 0.3,
                    historyTargetPenaltyScale: 0.2,
                    historyWindowCapMs: 20000,
                }),
                continuingToyFunThreshold: 0.45,
                continuingToyBonus: 30,
                celebrationExpressionChance: 0.3,
                celebrationExpressionDuration: 35,
                jumpChance: 0.16,
                jumpEnergyThreshold: 0.7,
                fallbackNovelty: 0.35,
                nudgeBall: Object.freeze({
                    highMomentumThreshold: 0.9,
                    mediumMomentumThreshold: 0.72,
                    lowRepeatCount: 1,
                    mediumRepeatCount: 2,
                    highRepeatCount: 3,
                    extraRepeatFunPressureThreshold: 0.4,
                    maxRepeatCount: 4,
                    postNudgeIdleBaseDuration: 18,
                    postNudgeIdleActivityScale: 16,
                }),
                playFetch: Object.freeze({
                    minRoundTrips: 1,
                    maxRoundTrips: 4,
                    momentumRoundTripWeight: 2.4,
                    playDriveRoundTripWeight: 0.8,
                    throwStrengthBase: 8,
                    throwStrengthActivityScale: 6,
                }),
                runLaps: Object.freeze({
                    highActivityThreshold: 0.8,
                    normalRepeatCount: 3,
                    highActivityRepeatCount: 4,
                }),
                zigzag: Object.freeze({
                    amplitudeBase: 36,
                    amplitudeActivityScale: 48,
                    durationBase: 90,
                    durationActivityScale: 90,
                }),
                circle: Object.freeze({
                    radiusBase: 32,
                    radiusActivityScale: 28,
                    durationBase: 90,
                    durationPlayDriveScale: 90,
                }),
            }),

            interaction: Object.freeze({
                chainCommitmentPerTargetMs: 2200,
                riskConfidenceScale: 5,
                base: 6,
                distanceFalloffRange: 140,
                distanceFalloffRate: 0.12,
                defaultScoreDrivers: Object.freeze([
                    Object.freeze({ context: 'drives.exploreDrive', weight: 16 }),
                    Object.freeze({ context: 'novelty', weight: 10 }),
                ]),
                modeBonus: 24,
                minScore: 20,
                defaultCommitmentMs: 1200,
            }),

            droppedItem: Object.freeze({
                base: 8,
                curiosityWeight: 16,
                exploreDriveWeight: 8,
                distanceFalloffRange: 120,
                distanceFalloffRate: 0.1,
                freshnessWindowMs: 30000,
                freshnessBonus: 22,
                edibleDriveThreshold: 0.2,
                edibleDriveWeight: 48,
                commitmentMs: 1800,
            }),

            wander: Object.freeze({
                base: 10,
                activityWeight: 16,
                curiosityWeight: 12,
                playDriveWeight: 14,
                extraPlayDriveWeight: 10,
                modeBonus: 38,
                lowEnergyThreshold: 0.25,
                lowEnergyPenalty: 14,
                commitmentMs: 2400,
                jumpEnergyThreshold: 0.72,
                jumpChance: 0.12,
                pauseChance: 0.45,
                pauseNovelty: 0.18,
                pauseDurationBase: 45,
                pauseDurationComfortScale: 35,
            }),

            idle: Object.freeze({
                commitmentMs: 1400,
                base: 7,
                energyNeedWeight: 3,
                comfortDriveWeight: 2,
                idleBonusDurationMs: 6000,
                idleBonusMax: 0.25,
                tiredExpressionEnergyThreshold: 0.4,
                tiredExpressionChance: 0.55,
                tiredExpressionDuration: 60,
                socialExpressionDriveThreshold: 0.55,
                socialExpressionChance: 0.35,
                socialExpressionDuration: 50,
                playExpressionDriveThreshold: 0.5,
                playExpressionChance: 0.28,
                playExpressionDuration: 40,
                simpleSleepEnergyThreshold: 0.45,
                simpleSleepChance: 0.55,
                simpleSleepDuration: 220,
                actionNovelty: 0.05,
                actionSoothing: 0.4,
                durationBase: 200,
                durationComfortScale: 140,
            }),
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
        defaultFollowMode: 'DRAG_TO_PAN',   // key of CAMERA_FOLLOW_MODES

        // Movement easing (higher = slower/smoother)
        easing:         10,
        draggingEasing: 20,
        zoomEasing:     5,

        // Position snapping — snap to target when distance is below this threshold
        snapThreshold: 0.5,

        // Adaptive easing — distance is divided by this to reduce easing at close range
        adaptiveEasingDivisor: 100,

        // Zoom limits and scroll wheel step
        minZoom:  0.5,
        maxZoom:  2.5,
        zoomStep: 0.1,

        // CURSOR_EDGE: fraction of viewport that counts as the trigger zone (0–1)
        edgeThreshold: 0.20,

        // CURSOR_EDGE: easing divisor for edge scroll speed (easing / this)
        edgeScrollEasingDivisor: 3,

        // LEASH: myte must drift beyond this fraction of the viewport before camera moves
        leashThreshold: 0.28,

        // OVERVIEW: world-space padding (px) added around the myte bounding box
        overviewPadding: 120,

        // CINEMATIC: pan cycle speed (radians per second — lower is slower)
        cinematicSpeed: 0.1,

        // Fallback entity size used when an entity has no size property
        defaultEntitySize: Object.freeze({ width: 50, height: 50 }),

        // Camera shake: per-frame intensity multiplier and max world-space pixel offset
        shakeDecay:        0.85,
        shakeMaxAmplitude: 12,

        // Pan inertia: per-frame velocity multiplier and min speed before stopping
        panInertiaDecay:    0.88,
        panInertiaMinSpeed: 0.5,
    }),

    // ── Spatial audio ────────────────────────────────────────────────────────

    audio: Object.freeze({
        // Tone.js retains automation history on reused synth parameters. Rotate
        // frequent one-shot voices before those internal timelines grow without
        // bound during long sessions, then give the retired voice time to finish.
        oneShotSynthTriggerLimit: 64,
        oneShotSynthRecycleDelayMs: 1000,
        mapSpatial: Object.freeze({
            fullVolumeRadius: 64,
            // Floor for the audible range — the effective range grows with viewport
            // size (see viewportRangeMultiplier) so a bigger screen doesn't shrink
            // the world relative to what's audible.
            maxDistance: 512,
            rolloffExponent: 1.25,
            // Effective maxDistance = max(maxDistance, viewport half-diagonal * this).
            // Keeps "can I hear it" roughly matched to "can I see it" at any window size.
            viewportRangeMultiplier: 1.1,
            // Sounds flagged `awareness: true` in their preset stay faintly audible
            // beyond maxDistance (out to maxDistance * this) so the player gets a cue
            // to look around, capped at awarenessVolumeCap.
            awarenessRangeMultiplier: 1.8,
            awarenessVolumeCap: 0.22,
        }),
        waterProximityRadius: 128,
    }),

    // ── HUD feedback ─────────────────────────────────────────────────────────

    ui: Object.freeze({
		welcomeBack: Object.freeze({
			// Absences are acknowledged, never simulated as offline stat decay.
			minAwayMs: 6 * 60 * 60 * 1000,
			toastDurationMs: 12000,
		}),
        panels: Object.freeze([
            Object.freeze({ id: 'sound-settings-panel', icon: 'sound-on', title: 'Sound Settings', controls: Object.freeze(['minimize', 'fullscreen', 'close']) }),
            Object.freeze({
                id: 'myte-info-panel', icon: 'info', title: 'Myte Information', controls: Object.freeze(['minimize', 'fullscreen', 'close']),
                tabs: Object.freeze({ className: 'myte-info__tabs', ariaLabel: 'Myte information', after: '.myte-info__summary', attribute: 'data-myte-info-tab', panelId: 'myte-info-tabpanel', items: Object.freeze([
                    Object.freeze({ id: 'myte-info-tab-general', value: 'general', label: 'General' }),
                    Object.freeze({ id: 'myte-info-tab-needs', value: 'needs', label: 'Needs' }),
                    Object.freeze({ id: 'myte-info-tab-behavior', value: 'behavior', label: 'Behavior' }),
                    Object.freeze({ id: 'myte-info-tab-drives', value: 'drives', label: 'Drives' }),
                    Object.freeze({ id: 'myte-info-tab-debug', value: 'debug', label: 'Debug', hidden: true }),
                ]) }),
            }),
            Object.freeze({
                id: 'user-profile-panel', icon: 'user', title: 'User Profile', controls: Object.freeze(['minimize', 'close']),
                tabs: Object.freeze({ className: 'user-profile__tabs', ariaLabel: 'User profile', after: '.user-profile__identity', attribute: 'data-user-profile-tab', items: Object.freeze([
                    Object.freeze({ value: 'account', label: 'Account' }),
                    Object.freeze({ value: 'progress', label: 'Progress' }),
                ]) }),
            }),
            Object.freeze({ id: 'game-settings-panel', icon: 'gear', title: 'Game Settings', controls: Object.freeze(['minimize', 'fullscreen', 'close']) }),
            Object.freeze({ id: 'game-log-panel', icon: 'list', title: 'Event Log', controls: Object.freeze(['minimize', 'close']), tabs: Object.freeze({ className: 'game-log-filters', ariaLabel: 'Event categories', items: Object.freeze([]) }) }),
            Object.freeze({ id: 'world-map-panel', icon: 'world-map', title: 'World Map', controls: Object.freeze(['minimize', 'close']) }),
            Object.freeze({ id: 'view-panel', icon: 'eye', title: 'View', controls: Object.freeze(['minimize', 'close']) }),
            Object.freeze({ id: 'game-debug-panel', icon: 'bug', title: 'Debug Menu', controls: Object.freeze(['minimize', 'fullscreen', 'close']) }),
        ]),
        labels: Object.freeze({
            actionCategories: Object.freeze({
                movement: 'Movement', state: 'State', interactions: 'Interactions',
                play: 'Play', reactive: 'Reactive', carrying: 'Active Actions',
            }),
            myteBehaviors: Object.freeze({
                FOLLOW: 'Following', FREEROAM: 'Free Roam', GRAVITY: 'Gravity',
                GOHOME: 'Going Home', QUEUE_ONLY: 'Queued',
            }),
            slotStates: Object.freeze({
                empty: 'Empty', home: 'At Home', freeroam: 'Free Roam',
                returning: 'Returning', deployed: 'Deployed',
            }),
            drives: Object.freeze({
                eatDrive: 'Hunger', restDrive: 'Rest', playDrive: 'Play',
                socialDrive: 'Social', exploreDrive: 'Explore',
                comfortDrive: 'Comfort', safetyDrive: 'Safety',
            }),
        }),
        currencySymbols: Object.freeze({
            coins: '¢',
        }),
        interactionSounds: Object.freeze({
            click: 'ui_click',
            modalOpen: 'ui_modal_open',
            modalClose: 'ui_hover',
            zoom: 'ui_drag_item',
            zoomInPitch: 1.12,
            zoomOutPitch: 0.82,
            zoomVolume: 0.36,
            panStart: 'ui_drag_item',
            panEnd: 'ui_drop_item',
            panThresholdPx: 4,
            panStartVolume: 0.3,
            panEndVolume: 0.26,
            pet: 'myte_happy',
            petOverdone: 'ui_error',
            timeMilestone: 'ui_time_chime',
            timeMilestones: Object.freeze({
                0: Object.freeze({ pitchScale: 0.72, volume: 0.34 }),
                6: Object.freeze({ pitchScale: 1.05, volume: 0.42 }),
                12: Object.freeze({ pitchScale: 1.2, volume: 0.46 }),
                19: Object.freeze({ pitchScale: 0.88, volume: 0.38 }),
            }),
        }),
        hud: Object.freeze({
            updateIntervalMs: 250,
            seasonIcons: Object.freeze({
                spring: 'sprout',
                summer: 'sun',
                autumn: 'leaf',
                winter: 'snowflake',
            }),
            numericAnimation: Object.freeze({
                minDurationMs: 200,
                durationLogScaleMs: 260,
                maxDurationMs: 1400,
                maxScale: 1.1,
                scalePerLogMagnitude: 0.025,
                tickMinDelta: 1,
                tickStartIntervalMs: 190,
                tickEndIntervalMs: 90,
                finalChimeMinDelta: 10,
                sound: Object.freeze({
                    tickId: 'ui_coin_tick',
                    chimeId: 'ui_coin_chime',
                    gainTickVolume: 0.34,
                    spendTickVolume: 0.22,
                    gainPitchStart: 0.92,
                    spendPitchStart: 0.78,
                    pitchRise: 0.16,
                    chimeVolume: 0.5,
                }),
            }),
        }),
    }),

    // ── Game time ─────────────────────────────────────────────────────────────

    time: Object.freeze({
        // Real-time minutes for one full game day
        dayDurationInMinutes: 5,
        daysPerSeason:        28,
        // Minute interval used by formatted clocks/log timestamps. Set to 5 or 10
        // for a stepped game clock, or 1 to display every in-game minute.
        displayMinuteStep:    10,
        initialDate: Object.freeze({
            year: 1,
            season: 'spring',
            day: 1,
            hour: 8,
            minute: 0,
        }),
    }),
});
