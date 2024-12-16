// State machine for the fetch game stages
const FetchStates = {
    PICKUP: 'pickup',
    THROW: 'throw',
    CHASE: 'chase',
    RETURN: 'return'
};

// Base Action class that all actions inherit from
class MyteAction {
    constructor(myte, options = {}) {
        this.myte = myte;
        this.options = {
            duration: options.duration || 200,
            current_duration: -1,
            total_time: 0,
            ...options
        };
    }

    start() {
        // Override in child classes
        if (this.options.duration > 0) {
            if (this.options.current_duration === -1) {
                this.options.current_duration = this.options.duration;
            }
        }

    }

    update() {
        // Override in child classes
        return true; // Return true when action is complete
    }

    complete() {
        // Override in child classes if needed
        return true;
    }

    isMovementAction() {
        return false;
    }

    isInterruptible() {
        return false;
    }
}
// Action for basic movement
class MoveAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.target = options.target[0];
    }

    start() {
        super.start();
        this.myte.setTarget(this.target.x, this.target.y);
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            return true;
        }
        this.myte.move_toward_target();
        return false;
    }

    isMovementAction() {
        return true;
    }
}

class EatElementAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.target = options.target[0];
    }

    start() {
        super.start();
        this.myte.setTarget(this.target.x, this.target.y);
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            return true;
        }        
        this.myte.move_toward_target();
        return false;
    }

    complete(){
        if(this.options.mapObject){
            this.options.mapObject.remove();
        }
    }

    isMovementAction() {
        return false;
    }
}

// Action for idle state
class IdleAction extends MyteAction {
    update() {
        if (this.options.current_duration === -1) {
            this.options.current_duration = this.options.duration;
        }
        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Action for expressing emotions/animations
class ExpressionAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.type = options.action_type;
        this.options.repeat = options.repeat || 1;
    }

    update() {
        this.options.current_duration--;

        if (this.options.current_duration <= 0) {
            this.options.repeat--;
            if (this.options.repeat <= 0) {
                // complete
                return true;
            }
            this.options.current_duration = this.options.duration;
        }
        return false;
    }
}

// Action for running laps around an element
class RunLapsAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targets = options.target;
        this.currentTargetIndex = options.current_target_index || 0;
        this.options.repeat = options.repeat || 1;
    }

    start() {
        super.start();
        this.myte.setTarget(
            this.targets[this.currentTargetIndex].x,
            this.targets[this.currentTargetIndex].y
        );
        this.myte.reset();
    }

    update() {
        if (this.myte.is_at_target()) {
            this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targets.length;
            if (this.currentTargetIndex === 0) {
                this.options.repeat--;
                if (this.options.repeat <= 0) {
                    // complete
                    return true;
                }
            }
            this.myte.setTarget(
                this.targets[this.currentTargetIndex].x,
                this.targets[this.currentTargetIndex].y
            );
        }
        this.myte.move_toward_target();
        return false;
    }

    complete() {
        console.log("complete laps");
    }


    isMovementAction() {
        return true;
    }
}

// Action for following mouse cursor
class FollowMouseAction extends MyteAction {
    update() {
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();
        return false;
    }

    isMovementAction() {
        return true;
    }

    isInterruptible() {
        return true;
    }
}

