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
        if (!active) {
            return false;
        }

        const ActionClass = this.actions.get(actionId);
        if (!ActionClass || typeof ActionClass.canPerform !== 'function') {
            return false;
        }

        return !!ActionClass.canPerform(selected, active);
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
