// Enhanced GameMapParticleSystem class to support particles for any object
class GameMapParticleSystem extends ParticleSystem {
    constructor(map) {
        super(map);
        this.map = map;
        this.objectEffects = new Map(); // Store effects by object ID (replaces myteEffects)
    }

    // Generic method to create object tracker for any type of object
    createObjectTracker(object, options = {}) {
        // If this is a Myte with directional emission, use the specialized tracker
        if (object.direction !== undefined && object.is_moving !== undefined) {
            return this.createDirectionalTracker(object, options);
        }
        
        // For regular objects, create a simpler tracker
        return {
            x: object.posX + (object.size?.width || 0) / 2,
            y: object.posY + (object.size?.height || 0) / 2,
            // This gets called by the emitter during updates
            update: function() {
                if (!object) return;
                
                // Position at center of object by default
                this.x = object.posX + (object.size?.width || 0) / 2;
                this.y = object.posY + (object.size?.height || 0) / 2;
                
                // Apply any offsets from options
                if (options.offsetX) this.x += options.offsetX;
                if (options.offsetY) this.y += options.offsetY;
                
                // Position at feet if specified
                if (options.positionAtFeet) {
                    this.y = object.posY + (object.size?.height || 0);
                }
                
                // Add slight randomization if specified
                if (options.randomizePosition) {
                    const randomFactor = options.randomizeFactor || 10;
                    this.x += (Math.random() - 0.5) * randomFactor;
                    this.y += (Math.random() - 0.5) * randomFactor;
                }
            }
        };
    }

    // Directional tracker (specialized for Mytes and other directional objects)
// In the createDirectionalTracker method, add support for collider-based offsets
createDirectionalTracker(object, options = {}) {
    // For collider-aware positioning (Mytes or other objects with colliders)
    let defaultOffsets;
    
    // If the object has a collider, create intelligent default offsets
    if (object.collider) {
        defaultOffsets = {
            // North (moving up): Position at bottom center of collider
            [DIRECTION.NORTH]: { 
                x: object.collider.offsetX + object.collider.width/2, 
                y: object.collider.offsetY + object.collider.height 
            },
            
            // South (moving down): Position at top center of collider
            [DIRECTION.SOUTH]: { 
                x: object.collider.offsetX + object.collider.width/2, 
                y: object.collider.offsetY 
            },
            
            // East (moving right): Position at center left of collider
            [DIRECTION.EAST]: { 
                x: object.collider.offsetX, 
                y: object.collider.offsetY + object.collider.height/2
            },
            
            // West (moving left): Position at center right of collider
            [DIRECTION.WEST]: { 
                x: object.collider.offsetX + object.collider.width, 
                y: object.collider.offsetY + object.collider.height/2 
            },
            
            // Default offset (centered at bottom of collider)
            default: { 
                x: object.collider.offsetX + object.collider.width/2, 
                y: object.collider.offsetY + object.collider.height 
            }
        };
    } else {
        // Simple default offsets for objects without colliders
        defaultOffsets = {
            [DIRECTION.NORTH]: { x: 0, y: 0 },
            [DIRECTION.SOUTH]: { x: 0, y: 0 },
            [DIRECTION.EAST]: { x: 0, y: 0 },
            [DIRECTION.WEST]: { x: 0, y: 0 },
            default: { x: 0, y: 0 }
        };
    }

    // Get directional offsets based on options or use defaults
    const offsets = options.offsets || defaultOffsets;

    return {
        x: object.posX,
        y: object.posY,
        // This gets called by the emitter during updates
        update: function() {
            if (!object) return;

            // Get current offset based on direction
            const offset = offsets[object.direction] || offsets.default;

            // Base position - at the object's position (not centered)
            this.x = object.posX;
            this.y = object.posY;

            // Apply directional offset if moving
            const isStationary = object.is_moving ? !object.is_moving() : false;
            
            if (!isStationary) {
                this.x += offset.x;
                this.y += offset.y;
            } else if (options.stationaryOffset) {
                // Apply stationary offset if defined
                this.x += options.stationaryOffset.x;
                this.y += options.stationaryOffset.y;
            } else {
                // Apply default offset when stationary
                this.x += offsets.default.x;
                this.y += offsets.default.y;
            }

            // Apply any additional custom offsets from options
            if (options.additionalOffset) {
                this.x += options.additionalOffset.x;
                this.y += options.additionalOffset.y;
            }
            
            // Add randomization if specified
            if (options.randomizePosition) {
                const randomFactor = options.randomizeFactor || 10;
                this.x += (Math.random() - 0.5) * randomFactor;
                this.y += (Math.random() - 0.5) * randomFactor;
            }
        }
    };
}

