/**
 * GameModeManager — the Play / Build split.
 *
 * Build mode freezes the simulation and hands the map to the player. Nothing
 * here toggles visibility directly: the mode is written to
 * `document.body.dataset.gameMode` and the container wrapper, and CSS drives
 * every show/hide from there. JS only owns the things CSS cannot — the pause,
 * the camera, the wall presentation, and the save on the way out.
 */
const GAME_MODES = Object.freeze({ PLAY: 'play', BUILD: 'build' });

class GameModeManager {
    constructor(container) {
        this.container = container;
        this.mode = GAME_MODES.PLAY;
        this._restore = null;
        this._seenTutorial = false;
        // Debug's "Build Anywhere". Off by default even with the debug overlay
        // on, so the policies themselves stay testable.
        this.buildAnywhere = false;
    }

    get config() {
        return SiteConfig.buildMode;
    }

    get ui() {
        return this.container?.ui || null;
    }

    isBuild() {
        return this.mode === GAME_MODES.BUILD;
    }

    isPlay() {
        return this.mode === GAME_MODES.PLAY;
    }

    /**
     * Whether the current map lets the player build at all.
     *
     * A map's own `buildPolicy` property wins. Failing that the player's home
     * map is 'full' and everything else is 'none' — the home default lives in
     * code rather than only in House.tmx because browsers cache .tmx files
     * outside debug mode, so a client holding an older copy of the map would
     * otherwise find its own house permanently unbuildable.
     */
    getPolicy(gameMap = this.container?.gameMap) {
        // The single point every rule reads — BuildRules.policy comes through
        // here — so overriding it opens both the way into the mode and every
        // per-cell check, rather than letting you enter a mode that then
        // refuses everything.
        if (this.buildAnywhere) return 'full';
        const declared = gameMap?.properties?.buildPolicy;
        if (this.config.policies.includes(declared)) return declared;
        return this.isHomeMap(gameMap) ? 'full' : this.config.defaultPolicy;
    }

    /**
     * Lets the build tools onto maps that would refuse them. A dev switch: the
     * edits it permits are saved like any other, so it is off unless asked for.
     */
    setBuildAnywhere(flag) {
        const next = flag === true;
        if (this.buildAnywhere === next) return next;
        this.buildAnywhere = next;
        // Turning it off under your own feet leaves you building on a map that
        // no longer allows it.
        if (!next && this.isBuild() && !this.canBuildHere()) this.setMode(GAME_MODES.PLAY);
        this.container?.eventManager?.emit(EVENTS.BUILD_POLICY_CHANGED, {
            buildAnywhere: next,
            policy: this.getPolicy()
        });
        return next;
    }

    // The player's house, and only that. A myte's `homeMapId` is where it
    // sleeps, which for a visiting myte can be any map in the world — using it
    // here would quietly open the whole world to building.
    isHomeMap(gameMap = this.container?.gameMap) {
        return !!gameMap?.id && gameMap.id === SiteConfig.world.defaultMap;
    }

    canBuildHere(gameMap = this.container?.gameMap) {
        return this.getPolicy(gameMap) !== 'none';
    }

    toggle() {
        return this.setMode(this.isBuild() ? GAME_MODES.PLAY : GAME_MODES.BUILD);
    }

    setMode(mode) {
        if (mode !== GAME_MODES.BUILD && mode !== GAME_MODES.PLAY) return false;
        if (mode === this.mode) return false;

        if (mode === GAME_MODES.BUILD && !this.canBuildHere()) {
            this.ui?.showMessage?.("You can't build here.", 'warning', 'Build Mode');
            return false;
        }

        const previous = this.mode;
        this.mode = mode;
        this.applyModeState();

        if (mode === GAME_MODES.BUILD) this.enterBuild();
        else this.leaveBuild();

        this.container?.eventManager?.emit(EVENTS.GAME_MODE_CHANGED, { mode, previous });
        return true;
    }

    applyModeState() {
        document.body.dataset.gameMode = this.mode;
        this.container?.containerWrapper?.setAttribute('data-game-mode', this.mode);
    }

    /**
     * Re-run the entry side effects after a map change. The mode itself is not
     * map state, but everything it overrides — camera, walls, lighting — belongs
     * to the map that was just torn down.
     */
    handleMapChanged() {
        this.container?.buildHistory?.clear();
        if (!this.isBuild()) return;
        if (!this.canBuildHere()) {
            this.setMode(GAME_MODES.PLAY);
            return;
        }
        this._restore = null;
        this.applyEnvironment();
    }

