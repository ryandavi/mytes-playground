class MyteMovementController {
    constructor(myte) {
        this.myte = myte;
    }

    setFollowMode(newGoal = null) {
        const m = this.myte;
        if (newGoal == null) newGoal = m.followGoal;
        m.followGoal = newGoal;
        m.parent.ui?.debugPanel?.updateButton?.('cycleFollowGoal');
        m.runAway = m.followGoal === MOVE_FOLLOW_TYPES.RUNAWAY;
        m.goingInCircles = m.followGoal === MOVE_FOLLOW_TYPES.CIRCLES;
    }

    setAutonomyMode(newGoal = null) {
        const m = this.myte;
        if (newGoal == null) newGoal = m.autonomyGoal;
        m.autonomyGoal = newGoal;
        m.ai?.setMode(newGoal);
        m.parent.ui?.debugPanel?.updateButton?.('cycleAutonomyGoal');
    }

    setMode(newGoal = null) {
        const m = this.myte;
        if (newGoal == null) newGoal = m.goal;

        const previousGoal = m.goal;
        if (newGoal !== m.goal) {
            m.previousGoal = m.goal;
            m.goal = newGoal;
            m.unsetTarget();
            m.queue.clear();
        }

        m.parent.ui?.debugPanel?.updateButton?.('cycleGoal');

        const modeConfig = {
            [MOVE_TYPES.FOLLOW]: { isFreeRoam: false, followMouse: true, isGravity: false },
            [MOVE_TYPES.GRAVITY]: { isFreeRoam: false, followMouse: true, isGravity: true },
            [MOVE_TYPES.FREEROAM]: { isFreeRoam: true, followMouse: false, isGravity: false },
            [MOVE_TYPES.GOHOME]: { isFreeRoam: false, followMouse: false, isGravity: false },
            [MOVE_TYPES.QUEUE_ONLY]: { isFreeRoam: false, followMouse: false, isGravity: false }
        }[m.goal];

        if (!modeConfig) return;

        m.atOriginal = false;
        m.isFreeRoam = modeConfig.isFreeRoam;
        m.followMouse = modeConfig.followMouse;
        m.isGravity = modeConfig.isGravity;
        m.isDragging = false;
        m.unsetTarget();
        m.queue.clear();
        this.handleModeTransition(previousGoal, m.goal);

        if (m.goal === MOVE_TYPES.GOHOME) {
            this.beginGoHomeJourney(true);
        } else {
            this.resetGoHomeState();
        }

        m.parent?.eventManager?.emit('myte:mode_changed', { myte: m, mode: m.goal });
    }

    handleModeTransition(previousGoal, nextGoal) {
        const m = this.myte;
        if (!m.physicsController) return;

        if (nextGoal === MOVE_TYPES.GRAVITY) {
            m.physicsController.syncGroundState();
            return;
        }

        if (previousGoal === MOVE_TYPES.GRAVITY) {
            m.physicsController.reset();
        }
    }

    holdInHomeSlotUntilPointerLeaves() {
        const m = this.myte;
        m.holdAtHomeSlotWhilePointerInside = true;
        return m.snapToHomePosition();
    }

    clearHomeSlotHold() {
        this.myte.holdAtHomeSlotWhilePointerInside = false;
    }

    shouldHoldInHomeSlot() {
        const m = this.myte;
        if (!m.holdAtHomeSlotWhilePointerInside) return false;

        if (!m.isActive || m.isDragging) {
            this.clearHomeSlotHold();
            return false;
        }

        if (m.isPointerInsideHomeSlot()) return true;

        this.clearHomeSlotHold();
        return false;
    }

    resetGoHomeState() {
        const s = this.myte.goHomePathState;
        s.hasPlannedPath = false;
        s.directFallbackFrames = 0;
        s.lastPlanAt = 0;
    }

    beginGoHomeJourney(forceReplan = false) {
        const m = this.myte;
        const home = m.getHomePosition();
        const gridSystem = m.parent?.gameMap?.gridSystem;

        m.setTarget(home.x, home.y);
        m.goHomePathState.lastPlanAt = Date.now();
        m.goHomePathState.directFallbackFrames = 0;

        if (!forceReplan && !m.queue.isEmpty()) return false;

        const safeHome = gridSystem?.findNearestValidPositionForEntity?.(m, home.x, home.y, 12) ?? home;
        const needsPath = m.getDistanceToPoint(safeHome.x, safeHome.y) > Math.max(24, m.stats?.getSpeed?.() ?? 1);

        m.queue.clear();
        if (gridSystem && needsPath) {
            m.queue.add('astar-move', { target: {
                x: safeHome.x + m.size.width / 2,
                y: safeHome.y + m.size.height / 2
            } });
            m.goHomePathState.hasPlannedPath = true;
            return true;
        }

        m.goHomePathState.hasPlannedPath = false;
        return false;
    }

    enterInactivityFreeRoam() {
        const m = this.myte;
        if (!m.isActive || m.isDragging || m.goal !== MOVE_TYPES.FOLLOW) return false;
        if (m.inactivityState.isFreeRoaming) return true;

        m.inactivityState = {
            isFreeRoaming: true,
            goal: m.goal,
            followGoal: m.followGoal,
            autonomyGoal: m.autonomyGoal
        };

        this.setMode(MOVE_TYPES.FREEROAM);
        return true;
    }

    restoreFromInactivityFreeRoam() {
        const m = this.myte;
        if (!m.inactivityState.isFreeRoaming) return false;

        const restoreGoal = m.inactivityState.goal ?? DEFAULT_MODE;
        const restoreFollowGoal = m.inactivityState.followGoal ?? m.followGoal;
        const restoreAutonomyGoal = m.inactivityState.autonomyGoal ?? m.autonomyGoal;

        m.inactivityState = {
            isFreeRoaming: false,
            goal: null,
            followGoal: null,
            autonomyGoal: null
        };

        this.setFollowMode(restoreFollowGoal);
        this.setAutonomyMode(restoreAutonomyGoal);
        this.setMode(restoreGoal);
        return true;
    }

    cancelInactivityFreeRoam() {
        this.myte.inactivityState = {
            isFreeRoaming: false,
            goal: null,
            followGoal: null,
            autonomyGoal: null
        };
    }

    doMovementLogic(deltaTime) {
        const m = this.myte;
        if (m.isDragging) return;

        if (m.goal === MOVE_TYPES.GRAVITY) {
            if (!m.queue.isEmpty()) {
                m.queue.update(deltaTime);
            } else {
                if (!m.isCurrentlyJumping()) {
                    // Scale probability to be per-second rather than per-frame.
                    const jumpChance = 0.2 * (deltaTime / 16.667);
                    if (Math.random() < jumpChance &&
                        m.parent.isMouseInContainer() &&
                        m.parent.inputHandler.getMouseWorldPosition().y < m.posY) {
                        m.doJump();
                    }
                }
                m.moveGravity();
            }
        } else if (m.goal === MOVE_TYPES.FREEROAM) {
            m.queue.update(deltaTime);
        } else if (m.goal === MOVE_TYPES.FOLLOW) {
            if (m.queue.isEmpty()) {
                this.updateTargetToFollowMouse();
                m.moveTowardsTarget();
            }
            m.queue.update(deltaTime);
        } else if (m.goal === MOVE_TYPES.GOHOME) {
            if (m.atOriginal === false) {
                if (!m.queue.isEmpty()) {
                    m.queue.update(deltaTime);
                    m.goHomePathState.directFallbackFrames = 0;
                } else {
                    const home = m.getHomePosition();
                    m.setTarget(home.x, home.y);

                    const distanceToHome = m.getDistanceToPoint(home.x, home.y);

                    if (!m.goHomePathState.hasPlannedPath &&
                        distanceToHome > 96 &&
                        Date.now() - m.goHomePathState.lastPlanAt > 300) {
                        this.beginGoHomeJourney(true);
                    }

                    m.goHomePathState.directFallbackFrames++;
                    if (distanceToHome <= 96 || m.goHomePathState.directFallbackFrames > 20) {
                        m.moveTowardsTargetDirect();
                    }
                }

                if (m.isAtHomePosition(1)) {
                    m.stop();
                }
            }
        } else if (m.goal === MOVE_TYPES.QUEUE_ONLY) {
            if (m.queue.isEmpty()) {
                this.watchCursor();
            } else {
                m.queue.update(deltaTime);
            }
        }
    }

    watchCursor() {
        const m = this.myte;
        const mouse = m.parent.inputHandler.getMouseWorldPosition({ element: m });
        const dx = mouse.x - m.posX;
        const dy = mouse.y - m.posY;
        const distanceFromMouse = Math.hypot(dx, dy);

        const innerRadius = 80;
        const outerRadius = 300;
        const diagonalThreshold = 0.5;

        if (distanceFromMouse >= outerRadius) return;

        let newDirection;

        if (distanceFromMouse < innerRadius) {
            newDirection = DIRECTION.SOUTH;
        } else {
            const absX = Math.abs(dx);
            const absY = Math.abs(dy);

            if (m.diagonalMovement &&
                absX > absY * diagonalThreshold &&
                absY > absX * diagonalThreshold) {
                if (dx > 0 && dy > 0) newDirection = DIRECTION.SOUTHEAST;
                else if (dx > 0 && dy < 0) newDirection = DIRECTION.NORTHEAST;
                else if (dx < 0 && dy > 0) newDirection = DIRECTION.SOUTHWEST;
                else newDirection = DIRECTION.NORTHWEST;
            } else if (absX > absY) {
                newDirection = dx > 0 ? DIRECTION.EAST : DIRECTION.WEST;
            } else {
                newDirection = dy > 0 ? DIRECTION.SOUTH : DIRECTION.NORTH;
            }
        }

        m.setDirection(newDirection);
    }

    updateTargetToFollowMouse(doXAxis = true, doYAxis = true) {
        const m = this.myte;
        if (this.shouldHoldInHomeSlot()) {
            const home = m.getHomePosition();
            m.setTarget(
                doXAxis ? home.x : null,
                doYAxis ? home.y : null,
                false
            );
            return;
        }

        const mouseDistance = m.getDistanceFromMouse();
        const mouse = m.parent.inputHandler.getMouseWorldPosition({ element: m });

        switch (m.followGoal) {
            case MOVE_FOLLOW_TYPES.CIRCLES:
                this.doCircleFollow(mouse, mouseDistance, doXAxis, doYAxis);
                break;
            case MOVE_FOLLOW_TYPES.RUNAWAY:
                this.doRunAway(doXAxis, doYAxis);
                break;
            case MOVE_FOLLOW_TYPES.LEASH:
                this.doLeashFollow(mouse, mouseDistance, doXAxis, doYAxis);
                break;
            case MOVE_FOLLOW_TYPES.NORMAL:
            default:
                if (mouseDistance > m.followRadius.min && mouseDistance < m.followRadius.max) {
                    m.setTarget(
                        doXAxis ? mouse.x : null,
                        doYAxis ? mouse.y : null,
                        false
                    );
                }
                break;
        }
    }

    doCircleFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) {
        const m = this.myte;
        if (mouseDistance > m.followRadius.max * 1.15) {
            m.setTarget(
                doXAxis ? mouse.x : null,
                doYAxis ? mouse.y : null,
                false
            );
            return;
        }

        m.followOrbitAngle += m.followOrbitSpeed * ((m._dt ?? 16.667) / 16.667);
        const orbitRadius = Utility.clamp(
            (m.followRadius.min + m.followRadius.max) / 3,
            m.followRadius.min,
            m.followRadius.max - 24
        );

        m.setTarget(
            doXAxis ? mouse.x + Math.cos(m.followOrbitAngle) * orbitRadius : null,
            doYAxis ? mouse.y + Math.sin(m.followOrbitAngle) * orbitRadius : null,
            false
        );
    }

    doLeashFollow(mouse, mouseDistance, doXAxis = true, doYAxis = true) {
        const m = this.myte;
        if (mouseDistance <= m.followRadius.min || mouseDistance >= m.followRadius.max) return;

        const dx = mouse.x - m.posX;
        const dy = mouse.y - m.posY;
        const distance = Math.max(mouseDistance, 1);
        const leashDistance = Utility.clamp(
            m.followLeashDistance,
            m.followRadius.min,
            m.followRadius.max - 16
        );

        m.setTarget(
            doXAxis ? mouse.x - (dx / distance) * leashDistance : null,
            doYAxis ? mouse.y - (dy / distance) * leashDistance : null,
            false
        );
    }

    doRunAway(doXAxis = true, doYAxis = true) {
        const m = this.myte;
        const mouseDistance = m.getDistanceFromMouse();

        if (mouseDistance < m.runAwayAngleDistance) {
            const currentX = m.posX;
            const currentY = m.posY;
            const mouse = m.parent.inputHandler.getMouseWorldPosition({ element: m });

            const dx3 = mouse.x - currentX;
            const dy3 = mouse.y - currentY;
            const angle = Math.atan2(dy3, dx3) + Math.PI;
            mouse.x += m.runAwayAngleDistance * Math.cos(angle);
            mouse.y += m.runAwayAngleDistance * Math.sin(angle);

            m.setTarget(
                doXAxis ? mouse.x : null,
                doYAxis ? mouse.y : null,
                true
            );
        }
    }
}