    // Unified method to attach particle effects to any object
    attachParticleEffect(object, effectType, options = {}) {
        // Skip if no valid object
        if (!object || !object.posX || !object.posY) {
            console.warn('Cannot attach particles: Invalid object');
            return null;
        }

        // Auto-generate an ID if the object doesn't have one
        const objectId = object.id || ('obj_' + Math.random().toString(36).substr(2, 9));
        
        // Remove any existing effect of this type if it exists
        this.detachEffectFromObject(object, objectId, effectType);

        // Create a position tracker for this object
        const tracker = this.createObjectTracker(object, options);

        // Get default options based on effect type
        const defaultOptions = this.getDefaultOptionsForEffect(effectType);
        
        // Merge defaults with provided options
        const mergedOptions = { ...defaultOptions, ...options, target: tracker };

        // Create emitter based on effect type
        let emitter;
        
        switch (effectType) {
            case 'dust':
                emitter = this.createDustEmitter(object, mergedOptions);
                break;
            case 'sparkle':
                emitter = this.createSparkleEmitter(object, mergedOptions);
                break;
            case 'trail':
                emitter = this.createTrailEmitter(object, mergedOptions);
                break;
            case 'glow':
                emitter = this.createGlowEmitter(object, mergedOptions);
                break;
            default:
                // For standard effect types, use the base createEmitter
                emitter = this.createEmitter(effectType, mergedOptions);
        }

        // Store reference to this effect in our tracking Map
        if (!this.objectEffects.has(objectId)) {
            this.objectEffects.set(objectId, new Map());
        }
        this.objectEffects.get(objectId).set(effectType, emitter);

        // Also store on the object if requested
        if (options.storeReference && emitter) {
            if (!object.particleEmitters) {
                object.particleEmitters = {};
            }
            object.particleEmitters[effectType] = emitter;
        }

        return emitter;
    }

    // Helper method to detach effects from an object
    detachEffectFromObject(object, objectId, effectType) {
        // Detach from objectEffects tracking
        if (this.objectEffects.has(objectId)) {
            const effects = this.objectEffects.get(objectId);

            if (effectType && effects.has(effectType)) {
                // Deactivate the specific emitter
                const emitter = effects.get(effectType);
                emitter.active = false;
                effects.delete(effectType);
            } else if (!effectType) {
                // Deactivate all emitters for this object
                effects.forEach(emitter => emitter.active = false);
                this.objectEffects.delete(objectId);
            }
        }
        
        // Also clean up from object.particleEmitters if it exists
        if (object && object.particleEmitters) {
            if (effectType && object.particleEmitters[effectType]) {
                object.particleEmitters[effectType].active = false;
                delete object.particleEmitters[effectType];
            } else if (!effectType) {
                Object.values(object.particleEmitters).forEach(emitter => {
                    if (emitter) emitter.active = false;
                });
                object.particleEmitters = {};
            }
        }
    }

    // Backward compatibility for Mytes
    attachToMyte(myte, effectType = 'trail', options = {}) {
        return this.attachParticleEffect(myte, effectType, options);
    }

    // Backward compatibility for Mytes
    detachFromMyte(myte, effectType) {
        if (!myte || !myte.id) return;
        this.detachEffectFromObject(myte, myte.id, effectType);
    }

    // Backward compatibility for Mytes
    detachAllFromMyte(myte) {
        this.detachFromMyte(myte);
    }