    // The tool swap itself is ToolManager's, driven by GAME_MODE_CHANGED, so
    // there is one place that decides which tools a mode owns.
    enterBuild() {
        this.ui?.setSelected?.(null);
        this.container?.buildHistory?.clear();

        this._restore = {
            followMode: this.container?.camera?.followMode ?? null,
            zoom: this.container?.camera?.zoomLevel ?? null
        };

        this.setSimulationPaused(true);
        this.applyEnvironment();
        this.playSound(this.config.sounds.modeEnter);
        this.setModeMusic(this.config.sounds.music);
        this.showTutorial();
    }

    leaveBuild() {
        const gameMap = this.container?.gameMap;

        this.ui?.wallBuildPanel?.cancelDrag?.();
        this.container?.inventory?.cancelPlacement?.();
        this.ui?.wallBuildPanel?.close?.();
        this.ui?.surfaceCustomizePanel?.close?.();
        this.container?.buildHistory?.clear();

        this.clearEnvironment();
        this.setSimulationPaused(false);
        this.setModeMusic(null);

        if (this._restore) {
            // Eased, like the way in. Entry glides to the build framing and
            // exit used to cut straight back, so the two halves of the same
            // trip did not match.
            if (Number.isFinite(this._restore.zoom)) this.container?.camera?.zoomTo?.(this._restore.zoom, { immediate: false });
            if (Number.isFinite(this._restore.followMode)) this.container?.camera?.setMode?.(this._restore.followMode);
            this._restore = null;
        }

        this.reflowStrandedMytes();
        if (gameMap) {
            this.container?.worldState?.captureMap?.(gameMap);
            this.container?.core?.user?._scheduleSave?.();
        }
        this.playSound(this.config.sounds.modeExit);
    }

    // ── Entry environment (camera, walls, lighting) ───────────────────────────

    applyEnvironment() {
        const camera = this.container?.camera;
        camera?.setMode?.(this.config.cameraFollowMode);
        if (Number.isFinite(this.config.entryZoom)) camera?.zoomTo?.(this.config.entryZoom, { immediate: false });

        this.container?.gameMap?.wallBuilder?.setBuildPresentation?.(
            this.container.buildPresentation || this.config.defaultPresentation
        );
        this.setNeutralLighting(this.config.neutralLighting === true);
    }

    clearEnvironment() {
        this.container?.gameMap?.wallBuilder?.clearBuildPresentation?.();
        this.setNeutralLighting(false);
    }

    setNeutralLighting(flag) {
        const environment = this.container?.gameMap?.environmentManager;
        if (!environment || environment.lightingOverride === flag) return;
        environment.lightingOverride = flag;
        environment.refreshDisplaySettings?.();
    }

    // ── Simulation pause ──────────────────────────────────────────────────────

    setSimulationPaused(flag) {
        this.container?.core?.setSimulationPaused?.(flag);
        if (flag) this.container?.core?.gameTime?.pause?.();
        else this.container?.core?.gameTime?.resume?.();
    }

    // ── Aftermath ─────────────────────────────────────────────────────────────

    /**
     * Walls raised during a build session can strand a myte on a cell that is
     * no longer walkable. Nudge each one to the nearest cell it can stand on,
     * and warn about rooms that ended up with no way in.
     */
    reflowStrandedMytes() {
        const gridSystem = this.container?.gameMap?.gridSystem;
        if (!gridSystem?.findNearestValidPositionForEntity) return;

        let moved = 0;
        for (const myte of this.container.mytes || []) {
            if (!myte.isActive) continue;
            const cell = gridSystem.worldToGrid(myte.posX, myte.posY);
            if (gridSystem.grid?.[cell.x]?.[cell.y]?.walkable !== false) continue;
            const safe = gridSystem.findNearestValidPositionForEntity(myte, myte.posX, myte.posY, 16);
            if (!safe) continue;
            myte.setPosition?.(safe.x, safe.y, this.container.settings?.limitMap);
            myte.setTarget?.(safe.x, safe.y);
            moved += 1;
        }

        if (moved > 0) {
            this.ui?.showMessage?.(
                moved === 1 ? 'A Myte was moved clear of a new wall.' : `${moved} Mytes were moved clear of new walls.`,
                'info',
                'Build Mode'
            );
        }
    }

    showTutorial() {
        if (this._seenTutorial || this.ui?.settingsPanel?.settings?.gameplay?.tutorials === false) return;
        this._seenTutorial = true;
        this.ui?.showMessage?.(
            'Time is paused while you build. 1 moves furniture, 2 builds walls, 3 paints rooms, 4 paints surfaces. Ctrl+Z undoes.',
            'info',
            'Build Mode'
        );
    }

    playSound(soundId) {
        if (soundId) this.container?.core?.soundManager?.playWhenReady?.(soundId);
    }

    setModeMusic(musicId) {
        this.container?.core?.soundManager?.setModeMusic?.(musicId ?? null);
    }

    dispose() {
        this.container = null;
    }
}