// Action for dancing
class DanceAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            ...options,
            duration: options.duration || 2000,
        });
        this.danceSteps = [
            { x: 0, y: -20 },
            { x: 20, y: 0 },
            { x: 0, y: 20 },
            { x: -20, y: 0 }
        ];
        this.currentStep = 0;
        this.stepDuration = 250;
        this.stepTimer = this.stepDuration;
    }

    start() {
        super.start();
        this.baseX = this.myte.posX;
        this.baseY = this.myte.posY;
        // this.myte.queue.addExpression("dance", 200, 8);
        this.options.current_duration = this.options.duration;
    }

    update() {
        this.stepTimer -= 16; // Assuming 60fps

        // Move to the next step
        if (this.stepTimer <= 0) {
            this.currentStep = (this.currentStep + 1) % this.danceSteps.length;
            this.stepTimer = this.stepDuration;

            const step = this.danceSteps[this.currentStep];
            this.myte.setTarget(
                this.baseX + step.x,
                this.baseY + step.y
            );
        }

        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Action for sleep animation
class SimpleSleepAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            ...options,
            duration: options.duration || 5000,
        });
        this.zPosition = 0;
        this.zSpeed = 0.1;
    }

    start() {
        super.start();
        this.baseY = this.myte.posY;
        this.myte.queue.addExpression("sleep", 500, 10);
    }

    update() {
        // Gentle floating animation while sleeping
        this.zPosition += this.zSpeed;
        if (this.zPosition > 1 || this.zPosition < 0) {
            this.zSpeed = -this.zSpeed;
        }

        this.myte.setPosition(null, this.baseY - (Math.sin(this.zPosition * Math.PI) * 10));

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Action for going to an object/Myte
class GoToObjectAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targetObject = options.targetObject;
    }

    update() {
        // Calculate target position based on object direction
        const horizontal = (this.targetObject.direction === DIRECTION.LEFT) ? "right" :
            (this.targetObject.direction === DIRECTION.RIGHT) ? "left" : "center";

        const vertical = (this.targetObject.direction === DIRECTION.NORTH) ? "bottom" :
            (this.targetObject.direction === DIRECTION.SOUTH) ? "top" : "bottom";

        const targetRect = this.targetObject.getOffsetRect();
        const myteRect = this.myte.getRect();

        // Calculate position using the same logic as before
        const targetPos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);

        // Set target and move toward it
        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return this.myte.is_at_target();
    }

    calculatePosition(myteRect, destinationRect, horizontal, vertical, insideHorizontal, insideVertical) {
        const myteOffset = {
            left: (insideHorizontal ? -1 : 1) * 35,
            right: (insideHorizontal ? -1 : 1) * 35,
            top: (insideVertical ? -1 : 1) * 35,
            bottom: (insideVertical ? 1 : -1) * 35
        };

        const positions = {
            left: destinationRect.x - (insideHorizontal ? 0 : myteRect.width) + myteOffset.left,
            center: destinationRect.x + (destinationRect.width / 2) - (myteRect.width / 2),
            right: destinationRect.x + destinationRect.width - (insideHorizontal ? myteRect.width : 0) - myteOffset.right,
            top: destinationRect.y - (insideVertical ? 0 : myteRect.height) + myteOffset.top,
            middle: destinationRect.y + (destinationRect.height / 2) - (myteRect.height / 2),
            bottom: destinationRect.y + destinationRect.height - (insideVertical ? myteRect.height : 0) + myteOffset.bottom
        };

        return {
            x: positions[horizontal] || positions.center,
            y: positions[vertical] || positions.bottom
        };
    }

    isMovementAction() {
        return true;
    }
}

// Action for picking up another Myte
class CarryPickupAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targetObject = options.targetObject;
        this.startPosition = {
            x: this.targetObject.posX,
            y: this.targetObject.posY
        };
        this.CARRY_OFFSET = 45;
    }

    update() {
        if (this.options.current_duration === -1) {
            this.options.current_duration = this.options.duration;
        }

        const progress = 1 - (this.options.current_duration / this.options.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY - this.CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        if (this.targetObject) {
            this.targetObject.setPosition(currentPos.x, currentPos.y);
            this.targetObject.setSpritePosition(currentPos.x, currentPos.y);
        }

        this.options.current_duration--;

        if (this.options.current_duration <= 0) {
            // Start the carry action
            this.myte.queue.add('carry', {
                targetObject: this.targetObject,
                duration: -1
            });

            // Add being_carried to target's queue
            this.targetObject.queue.clear();
            this.targetObject.queue.add('being_carried', {
                carrierMyte: this.myte,
                duration: -1
            });
        }

        return this.options.current_duration <= 0;
    }
}