    // Unified dust emitter that works for any object
    createDustEmitter(object, options = {}) {
        if (!object) {
            console.warn('Cannot create dust emitter: Invalid object');
            return null;
        }

        // Set up default options for dust
        const defaultOptions = {
            colors: ['#e8e8e8', '#d5d5d5', '#c8c8c8'],  // Light gray dust colors
            size: 4,                                    // Starting size
            sizeEnd: 7,                                 // Ending size
            life: 35,                                   // How long particles last
            count: 2,                                   // Particles per emission
            interval: 100,                              // Emission frequency
            gravity: -0.01,                             // Slight upward drift
            friction: 0.98,                             // Particle friction
            opacity: 0.7,                               // Starting opacity
            opacityEnd: 0,                              // End opacity (fade out)
            emitWhenMoving: true,                       // Only emit when object is moving
            movementThreshold: 0.5,                     // Minimum movement speed to emit
            randomizePosition: true,                    // Add some randomness to emission position
            randomizeFactor: 10                         // How much randomness to add
        };

        // Merge with provided options
        const mergedOptions = { ...defaultOptions, ...options };

        // Create a position tracker with appropriate offsets
        const tracker = this.createObjectTracker(object, mergedOptions);
        tracker.lastX = object.posX;
        tracker.lastY = object.posY;

        // Create a custom emitter that checks for movement
        const emitter = {
            type: 'dust',
            options: mergedOptions,
            active: true,
            x: tracker.x,
            y: tracker.y,
            interval: mergedOptions.interval,
            lastEmit: 0,
            particles: [],
            update: (now) => {
                // Update position from tracker
                tracker.update();
                emitter.x = tracker.x;
                emitter.y = tracker.y;

                // Calculate movement distance
                const dx = tracker.x - tracker.lastX;
                const dy = tracker.y - tracker.lastY;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Check if we should emit based on movement and time
                const shouldEmit = !mergedOptions.emitWhenMoving || 
                                 distance > mergedOptions.movementThreshold;
                    
                if (shouldEmit && now - emitter.lastEmit >= emitter.interval) {
                    emitter.lastEmit = now;

                    // Create dust particles
                    for (let i = 0; i < mergedOptions.count; i++) {
                        const dustColor = mergedOptions.colors[Math.floor(Math.random() * mergedOptions.colors.length)];
                        
                        const particle = this.addParticle({
                            x: emitter.x + (Math.random() - 0.5) * (mergedOptions.randomizeFactor || 10),
                            y: emitter.y + (Math.random() - 0.5) * (mergedOptions.randomizeFactor || 10),
                            vx: (Math.random() - 0.5) * 0.5,
                            vy: (Math.random() - 0.5) * 0.3 - 0.2,
                            size: mergedOptions.size + (Math.random() - 0.5) * 2,
                            sizeEnd: mergedOptions.sizeEnd + (Math.random() - 0.5) * 2,
                            color: dustColor,
                            opacity: mergedOptions.opacity,
                            opacityEnd: mergedOptions.opacityEnd,
                            life: mergedOptions.life + (Math.random() - 0.5) * 10,
                            rotationSpeed: (Math.random() - 0.5) * 0.2,
                            gravity: mergedOptions.gravity,
                            friction: mergedOptions.friction
                        });

                        emitter.particles.push(particle);
                    }
                }

                // Update last position
                tracker.lastX = tracker.x;
                tracker.lastY = tracker.y;
            }
        };

        // Add to emitters array
        this.emitters.push(emitter);
        
        return emitter;
    }

