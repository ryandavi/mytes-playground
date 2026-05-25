/**
 * AppConfig — infrastructure and runtime wiring for the application.
 *
 * Keep gameplay/simulation tuning in SiteConfig. This file covers the
 * "how is this app deployed" concerns: engine timing, file paths, DOM ids,
 * loading weights, and boot-time audio defaults.
 */
const AppConfig = Object.freeze({

    // ── Engine loop ───────────────────────────────────────────────────────────

    engine: Object.freeze({
        tickRate:          20,
        tickInterval:      1000 / 20,
        targetFPS:         60,
        fpsUpdateInterval: 1000,
    }),

    // ── User data paths ───────────────────────────────────────────────────────

    userData: Object.freeze({
        defaultPath:           'data/user/Ryan.json',
        filePathTemplate:      'data/user/{userId}.json',
        localStorageKeyPrefix: 'user_',
        lastUserIdKey:         'lastUserId',
    }),

    // ── DOM wiring ────────────────────────────────────────────────────────────

    container: Object.freeze({
        primaryId: 'container-1',
    }),

    // ── Loading screen ────────────────────────────────────────────────────────

    loading: Object.freeze({
        stages: Object.freeze({
            core:      Object.freeze({ weight: 0.45 }),
            resources: Object.freeze({ weight: 0.10 }),
            container: Object.freeze({ weight: 0.45 }),
        }),
    }),

    // ── Audio boot defaults ───────────────────────────────────────────────────
    // User preferences override these once user data is loaded.

    sound: Object.freeze({
        enabled:        true,
        musicEnabled:   true,
        ambientEnabled: true,
        unlockDelay:    400,
    }),

});