// Action for carrying another Myte
class CarryAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targetObject = options.targetObject;
        this.CARRY_OFFSET = 45;
    }

    update() {

        // Update myte to follow mouse
        this.myte.updateTargetToFollowMouse();
        this.myte.move_toward_target();

        if (this.targetObject) {
            const offset = { x: 0, y: -this.CARRY_OFFSET };
            this.targetObject.setPosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
            this.targetObject.setSpritePosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
        }

        return false; // Carry action continues until interrupted
    }

    isMovementAction() {
        return true;
    }
}

// Action for being carried
class BeingCarriedAction extends MyteAction {
    update() {
        return false; // Continue until interrupted
    }
}

// Action for putting down a carried Myte
class CarryPutdownAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targetObject = options.targetObject;
        this.startPosition = {
            x: this.targetObject.posX,
            y: this.targetObject.posY
        };
        this.CARRY_OFFSET = 45;
    }

    update() {
        if (this.options.current_duration === -1) {
            this.options.current_duration = this.options.duration;
        }

        const progress = 1 - (this.options.current_duration / this.options.duration);
        const easedProgress = 1 - Math.pow(1 - progress, 3);

        const currentPos = {
            x: this.startPosition.x + (this.myte.posX - this.startPosition.x) * easedProgress,
            y: this.startPosition.y + ((this.myte.posY + this.CARRY_OFFSET) - this.startPosition.y) * easedProgress
        };

        if (this.targetObject) {
            this.targetObject.setPosition(currentPos.x, currentPos.y);
            this.targetObject.setSpritePosition(currentPos.x, currentPos.y);
        }

        this.options.current_duration--;

        if (this.options.current_duration <= 0) {
            // Clear carried Myte's queue
            const carriedMyte = this.targetObject;
            if (carriedMyte) {
                carriedMyte.queue.clear();
            }
        }

        return this.options.current_duration <= 0;
    }
}

// Action for following an object/Myte
class FollowObjectAction extends MyteAction {
    constructor(myte, options) {
        super(myte, options);
        this.targetObject = options.targetObject;
    }

    update() {
        const horizontal = (this.targetObject.direction === DIRECTION.LEFT) ? "right" :
            (this.targetObject.direction === DIRECTION.RIGHT) ? "left" : "center";

        const vertical = (this.targetObject.direction === DIRECTION.NORTH) ? "bottom" :
            (this.targetObject.direction === DIRECTION.SOUTH) ? "top" : "bottom";

        const targetRect = this.targetObject.getOffsetRect();
        const myteRect = this.myte.getRect();

        const targetPos = this.calculatePosition(myteRect, targetRect, horizontal, vertical, false, true);

        this.myte.setTarget(targetPos.x, targetPos.y);
        this.myte.move_toward_target();

        return false; // Continue following until interrupted
    }

    calculatePosition(myteRect, destinationRect, horizontal, vertical, insideHorizontal, insideVertical) {
        // Same calculation method as in GoToObjectAction
        return new GoToObjectAction(this.myte, this.options)
            .calculatePosition(myteRect, destinationRect, horizontal, vertical, insideHorizontal, insideVertical);
    }

    isMovementAction() {
        return true;
    }

    isInterruptible() {
        return true;
    }
}

// Jumping action with physics
class JumpAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 1000,
            height: options.height || 100,
            ...options
        });
        this.initialY = myte.posY;
        this.maxHeight = this.initialY - this.options.height;
        this.gravity = 0.5;
        this.velocity = -12; // Negative means going up
    }

    update() {
        this.velocity += this.gravity;
        this.myte.posY += this.velocity;

        // Bounce back up if we hit the ground
        if (this.myte.posY >= this.initialY) {
            this.myte.posY = this.initialY;
            this.velocity = -this.velocity * 0.5; // Reduce bounce height

            // Stop if bounce is too small
            if (Math.abs(this.velocity) < 2) {
                return true;
            }
        }

        this.myte.setSpritePosition(null, this.myte.posY);
        return false;
    }
}