    // Create a sparkle/shimmer effect for any object
    createSparkleEmitter(object, options = {}) {
        if (!object) {
            console.warn('Cannot create sparkle emitter: Invalid object');
            return null;
        }

        // Default options for sparkle effect
        const defaultOptions = {
            colors: ['#ffffff', '#fffacd', '#f0f8ff'],  // Sparkle colors
            size: 3,                                     // Particle size
            sizeEnd: 1,                                  // End size (shrink)
            life: 40,                                    // Particle lifespan
            count: 1,                                    // Particles per emission
            interval: 300,                               // Emission interval (less frequent)
            opacity: 0.9,                                // Starting opacity
            opacityEnd: 0,                               // End opacity (fade out)
            randomizePosition: true,                     // Add position randomness
            randomizeFactor: 15,                         // Randomness amount
            speed: 0.8,                                  // Particle movement speed
            emitWhenMoving: false                        // Emit regardless of movement
        };

        // Merge with provided options
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Create a position tracker
        const tracker = this.createObjectTracker(object, mergedOptions);
        
        // Create a custom emitter for sparkles
        const emitter = {
            type: 'sparkle',
            options: mergedOptions,
            active: true,
            x: tracker.x,
            y: tracker.y,
            interval: mergedOptions.interval,
            lastEmit: 0,
            particles: [],
            update: (now) => {
                // Update position from tracker
                tracker.update();
                emitter.x = tracker.x;
                emitter.y = tracker.y;
                
                // Time to emit?
                if (now - emitter.lastEmit >= emitter.interval) {
                    emitter.lastEmit = now;
                    
                    // Create sparkle particles
                    for (let i = 0; i < mergedOptions.count; i++) {
                        const color = mergedOptions.colors[Math.floor(Math.random() * mergedOptions.colors.length)];
                        const angle = Math.random() * Math.PI * 2;
                        const speed = mergedOptions.speed * (0.5 + Math.random() * 0.5);
                        
                        this.addParticle({
                            x: emitter.x,
                            y: emitter.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            size: mergedOptions.size * (0.8 + Math.random() * 0.4),
                            sizeEnd: mergedOptions.sizeEnd,
                            color: color,
                            opacity: mergedOptions.opacity,
                            opacityEnd: mergedOptions.opacityEnd,
                            life: mergedOptions.life + Math.random() * 20,
                            rotationSpeed: (Math.random() - 0.5) * 0.5,
                            gravity: -0.01,
                            friction: 0.95
                        });
                    }
                }
            }
        };
        
        // Add to emitters array
        this.emitters.push(emitter);
        
        return emitter;
    }

    // Create a trailing effect behind a moving object
    createTrailEmitter(object, options = {}) {
        // Common code with createDustEmitter, but with different defaults and behavior
        return this.createDustEmitter(object, {
            colors: ['#aaccff', '#88aaff', '#6688ff'],
            size: 6,
            sizeEnd: 2,
            life: 30,
            count: 2,
            interval: 50,
            opacity: 0.7,
            opacityEnd: 0,
            emitWhenMoving: true,
            movementThreshold: 0.2,
            // More trail-specific options
            positionBehind: true,
            fadeSpeed: 1.2,
            ...options
        });
    }

