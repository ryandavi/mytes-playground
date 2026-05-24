class ActionManager {
    static actions = new Map();

    static getActionPresentation(actionId, selected) {
        const targetConfig = selected?.getActionConfig?.(actionId, null);
        if (!targetConfig || typeof targetConfig !== 'object') {
            return {};
        }

        const presentation = {};
        if (targetConfig.label) presentation.label = targetConfig.label;
        if (targetConfig.description) presentation.description = targetConfig.description;

        const priority = Number(targetConfig.priority);
        if (Number.isFinite(priority)) {
            presentation.priority = priority;
        }

        return presentation;
    }

    static registerAction(ActionClass) {
        if (!ActionClass.metadata?.id) {
            throw new Error(`Action class ${ActionClass.name} must have an id in metadata`);
        }
        this.actions.set(ActionClass.metadata.id, ActionClass);
    }

    static registerActions(actionClasses) {
        actionClasses.forEach(ActionClass => this.registerAction(ActionClass));
    }

    static canPerformAction(actionId, selected, active) {
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

        // Only use getRequiredOptions if the action defines its own (not the base no-op)
        if (Object.prototype.hasOwnProperty.call(ActionClass, 'getRequiredOptions')) {
            return { ...ActionClass.metadata.defaultOptions, ...ActionClass.getRequiredOptions(selected, active) };
        }

        const options = {};
        if (ActionClass.metadata.requiresTarget) {
            options.target = selected;
        }

        return { ...ActionClass.metadata.defaultOptions, ...options };
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
                    ...ActionClass.metadata,
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
        return Array.from(this.actions.values()).filter(A => A.metadata.isMovementAction);
    }

    static getInterruptibleActions() {
        return Array.from(this.actions.values()).filter(A => A.metadata.isInterruptible);
    }

    static getMoodAffectingActions() {
        return Array.from(this.actions.values()).filter(A => A.metadata.affectsMood);
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