// Circle around a target point
class CircleAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 3000,
            radius: options.radius || 50,
            centerX: options.centerX || myte.posX,
            centerY: options.centerY || myte.posY,
            ...options
        });
        this.angle = 0;
        this.speed = 0.01;
    }


    update() {
        this.angle += this.speed;

        const newX = this.options.centerX + Math.cos(this.angle) * this.options.radius;
        const newY = this.options.centerY + Math.sin(this.angle) * this.options.radius;

        this.myte.setTarget(newX, newY);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Zigzag movement pattern
class ZigzagAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 2000,
            amplitude: options.amplitude || 100, // height
            frequency: options.frequency || 0.05, // width
            direction: options.direction || { x: 1, y: 0 },
            ...options
        });
        this.startX = myte.posX;
        this.startY = myte.posY;
        this.distance = 0;
    }

    update() {
        this.distance += 1;

        const zigzag = Math.sin(this.distance * this.options.frequency) * this.options.amplitude;
        const newX = this.startX + this.distance * this.options.direction.x - zigzag * this.options.direction.y;
        const newY = this.startY + this.distance * this.options.direction.y + zigzag * this.options.direction.x;

        this.myte.setTarget(newX, newY);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Spin in place
class SpinAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 1000,
            rotations: options.rotations || 2,
            ...options
        });
        this.directions = [
            DIRECTION.NORTH,
            DIRECTION.NORTHEAST,
            DIRECTION.EAST,
            DIRECTION.SOUTHEAST,
            DIRECTION.SOUTH,
            DIRECTION.SOUTHWEST,
            DIRECTION.WEST,
            DIRECTION.NORTHWEST
        ];
        this.currentDirectionIndex = 0;
        this.frameDelay = 16; // Math.floor(options.duration / (this.directions.length * options.rotations));
        this.frameTimer = this.frameDelay;
    }

    update() {
        this.frameTimer--;
        if (this.frameTimer <= 0) {
            this.currentDirectionIndex = (this.currentDirectionIndex + 1) % this.directions.length;
            this.myte.setDirection(this.directions[this.currentDirectionIndex]);
            this.frameTimer = this.frameDelay;
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Show affection to another Myte
class ShowAffectionAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 1500,
            targetMyte: options.targetMyte,
            ...options
        });
        this.heartEmitter = null;
        this.emitDelay = 200;
        this.emitTimer = 0;
    }

    start() {
        super.start();
        // Create heart particles if we had a particle system
        this.myte.queue.addExpression("heart", 300, 3);
    }

    update() {
        // Emit hearts periodically
        this.emitTimer -= 16;
        if (this.emitTimer <= 0) {
            // Could emit heart particles here
            this.emitTimer = this.emitDelay;
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    complete() {
        // Cleanup any particle effects
    }
}

// Run away from a target object or Myte
class RunAwayAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            targetObject: options.targetObject,
            panicDistance: options.panicDistance || 400,
            runDistance: options.runDistance || 350,
            duration: options.duration || -1, // -1 means run indefinitely
            ...options
        });
    }

    update() {
        const target = this.options.targetObject;
        if (!target) return true;

        // Calculate distance to target
        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Only run if within panic distance
        if (distance < this.options.panicDistance) {
            // Calculate angle away from target
            const angle = Math.atan2(dy, dx) + Math.PI;

            // Set target point away from scary object
            const runX = this.myte.posX + Math.cos(angle) * this.options.runDistance;
            const runY = this.myte.posY + Math.sin(angle) * this.options.runDistance;

            // Ensure we don't run off screen
            const boundedX = Math.max(0, Math.min(runX, this.myte.parent.getMaxDimensions().width));
            const boundedY = Math.max(0, Math.min(runY, this.myte.parent.getMaxDimensions().height));

            this.myte.setTarget(boundedX, boundedY);
            

            // Occasionally show panic expression
            if (Math.random() < 0.02) {
                this.myte.queue.addExpressionToBeginning("panic", 200);
            }

        }

        this.myte.move_toward_target();

        // Check duration if set
        if (this.options.duration > 0) {
            this.options.current_duration--;
            return this.options.current_duration <= 0;
        }

        return false; // Continue running indefinitely if no duration set
    }

    isMovementAction() {
        return false;
    }

    isInterruptible() {
        return true;
    }
}