    // Create a glowing aura effect around an object
    createGlowEmitter(object, options = {}) {
        if (!object) {
            console.warn('Cannot create glow emitter: Invalid object');
            return null;
        }

        // Default options for glow effect
        const defaultOptions = {
            colors: ['#ffffcc', '#ffff88', '#ffff44'],  // Glow colors (yellowish)
            size: 8,                                     // Particle size
            sizeEnd: 4,                                  // End size (shrink)
            life: 60,                                    // Particle lifespan
            count: 1,                                    // Particles per emission
            interval: 100,                               // Emission interval
            opacity: 0.5,                                // Starting opacity (subtle)
            opacityEnd: 0,                               // End opacity (fade out)
            randomizePosition: true,                     // Add position randomness
            randomizeFactor: 20,                         // Randomness amount
            orbitalMotion: true,                         // Particles orbit the object
            orbitalSpeed: 0.02,                          // Orbit speed
            pulseEffect: true,                           // Pulse in size
            pulseFrequency: 0.05                         // Pulse frequency
        };

        // Merge with provided options
        const mergedOptions = { ...defaultOptions, ...options };
        
        // Create a position tracker for the glow effect
        const tracker = this.createObjectTracker(object, mergedOptions);
        
        // Create the emitter with special glow options
        const emitter = {
            type: 'glow',
            options: mergedOptions,
            active: true,
            x: tracker.x,
            y: tracker.y,
            interval: mergedOptions.interval,
            lastEmit: 0,
            particles: [],
            orbPhase: 0,
            pulsePhase: 0,
            update: (now) => {
                // Update position from tracker
                tracker.update();
                emitter.x = tracker.x;
                emitter.y = tracker.y;
                
                // Update orbital and pulse phases
                emitter.orbPhase += mergedOptions.orbitalSpeed || 0.02;
                emitter.pulsePhase += mergedOptions.pulseFrequency || 0.05;
                
                // Time to emit?
                if (now - emitter.lastEmit >= emitter.interval) {
                    emitter.lastEmit = now;
                    
                    // Create glow particles that orbit
                    for (let i = 0; i < mergedOptions.count; i++) {
                        const color = mergedOptions.colors[Math.floor(Math.random() * mergedOptions.colors.length)];
                        const angle = Math.random() * Math.PI * 2;
                        const distance = (object.size?.width || 20) * 0.7 * (0.8 + Math.random() * 0.4);
                        
                        // Calculate initial position based on orbit
                        const px = emitter.x + Math.cos(angle) * distance;
                        const py = emitter.y + Math.sin(angle) * distance;
                        
                        const particle = this.addParticle({
                            x: px,
                            y: py,
                            vx: 0,
                            vy: 0,
                            size: mergedOptions.size * (0.8 + Math.random() * 0.4),
                            sizeEnd: mergedOptions.sizeEnd,
                            color: color,
                            opacity: mergedOptions.opacity,
                            opacityEnd: mergedOptions.opacityEnd,
                            life: mergedOptions.life + Math.random() * 20,
                            rotationSpeed: (Math.random() - 0.5) * 0.2,
                            gravity: 0,
                            friction: 1.0
                        });
                        
                        // Store orbital info for this particle
                        particle.orbitData = {
                            center: { x: emitter.x, y: emitter.y },
                            angle: angle,
                            distance: distance,
                            speed: 0.01 + Math.random() * 0.02,
                            pulseAmount: 0.2 + Math.random() * 0.3
                        };
                        
                        // Override particle update to add orbital motion
                        const originalUpdate = particle.update;
                        particle.update = function() {
                            // Call original update first
                            const active = originalUpdate.call(this);
                            if (!active) return false;
                            
                            // Update the center position as object moves
                            this.orbitData.center.x = tracker.x;
                            this.orbitData.center.y = tracker.y;
                            
                            // Apply orbital motion if enabled
                            if (mergedOptions.orbitalMotion) {
                                this.orbitData.angle += this.orbitData.speed;
                                this.x = this.orbitData.center.x + Math.cos(this.orbitData.angle) * this.orbitData.distance;
                                this.y = this.orbitData.center.y + Math.sin(this.orbitData.angle) * this.orbitData.distance;
                            }
                            
                            // Apply pulse effect if enabled
                            if (mergedOptions.pulseEffect) {
                                const pulseScale = 1 + Math.sin(emitter.pulsePhase) * this.orbitData.pulseAmount;
                                this.size = (mergedOptions.size + (mergedOptions.sizeEnd - mergedOptions.size) * 
                                            (1 - this.life / this.lifeMax)) * pulseScale;
                            }
                            
                            return true;
                        };
                        
                        emitter.particles.push(particle);
                    }
                }
                
                // Update existing particles' orbital position
                emitter.particles.forEach(particle => {
                    if (particle.orbitData && mergedOptions.orbitalMotion) {
                        particle.orbitData.center.x = tracker.x;
                        particle.orbitData.center.y = tracker.y;
                    }
                });
            }
        };
        
        // Add to emitters array
        this.emitters.push(emitter);
        
        return emitter;
    }

    // Helper method to add general utility methods to any object
    addParticleMethodsToObject(object) {
        if (!object) return;
        
        // Add methods to the object to easily control particles
        object.addParticleEffect = (effectType, options = {}) => {
            return this.attachParticleEffect(object, effectType, {
                ...options,
                storeReference: true
            });
        };
        
        object.removeParticleEffect = (effectType) => {
            if (!object.particleEmitters || !object.particleEmitters[effectType]) return;
            
            object.particleEmitters[effectType].active = false;
            delete object.particleEmitters[effectType];
        };
        
        object.removeAllParticleEffects = () => {
            if (!object.particleEmitters) return;
            
            for (const effectType in object.particleEmitters) {
                object.particleEmitters[effectType].active = false;
            }
            
            object.particleEmitters = {};
        };
        
        object.hasParticleEffect = (effectType) => {
            return object.particleEmitters && 
                  object.particleEmitters[effectType] && 
                  object.particleEmitters[effectType].active;
        };
        
        // Add convenient methods for specific effect types
        object.addDustEffect = (options = {}) => {
            return object.addParticleEffect('dust', options);
        };
        
        object.addSparkleEffect = (options = {}) => {
            return object.addParticleEffect('sparkle', options);
        };
        
        object.addTrailEffect = (options = {}) => {
            return object.addParticleEffect('trail', options);
        };
        
        object.addGlowEffect = (options = {}) => {
            return object.addParticleEffect('glow', options);
        };
    }

