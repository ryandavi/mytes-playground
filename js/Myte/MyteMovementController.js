class MyteMovementController {
    constructor(myte) {
        this.myte = myte;
    }

    setFollowMode(newGoal = null) {
        const m = this.myte;
        if (newGoal == null) newGoal = m.followGoal;
        m.followGoal = newGoal;
        m.parent.ui?.debugPanel?.updateButton?.('cycleFollowGoal');
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
        if (!m.queue.isEmpty()) return false;

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
                const mouse = m.parent?.inputHandler?.getMouseWorldPosition();
                const savedDest = m._movementDestination;
                if (mouse && Number.isFinite(mouse.x) && Number.isFinite(mouse.y)) {
                    m._movementDestination = { x: mouse.x, y: mouse.y };
                }
                m.moveTowardsTarget();
                m._movementDestination = savedDest;
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

    canMoveToPosition(newX, newY) {
        const m = this.myte;
        if (!m.parent?.gameMap?.gridSystem) return true;
        return m.parent.gameMap.gridSystem.isEntityPositionValid?.(m, newX, newY) ?? true;
    }

    moveTowardsTargetDirect(doXAxis = true, doYAxis = true) {
        const m = this.myte;
        m.ensureFiniteCoordinates('moveTowardsTargetDirect:start');
        const dx = m.targetX - m.posX;
        const dy = m.targetY - m.posY;
        const distance = Math.hypot(dx, dy);
        const step = m.stats.getSpeed() * ((m._dt ?? 16.667) / 16.667);

        if (Number.isFinite(distance) && distance !== 0) {
            if (doXAxis) m.posX += (dx / distance) * step;
            if (doYAxis) m.posY += (dy / distance) * step;
        }

        if (distance < step) m.snapPositionToTarget(doXAxis, doYAxis);
        m.ensureFiniteCoordinates('moveTowardsTargetDirect:end');
        m.setDirection(m.getDirection());
        m.setSpritePosition(m.posX, m.posY);
    }

    moveTowardsTarget(doXAxis = true, doYAxis = true) {
        const m = this.myte;
        m.ensureFiniteCoordinates('moveTowardsTarget:start');
        const dx = m.targetX - m.posX;
        const dy = m.targetY - m.posY;
        const distance = Math.hypot(dx, dy);
        const step = m.stats.getSpeed() * ((m._dt ?? 16.667) / 16.667);
        const originalX = m.posX;
        const originalY = m.posY;

        if (Number.isFinite(distance) && distance !== 0) {
            const moveX = (dx / distance) * step;
            const moveY = (dy / distance) * step;
            const gridSystem = m.parent?.gameMap?.gridSystem;
            let xBlocked = false;
            let yBlocked = false;
            const CORNER_SLIP = 1.0;

            if (doXAxis) {
                const newX = m.posX + moveX;
                if (this.canMoveToPosition(newX, m.posY)) {
                    m.posX = newX;
                    if (m.checkForCollisions && gridSystem) {
                        const potentialColliders = gridSystem.getPotentialColliders(m);
                        for (const collider of potentialColliders) {
                            if (m.parent.checkCollision(m, collider)) {
                                m.posX = originalX;
                                if (window._doorDebug && ['DOOR','GATE'].includes(collider.type)) {
                                    console.log(`[Door X] follow=${m.followMouse} collider=${collider.constructor?.name} dest=${JSON.stringify(m._movementDestination)} targetX=${m.targetX?.toFixed(1)}`);
                                }
                                m.tryOpenCollider(collider, 'x');
                                xBlocked = true;
                                break;
                            }
                        }
                    }
                } else {
                    // Check for openable doors before slipping around them
                    let doorOpenedX = false;
                    if (m.checkForCollisions && gridSystem) {
                        m.posX = newX;
                        const potentialColliders = gridSystem.getPotentialColliders(m);
                        m.posX = originalX;
                        for (const collider of potentialColliders) {
                            if (m.tryOpenCollider(collider, 'x')) { doorOpenedX = true; break; }
                        }
                    }
                    if (doorOpenedX) {
                        xBlocked = true;
                    } else {
                        const slipDir = moveY !== 0 ? Math.sign(moveY) : 1;
                        if (this.canMoveToPosition(newX, m.posY + slipDir * CORNER_SLIP)) {
                            m.posX = newX;
                            m.posY += slipDir * CORNER_SLIP;
                        } else if (this.canMoveToPosition(newX, m.posY - slipDir * CORNER_SLIP)) {
                            m.posX = newX;
                            m.posY -= slipDir * CORNER_SLIP;
                        } else {
                            xBlocked = true;
                            if (m.checkForCollisions && gridSystem) {
                                m.posX = newX;
                                const potentialColliders = gridSystem.getPotentialColliders(m);
                                m.posX = originalX;
                                for (const collider of potentialColliders) m.tryOpenCollider(collider, 'x');
                            }
                        }
                    }
                }
            }

            if (doYAxis) {
                const newY = m.posY + moveY;
                if (this.canMoveToPosition(m.posX, newY)) {
                    m.posY = newY;
                    if (m.checkForCollisions && gridSystem) {
                        const potentialColliders = gridSystem.getPotentialColliders(m);
                        for (const collider of potentialColliders) {
                            if (m.parent.checkCollision(m, collider)) {
                                m.posY = originalY;
                                if (window._doorDebug && ['DOOR','GATE'].includes(collider.type)) {
                                    console.log(`[Door Y] follow=${m.followMouse} collider=${collider.constructor?.name} dest=${JSON.stringify(m._movementDestination)} targetY=${m.targetY?.toFixed(1)}`);
                                }
                                m.tryOpenCollider(collider, 'y');
                                yBlocked = true;
                                break;
                            }
                        }
                    }
                } else {
                    // Check for openable doors before slipping around them
                    let doorOpenedY = false;
                    if (m.checkForCollisions && gridSystem) {
                        m.posY = newY;
                        const potentialColliders = gridSystem.getPotentialColliders(m);
                        m.posY = originalY;
                        for (const collider of potentialColliders) {
                            if (m.tryOpenCollider(collider, 'y')) { doorOpenedY = true; break; }
                        }
                    }
                    if (doorOpenedY) {
                        yBlocked = true;
                    } else {
                        const slipDir = moveX !== 0 ? Math.sign(moveX) : 1;
                        if (this.canMoveToPosition(m.posX + slipDir * CORNER_SLIP, newY)) {
                            m.posY = newY;
                            m.posX += slipDir * CORNER_SLIP;
                        } else if (this.canMoveToPosition(m.posX - slipDir * CORNER_SLIP, newY)) {
                            m.posY = newY;
                            m.posX -= slipDir * CORNER_SLIP;
                        } else {
                            yBlocked = true;
                            if (m.checkForCollisions && gridSystem) {
                                m.posY = newY;
                                const potentialColliders = gridSystem.getPotentialColliders(m);
                                m.posY = originalY;
                                for (const collider of potentialColliders) m.tryOpenCollider(collider, 'y');
                            }
                        }
                    }
                }
            }

            if (xBlocked && yBlocked && Math.abs(moveX) > 0.1 && Math.abs(moveY) > 0.1) {
                if (Math.abs(moveX) > Math.abs(moveY) * 0.5) {
                    const slideX = m.posX + moveX * 1.2;
                    if (this.canMoveToPosition(slideX, originalY)) m.posX = slideX;
                } else if (Math.abs(moveY) > Math.abs(moveX) * 0.5) {
                    const slideY = m.posY + moveY * 1.2;
                    if (this.canMoveToPosition(originalX, slideY)) m.posY = slideY;
                }
            }
        }

        if (distance < step) m.snapPositionToTarget(doXAxis, doYAxis);
        m.ensureFiniteCoordinates('moveTowardsTarget:end');
        m.setDirection(m.getDirection());
        m.setSpritePosition(m.posX, m.posY);
    }

    getOverlappingColliders() {
        const m = this.myte;
        if (!m.checkForCollisions) return [];
        const gridSystem = m.parent?.gameMap?.gridSystem;
        if (!gridSystem || !m.parent?.checkCollision) return [];
        return gridSystem.getPotentialColliders(m).filter(collider =>
            collider && collider !== m && !collider.isPickedUp && m.parent.checkCollision(m, collider)
        );
    }

    tryResolveColliderOverlap(force = false) {
        const m = this.myte;
        if (m.isDragging || !m.checkForCollisions) {
            m.colliderRecoveryState.overlapFrames = 0;
            return false;
        }

        const overlaps = this.getOverlappingColliders();
        if (overlaps.length === 0) {
            m.colliderRecoveryState.overlapFrames = 0;
            return false;
        }

        m.colliderRecoveryState.overlapFrames++;
        const now = Date.now();
        if (m.colliderRecoveryState.overlapFrames < (force ? 1 : 24)) return false;
        if (!force && now - m.colliderRecoveryState.lastRecoverAt < 700) return false;

        const gridSystem = m.parent?.gameMap?.gridSystem;
        const home = m.getHomePosition();
        const safePosition = gridSystem?.findNearestValidPositionForEntity?.(m, m.posX, m.posY, 22)
            ?? gridSystem?.findNearestValidPositionForEntity?.(m, m.targetX, m.targetY, 22)
            ?? gridSystem?.findNearestValidPositionForEntity?.(m, home.x, home.y, 18)
            ?? null;

        if (!safePosition) return false;

        m.setPosition(safePosition.x, safePosition.y);
        m.setTarget(safePosition.x, safePosition.y);
        m.setSpritePosition(safePosition.x, safePosition.y);
        m.physicsController?.reset?.();
        m.colliderRecoveryState.overlapFrames = 0;
        m.colliderRecoveryState.lastRecoverAt = now;
        return true;
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