// Hide behind an object
class HideAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            hideTarget: options.hideTarget, // Object to hide behind
            scaryObject: options.scaryObject, // Object to hide from
            peekInterval: options.peekInterval || 2000,
            duration: options.duration || 5000,
            ...options
        });
        this.peekTimer = this.options.peekInterval;
        this.isPeeking = false;
    }

    update() {
        const hideTarget = this.options.hideTarget;
        const scaryObject = this.options.scaryObject;

        if (!hideTarget || !scaryObject) return true;

        // Get the far side of the hiding spot relative to scary object
        const dx = hideTarget.posX - scaryObject.posX;
        const dy = hideTarget.posY - scaryObject.posY;
        const angle = Math.atan2(dy, dx);

        // Calculate hide position behind object
        const hideX = hideTarget.posX + Math.cos(angle) * 30;
        const hideY = hideTarget.posY + Math.sin(angle) * 30;

        // Move to hide position
        this.myte.setTarget(hideX, hideY);
        this.myte.move_toward_target();

        // Handle peeking behavior
        this.peekTimer -= 16;
        if (this.peekTimer <= 0) {
            this.isPeeking = !this.isPeeking;
            this.peekTimer = this.options.peekInterval;

            if (this.isPeeking) {
                this.myte.queue.addExpression("peek", 500);
            }
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Sleep action with bobbing animation and Z's
class SleepAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 5000,
            bobHeight: options.bobHeight || 5,
            ...options
        });
        this.bobPhase = 0;
        this.zTimer = 1000; // Time between Z's
        this.startY = myte.posY;
    }

    start() {
        super.start();
        this.myte.queue.addExpression("sleep", 1000);
    }

    update() {
        // Gentle bobbing motion
        this.bobPhase += 0.05;
        const newY = this.startY + Math.sin(this.bobPhase) * this.options.bobHeight;
        this.myte.setPosition(null, newY);
        this.myte.setSpritePosition(null, newY);

        // Spawn Z's periodically
        this.zTimer -= 16;
        if (this.zTimer <= 0) {
            // Could spawn Z particle effect here
            this.zTimer = 1000;
            // this.myte.queue.addExpression("sleep", 500);
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }
}

// Inspect object action with curiosity animation
class InspectAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            target: options.target,
            duration: options.duration || 3000,
            ...options
        });
        this.inspectPoints = this.generateInspectPoints();
        this.currentPoint = 0;
        this.pointDuration = 500;
        this.pointTimer = this.pointDuration;
    }

    generateInspectPoints() {
        const target = this.options.target;
        const points = [];
        const radius = 40;
        const numPoints = 4;

        for (let i = 0; i < numPoints; i++) {
            const angle = (i / numPoints) * Math.PI * 2;
            points.push({
                x: target.posX + Math.cos(angle) * radius,
                y: target.posY + Math.sin(angle) * radius
            });
        }
        return points;
    }

    update() {
        this.pointTimer -= 16;
        if (this.pointTimer <= 0) {
            this.currentPoint = (this.currentPoint + 1) % this.inspectPoints.length;
            this.pointTimer = this.pointDuration;
            this.myte.queue.addExpression("curious", 300);
        }

        const point = this.inspectPoints[this.currentPoint];
        this.myte.setTarget(point.x, point.y);
        this.myte.move_toward_target();

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}


