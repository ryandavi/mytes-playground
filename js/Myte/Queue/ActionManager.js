// Action Manager for centralized action handling
class ActionManager {
    static actions = new Map();
    
    static registerAction(ActionClass) {
        if (!ActionClass.metadata?.id) {
            throw new Error(`Action class ${ActionClass.name} must have an id in metadata`);
        }
        this.actions.set(ActionClass.metadata.id, ActionClass);
    }

    static getActionRequirements(actionId, selected, active) {
        const ActionClass = this.actions.get(actionId);
        if (!ActionClass) return null;

        // Each action class can define what data it needs based on the target

        /*
        if (ActionClass.getRequiredOptions) {
            return ActionClass.getRequiredOptions(selected, active);
        }
        */

        // Default handling based on metadata
        const metadata = ActionClass.metadata;
        const options = { /* userInitiated: true */ };

        if (metadata.requiresTarget) {
            if (selected instanceof Myte) {
                options.target = selected;
            } else if (selected instanceof MapObject) {
                options.target = selected;
            } else {
                options.target = selected;
            }
        }

        return {
            ...(metadata.defaultOptions || {}),
            ...options
        };
    }

    static registerActions(actionClasses) {
        actionClasses.forEach(ActionClass => this.registerAction(ActionClass));
    }

    static getAvailableActions(selected, active) {
        const availableActions = [];
        
        for (const [id, ActionClass] of this.actions) {
            if (ActionClass.canPerform(selected, active)) {
                availableActions.push({
                    ...ActionClass.metadata,
                    ActionClass
                });
            }
        }

        return availableActions.sort((a, b) => a.priority - b.priority);
    }

    static getActionsByCategory(selected, active) {
        const actions = this.getAvailableActions(selected, active);
        return actions.reduce((groups, action) => {
            const category = action.category;
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(action);
            return groups;
        }, {});
    }

    static getMovementActions() {
        return Array.from(this.actions.values())
            .filter(ActionClass => ActionClass.metadata.isMovementAction);
    }

    static getInterruptibleActions() {
        return Array.from(this.actions.values())
            .filter(ActionClass => ActionClass.metadata.isInterruptible);
    }

    static getMoodAffectingActions() {
        return Array.from(this.actions.values())
            .filter(ActionClass => ActionClass.metadata.affectsMood);
    }

    static getActionRequiringTarget() {
        return Array.from(this.actions.values())
            .filter(ActionClass => ActionClass.metadata.requiresTarget);
    }
}

// Register all actions
ActionManager.registerActions([
    // Base actions
    MoveAction,
    AStarMoveAction,
    IdleAction,
    ExpressionAction,

    // Movement patterns
    FollowMouseAction,
    FollowObjectAction,
    RunLapsAction,
    CircleAction,
    ZigzagAction,
    JumpAction,

    // State actions
    DanceAction,
    SimpleSleepAction,
    SleepAction,
    SpinAction,

    // Interaction actions
    GoToObjectAction,
    InspectAction,
    EatElementAction,
    ShowAffectionAction,

    // Play actions
    PlayTagAction,
    PlayFetchAction,

    // Carry actions
    CarryPickupAction,
    CarryAction,
    BeingCarriedAction,
    CarryPutdownAction,

    // Reactive actions
    RunAwayAction,
    HideAction
]);