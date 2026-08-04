class ActionManager {
    static actions = new Map();
    static fallbackMetadata = new Map();

    static cloneMetadata(value) {
        return Utility.deepClone(value);
    }

    static getMetadata(actionId, ActionClass = null) {
        const fallback = this.fallbackMetadata.get(actionId) ||
            (ActionClass?.metadata ? this.cloneMetadata(ActionClass.metadata) : null);
        return ActionDefinitionRegistry.getDefinitionSync(actionId, fallback) || fallback || null;
    }

    static attachMetadataGetter(ActionClass, actionId) {
        Object.defineProperty(ActionClass, 'metadata', {
            configurable: true,
            get: () => this.getMetadata(actionId, ActionClass)
        });
    }

    static getActionPresentation(actionId, selected) {
        const config = selected?.getActionConfig?.(actionId, null);
        if (!config || typeof config !== 'object') return {};
        const out = {};
        if (config.label) out.label = config.label;
        if (config.description) out.description = config.description;
        const priority = Number(config.priority);
        if (Number.isFinite(priority)) out.priority = priority;
        return out;
    }

    static registerAction(ActionClass) {
        const fallbackMetadata = this.cloneMetadata(ActionClass.metadata || {});
        const actionId = ActionDefinitionRegistry.normalizeActionId(
            fallbackMetadata.id || ActionClass.actionId || ActionClass.name
        );

        if (!actionId) {
            throw new Error(`Action class ${ActionClass.name} must have an id in metadata`);
        }

        fallbackMetadata.id = actionId;
        this.fallbackMetadata.set(actionId, fallbackMetadata);
        ActionClass.actionId = actionId;
        this.attachMetadataGetter(ActionClass, actionId);
        this.actions.set(actionId, ActionClass);
    }

    static registerActions(actionClasses) {
        actionClasses.forEach(ActionClass => this.registerAction(ActionClass));
    }

    static canPerformAction(actionId, selected, active) {
        return this.explainAction(actionId, selected, active).available;
    }

    /**
     * Why is this action available, or not?
     *
     * Actions historically answered availability with a bare boolean, so an
     * unavailable action simply vanished from the sidebar and the player was never
     * told why ("the bed advertises `sittable` but shows no Rest action" — because
     * energy was above the rest threshold, silently).
     *
     * Two opt-in ways for an action to explain itself, both backwards compatible:
     *   1. `canPerform` may return `{ ok: false, reason: '...' }` instead of a
     *      boolean. Plain booleans keep working untouched.
     *   2. A class may define `static explain(selected, active)` returning a reason
     *      string, used when `canPerform` said no without saying why.
     *
     * @returns {{ available: boolean, reason: string|null }}
     */
    static explainAction(actionId, selected, active) {
        // No reason here on purpose: "no Myte is deployed" is a global state, not a
        // fact about this action. Attaching it per-action turned the sidebar into a
        // wall of identical disabled buttons.
        if (!active) return { available: false, reason: null };

        const ActionClass = this.actions.get(actionId);
        if (!ActionClass || typeof ActionClass.canPerform !== 'function') {
            return { available: false, reason: null };
        }

        let verdict;
        try {
            verdict = ActionClass.canPerform(selected, active);
        } catch (error) {
            console.warn(`[ActionManager] canPerform threw for "${actionId}":`, error);
            return { available: false, reason: null };
        }

        if (verdict && typeof verdict === 'object') {
            const available = verdict.ok === true;
            return { available, reason: available ? null : (verdict.reason ?? null) };
        }

        if (verdict) return { available: true, reason: null };

        let reason = null;
        if (typeof ActionClass.explain === 'function') {
            try {
                reason = ActionClass.explain(selected, active) ?? null;
            } catch (error) {
                console.warn(`[ActionManager] explain threw for "${actionId}":`, error);
            }
        }
        return { available: false, reason };
    }

    /**
     * Actions that are currently unavailable but can say why. These are worth
     * surfacing to the player as disabled entries; an action with no reason is
     * simply irrelevant here (you cannot "harvest" a couch) and stays hidden.
     */
    static getExplainedUnavailableActions(selected, active) {
        const explained = [];
        for (const [id, ActionClass] of this.actions) {
            const { available, reason } = this.explainAction(id, selected, active);
            if (available || !reason) continue;
            explained.push({
                ...this.getMetadata(id, ActionClass),
                ...this.getActionPresentation(id, selected),
                ActionClass,
                unavailableReason: reason
            });
        }
        return explained.sort((a, b) => a.priority - b.priority);
    }

    // Resolve options for an action from a UI selection context
    static getActionOptions(actionId, selected, active) {
        const ActionClass = this.actions.get(actionId);
        if (!ActionClass) return null;
        if (!this.canPerformAction(actionId, selected, active)) {
            return null;
        }

        const metadata = this.getMetadata(actionId, ActionClass);

        // Only use getRequiredOptions if the action defines its own (not the base no-op)
        if (Object.prototype.hasOwnProperty.call(ActionClass, 'getRequiredOptions')) {
            return { ...metadata.defaultOptions, ...ActionClass.getRequiredOptions(selected, active) };
        }

        const options = {};
        if (metadata.requiresTarget) {
            options.target = selected;
        }

        return { ...metadata.defaultOptions, ...options };
    }

    // One-call helper: resolve options and enqueue on a Myte
    static enqueue(actionId, myte, selected) {
        const options = this.getActionOptions(actionId, selected, myte);
        if (!options) return false;
        myte.queue.add(actionId, options);
        return true;
    }

    static getAvailableActions(selected, active) {
        const available = [];
        for (const [id, ActionClass] of this.actions) {
            if (this.canPerformAction(id, selected, active)) {
                available.push({
                    ...this.getMetadata(id, ActionClass),
                    ...this.getActionPresentation(id, selected),
                    ActionClass
                });
            }
        }
        return available.sort((a, b) => a.priority - b.priority);
    }

    static getActionsByCategory(selected, active) {
        return this.getAvailableActions(selected, active).reduce((groups, action) => {
            const cat = action.category;
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(action);
            return groups;
        }, {});
    }

    static getMovementActions() {
        return Array.from(this.actions.entries())
            .filter(([id, ActionClass]) => this.getMetadata(id, ActionClass)?.isMovementAction)
            .map(([, ActionClass]) => ActionClass);
    }

    static getInterruptibleActions() {
        return Array.from(this.actions.entries())
            .filter(([id, ActionClass]) => this.getMetadata(id, ActionClass)?.isInterruptible)
            .map(([, ActionClass]) => ActionClass);
    }

    static getMoodAffectingActions() {
        return Array.from(this.actions.entries())
            .filter(([id, ActionClass]) => (this.getMetadata(id, ActionClass)?.effects?.mood ?? 0) !== 0)
            .map(([, ActionClass]) => ActionClass);
    }

    static validateDefinitions() {
        const registeredIds = new Set(this.actions.keys());
        const definitionIds = new Set(ActionDefinitionRegistry.getActionIds());

        for (const actionId of registeredIds) {
            if (!definitionIds.has(actionId)) {
                console.warn(`[ActionManager] Missing canonical action definition for "${actionId}".`);
            }
        }

        for (const actionId of definitionIds) {
            if (!registeredIds.has(actionId)) {
                console.warn(`[ActionManager] Canonical action definition "${actionId}" has no registered implementation class.`);
            }
        }
    }
}