// Play tag with another Myte
class PlayTagAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            duration: options.duration || 5000,
            targetMyte: options.targetMyte,
            catchDistance: options.catchDistance || 30,
            ...options
        });
        this.isIt = options.isIt || true;
    }

    update() {
        const target = this.options.targetMyte;
        if (!target) return true;

        const dx = target.posX - this.myte.posX;
        const dy = target.posY - this.myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (this.isIt) {
            // Chase target
            this.myte.setTarget(target.posX, target.posY);
            this.myte.move_toward_target();

            // Tag target if close enough
            if (distance < this.options.catchDistance) {
                this.isIt = false;
                target.queue.add('play_tag', {
                    targetMyte: this.myte,
                    isIt: true,
                    duration: this.options.current_duration
                });
                return true;
            }
        } else {
            // Run away
            const angle = Math.atan2(dy, dx) + Math.PI;
            const runDistance = 100;
            this.myte.setTarget(
                this.myte.posX + Math.cos(angle) * runDistance,
                this.myte.posY + Math.sin(angle) * runDistance
            );
            this.myte.move_toward_target();
        }

        this.options.current_duration--;
        return this.options.current_duration <= 0;
    }

    isMovementAction() {
        return true;
    }
}

// Action to play fetch with throwable objects
class PlayFetchAction extends MyteAction {
    constructor(myte, options) {
        super(myte, {
            throwable: options.throwable, // The object to throw
            throwStrength: options.throwStrength || 10,
            maxThrowDistance: options.maxThrowDistance || 300,
            fetchState: FetchStates.PICKUP,
            ...options
        });

        this.throwPosition = null;
        this.throwTarget = null;
        this.throwProgress = 0;
        this.arcHeight = 100; // Height of throw arc
    }

    start() {
        super.start();
        // Start with excitement expression
        this.myte.queue.addExpression("excited", 500);
    }

    update() {
        switch (this.options.fetchState) {
            case FetchStates.PICKUP:
                return this.handlePickup();
            case FetchStates.THROW:
                return this.handleThrow();
            case FetchStates.CHASE:
                return this.handleChase();
            case FetchStates.RETURN:
                return this.handleReturn();
            default:
                return true;
        }
    }

    handlePickup() {
        if (!this.options.throwable) return true;

        // Move to throwable
        const dx = this.options.throwable.posX - this.myte.posX;
        const dy = this.options.throwable.posY - this.myte.posY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 10) {
            this.myte.setTarget(this.options.throwable.posX, this.options.throwable.posY);
            this.myte.move_toward_target();
            return false;
        }

        // Picked up, prepare to throw
        this.throwPosition = {
            x: this.myte.posX,
            y: this.myte.posY
        };

        // Calculate throw target based on mouse position or random direction
        const angle = Math.random() * Math.PI * 2;
        const throwDistance = Math.random() * this.options.maxThrowDistance;
        this.throwTarget = {
            x: this.throwPosition.x + Math.cos(angle) * throwDistance,
            y: this.throwPosition.y + Math.sin(angle) * throwDistance
        };