    // Get default options for different effect types - consolidate all defaults here
    getDefaultOptionsForEffect(effectType) {
        switch (effectType) {
            case 'trail':
                return {
                    interval: 50,
                    colors: ['#ffcc00', '#ff9900'],
                    size: 8,
                    sizeEnd: 2,
                    life: 30,
                    fadeSpeed: 1
                };

            case 'dust':
                return {
                    interval: 100,
                    colors: ['#e0e0e0', '#d0d0d0', '#c0c0c0'],
                    size: 5,
                    sizeEnd: 8,
                    opacity: 0.7,
                    opacityEnd: 0,
                    life: 40,
                    fadeSpeed: 0.8,
                    gravity: -0.01,
                    friction: 0.99
                };

            case 'emotion':
                return {
                    interval: 500,
                    count: 1,
                    colors: ['#ff5555'],
                    size: 15,
                    life: 80,
                    offsetY: -30
                };

            case 'aura':
                return {
                    interval: 100,
                    colors: ['#7788ff', '#aabbff'],
                    size: 10,
                    sizeEnd: 5,
                    life: 40,
                    fadeSpeed: 0.8,
                    spread: 20
                };

            case 'sparkle':
                return {
                    interval: 200,
                    colors: ['#ffffff', '#ffff99'],
                    size: 5,
                    sizeEnd: 1,
                    life: 50,
                    fadeSpeed: 1.2,
                    spread: 15
                };
                
            case 'glow':
                return {
                    interval: 100,
                    colors: ['#ffffcc', '#ffff88', '#ffff44'],
                    size: 8,
                    sizeEnd: 4,
                    life: 60,
                    opacity: 0.5,
                    orbitalMotion: true,
                    pulseEffect: true
                };

            default:
                return {};
        }
    }

    // Backward compatibility and specialized cases
    createDustEmitterForMyte(myte, options = {}) {
        return this.createDustEmitter(myte, options);
    }
    
    // Specialized slime trail for snail Mytes
    createSlimeTrail(myte, options = {}) {
        return this.createDustEmitter(myte, {
            colors: ['#a0e8c8', '#80d0b0'],  // Greenish slime colors
            size: 3,
            sizeEnd: 4,
            opacity: 0.7,
            life: 60,
            friction: 0.999,
            gravity: 0,
            count: 1,
            ...options
        });
    }

    // Override updateEmitters to handle custom emitters
    updateEmitters(now) {
        if (!this.emitters || this.emitters.length === 0) return;

        for (let i = this.emitters.length - 1; i >= 0; i--) {
            const emitter = this.emitters[i];
            if (!emitter.active) {
                this.emitters.splice(i, 1);
                continue;
            }

            // Check if this is a custom emitter with an update function
            if (typeof emitter.update === 'function') {
                emitter.update(now);
            }
            // Otherwise, handle standard emitters
            else if (now - emitter.lastEmit > emitter.interval) {
                emitter.lastEmit = now;

                // Update the position if it's a moving target
                if (emitter.options && emitter.options.target && typeof emitter.options.target.update === 'function') {
                    emitter.options.target.update();
                    emitter.x = emitter.options.target.x || 0;
                    emitter.y = emitter.options.target.y || 0;
                }

                // Create particles based on emitter type
                switch (emitter.type) {
                    case 'trail':
                        this.addTrail(emitter.options.target, emitter.options);
                        break;
                    case 'rain':
                        this.addRain(emitter.options);
                        break;
                    case 'snow':
                        this.addSnow(emitter.options);
                        break;
                    case 'smoke':
                        this.addSmoke(emitter.options.x, emitter.options.y, emitter.options);
                        break;
                    case 'butterfly':
                        this.addButterfly(emitter.options.x, emitter.options.y, emitter.options);
                        break;
                    case 'firework':
                        this.addFirework(emitter.options.x, emitter.options.y, emitter.options);
                        break;
                    case 'swarm':
                        this.addSwarm(emitter.options.x, emitter.options.y, emitter.options);
                        break;
                }
            }
        }
    }

    // Override the dispose method to clean up all effects
    dispose() {
        // Clear all object effects
        this.objectEffects.forEach(effects => {
            effects.forEach(emitter => emitter.active = false);
        });
        this.objectEffects.clear();

        // Call parent dispose method
        super.dispose();
    }
}