ActionManager.registerActions([
    // Base
    MoveAction,
    AStarMoveAction,
    IdleAction,
    ExpressionAction,

    // Movement
    FollowMouseAction,
    FollowObjectAction,
    RunLapsAction,
    CircleAction,
    ZigzagAction,
    PatrolAction,
    WanderAction,
    GuardAction,
    JumpAction,
    GoToObjectAction,

    // State
    DanceAction,
    SimpleSleepAction,
    SleepAction,
    SpinAction,

    // Object interactions
    InspectAction,
    DeepInspectAction,
    InteractObjectAction,
    SurfaceSlotAction,
    NudgeBallAction,
    EatElementAction,
    OpenChestAction,
    CloseChestAction,
    PickFlowerAction,
    TrampleFlowerAction,
    SmellFlowerAction,
    DrinkFromFountainAction,
    WaterPlantAction,
    HarvestAction,
    ShakeTreeAction,
    ChopTreeAction,
    RemoveStumpAction,

    // Social (Myte-to-Myte)
    ShowAffectionAction,
    GreetAction,
    GreetReceiveAction,
    KissAction,
    KissReceiveAction,
    HighFiveAction,
    HighFiveReceiveAction,
    WatchAction,
    ChaseAction,
    EmoteAtAction,
    PlayTagAction,
    PlayFetchAction,

    // Carry
    CarryPickupAction,
    CarryAction,
    BeingCarriedAction,
    CarryPutdownAction,
    PickupItemAction,
    HoldItemAction,
    DropItemAction,
    GiveItemAction,

    // Reactive
    RunAwayAction,
    RunFromAction,
    HideAction,
]);