        this.throwProgress = 0;
        this.options.fetchState = FetchStates.THROW;
        return false;
    }

    handleThrow() {
        this.throwProgress += this.options.throwStrength / 100;

        if (this.throwProgress >= 1) {
            this.options.fetchState = FetchStates.CHASE;
            return false;
        }

        // Calculate arc trajectory
        const x = this.throwPosition.x + (this.throwTarget.x - this.throwPosition.x) * this.throwProgress;
        const y = this.throwPosition.y + (this.throwTarget.y - this.throwPosition.y) * this.throwProgress
            - Math.sin(this.throwProgress * Math.PI) * this.arcHeight;

        // Update throwable position
        if (this.options.throwable) {
            this.options.throwable.setPosition(x, y);
            this.options.throwable.setSpritePosition(x, y);
        }

        return false;
    }

    handleChase() {
        if (!this.options.throwable) return true;

        // Chase the thrown object
        this.myte.setTarget(this.throwTarget.x, this.throwTarget.y);
        this.myte.move_toward_target();

        const distance = Math.sqrt(
            Math.pow(this.myte.posX - this.throwTarget.x, 2) +
            Math.pow(this.myte.posY - this.throwTarget.y, 2)
        );

        // If we reached the object
        if (distance < 10) {
            // Show happy expression
            this.myte.queue.addExpression("happy", 500);
            this.options.fetchState = FetchStates.RETURN;
        }

        return false;
    }

    handleReturn() {
        // Return to original position
        this.myte.setTarget(this.throwPosition.x, this.throwPosition.y);
        this.myte.move_toward_target();

        // Move throwable with Myte
        if (this.options.throwable) {
            const offset = { x: 0, y: -20 };
            this.options.throwable.setPosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
            this.options.throwable.setSpritePosition(
                this.myte.posX + offset.x,
                this.myte.posY + offset.y
            );
        }

        // If we're back at the start
        if (this.myte.is_at_target()) {
            // Start over
            this.throwProgress = 0;
            this.options.fetchState = FetchStates.THROW;
        }

        return false;
    }

    isMovementAction() {
        return true;
    }
}


// Enhanced MyteQueue class that uses the new action system
class MyteQueue {
    constructor(myte) {
        this.myte = myte;
        this.queue = [];
        this.isDoingAction = false;
        this.max_total_time = 1500;

        // Action type mapping
        this.actionTypes = {

            // actions
            'idle': IdleAction,
            'expression': ExpressionAction,
            'dance': DanceAction,
            'simpleSleep': SimpleSleepAction,
            'eat_element': EatElementAction,

            // movement
            'follow_mouse': FollowMouseAction,
            'move': MoveAction,
            'run_laps': RunLapsAction,
            'follow_object': FollowObjectAction,
            'go_to_object': GoToObjectAction,

            // pickup/carrying
            'carry_pickup': CarryPickupAction,
            'carry': CarryAction,
            'being_carried': BeingCarriedAction,
            'carry_putdown': CarryPutdownAction,

            // test
            'jump': JumpAction,
            'circle': CircleAction,
            'zigzag': ZigzagAction,
            'spin': SpinAction,
            'show_affection': ShowAffectionAction,
            'play_tag': PlayTagAction,

            'run_away': RunAwayAction,
            'hide': HideAction,
            'sleep': SleepAction,
            'inspect': InspectAction,
            'play_fetch': PlayFetchAction

        };
    }

    count() {
        return this.queue.length;
    }

    addMoveToElement(element = null, duration = 1) {

        const destination = this.myte.parent.getLocalOffset(element);
        this.add('move', {
            target: [{
                x: destination.x,
                y: destination.y
            }],
            mapObject: element,
            duration: 300
        });
    }

    addPickupMyte(targetObject) {
        if (!targetObject || targetObject.queue.isBeingCarried()) return false;

        this.add("go_to_object", {
            targetObject: targetObject
        });

        this.add("carry_pickup", {
            targetObject: targetObject,
            duration: 100
        });

        return true;
    }

    addFollowObject(element) {
        this.add("follow_object", {
            targetObject: element
        });
    }

    addPutDownMyte() {
        const currentAction = this.getCurrentAction();
        if (!(currentAction instanceof CarryAction) || !currentAction.targetObject) return false;

        this.clear();

        this.add("carry_putdown", {
            targetObject: currentAction.targetObject,
            duration: 100
        });

        return true;
    }

    add(actionType, options = {}) {
        const ActionClass = this.actionTypes[actionType];
        if (!ActionClass) {
            console.error(`Unknown action type: ${actionType}`);
            return;
        }

        const action = new ActionClass(this.myte, options);
        this.queue.push(action);
    }

    addToBeginning(actionType, options = {}) {
        const ActionClass = this.actionTypes[actionType];
        if (!ActionClass) {
            console.error(`Unknown action type: ${actionType}`);
            return;
        }

        const action = new ActionClass(this.myte, options);
        this.queue.unshift(action);
    }

    update() {
        if (this.queue.length === 0) return;

        const currentAction = this.queue[0];

        if (!this.isDoingAction) {
            currentAction.start();
            this.isDoingAction = true;
        }

        if (currentAction.update()) {
            currentAction.complete();
            this.removeCurrentAction();
            if (this.queue.length > 0) {
                // go to next item
                this.queue[0].start();
                this.isDoingAction = true;
            }
        }
    }

    removeCurrentAction() {
        this.queue.shift();
        this.isDoingAction = false;
    }

    clear() {
        this.queue = [];
        this.isDoingAction = false;
    }

    getCurrentAction() {
        return this.queue[0] || null;
    }

    isEmpty() {
        return this.queue.length === 0;
    }

    // Convenience methods for common actions
    addIdle(duration = 200) {
        this.add('idle', { duration });
    }

    addExpression(type, duration = 50, repeat = 1) {
        this.add('expression', { action_type: type, duration, repeat });
    }

    addExpressionToBeginning(type, duration = 50, repeat = 1) {
        this.addToBeginning('expression', { action_type: type, duration, repeat });
    }

    addDance(duration = 2000) {
        this.add('dance', { duration });
    }

    addSimpleSleep(duration = 5000) {
        this.add('simple_sleep', { duration });
    }

    addFollowMouse() {
        this.add('follow_mouse');
    }

    // Add convenience methods to MyteQueue:
    addJump(height = 100) {
        this.add('jump', { height });
    }

    addCircle(centerX, centerY, radius = 50, duration = 3000) {
        this.add('circle', { centerX, centerY, radius, duration });
    }

    addEatElement(element) {
        this.addMoveToElement(element);
        this.add('eat_element', { element });
    }

    addZigzag(direction = { x: 1, y: 0 }, duration = 2000) {
        this.add('zigzag', { direction, duration });
    }

    addSpin(rotations = 2, duration = 1000) {
        this.add('spin', { rotations, duration });
    }

    addShowAffection(targetMyte) {
        this.add('show_affection', { targetMyte });
    }

    addPlayTag(targetMyte, isIt = true) {
        this.add('play_tag', { targetMyte, isIt });
    }

    addRunLaps(element, repeat = 5) {
        // Calculate targets based on element
        const targets = this.calculateLapTargets(element);
        this.add('run_laps', { target: targets, repeat });
    }

    // Add convenience methods to MyteQueue:
    addRunAway(targetObject, duration = -1) {
        this.add('run_away', { targetObject, duration });
    }

    addHide(hideTarget, scaryObject, duration = 5000) {
        this.add('hide', { hideTarget, scaryObject, duration });
    }

    addSleep(duration = 5000) {
        this.add('sleep', { duration });
    }

    addInspect(target, duration = 3000) {
        this.add('inspect', { target, duration });
    }

    addPlayFetch(throwable, throwStrength = 10) {
        this.add('play_fetch', {
            throwable,
            throwStrength
        });
    }

    addCarry(targetMyte) {
        if (!targetMyte.queue.isBeingCarried()) {
            this.add('pickup', { targetObject: targetMyte });
            this.add('carry', { targetObject: targetMyte });
        }
    }

    isBeingCarried() {
        const current = this.getCurrentAction();
        return current instanceof BeingCarriedAction;
    }

    isCarrying() {
        const current = this.getCurrentAction();
        return current instanceof CarryAction;
    }

    calculateLapTargets(element) {
        // Implementation to calculate targets for running laps
        // This would return an array of target positions around the element
        return [
            { x: element.offsetLeft - 50, y: element.offsetTop },
            { x: element.offsetLeft + element.offsetWidth + 50, y: element.offsetTop }
        ];
    }
}