class MapTransitionManager {
    constructor(container) {
        this.container = container;
        this.core = container.core;
        this.transitionElement = document.querySelector('.map-transition');
        this.messageElement = this.transitionElement?.querySelector('.transition-message');
        this.tipElement = this.transitionElement?.querySelector('.transition-tip');

        console.log('[MapTransitionManager] Initializing');

        this.minimumDisplayTime = 500;

        this.currentMapId = null;
        this.previousMapId = null;

        if (!this.transitionElement) {
            this.createTransitionElement();
        }
    }

    createTransitionElement() {
        console.log('[MapTransitionManager] Creating transition element');
        this.transitionElement = document.createElement('div');
        this.transitionElement.className = 'map-transition';

        this.messageElement = document.createElement('div');
        this.messageElement.className = 'transition-message';
        this.transitionElement.appendChild(this.messageElement);

        const transitionLoader = document.createElement('div');
        transitionLoader.className = 'transition-loader';
        this.transitionElement.appendChild(transitionLoader);

        this.tipElement = document.createElement('div');
        this.tipElement.className = 'transition-tip';
        this.transitionElement.appendChild(this.tipElement);

        this.container.element.appendChild(this.transitionElement);
    }

    _normalizePortalRef(value) {
        if (value === undefined || value === null || value === '') return null;
        return String(value);
    }

    _getPortalObjects(map = this.container.gameMap) {
        return (map?.objects || []).filter(obj => obj instanceof PortalMapObject);
    }

    _findPortalByReference(map, portalRef) {
        const normalizedRef = this._normalizePortalRef(portalRef);
        if (!normalizedRef) return null;

        return this._getPortalObjects(map).find(portal =>
            this._normalizePortalRef(
                portal.getPortalReferenceId?.() ?? portal.portalId ?? portal.id
            ) === normalizedRef
        ) || null;
    }

    _findLinkedReturnPortal(map, sourceMapId, sourcePortalId) {
        const portals = this._getPortalObjects(map);
        if (!sourceMapId || portals.length === 0) return null;

        const normalizedSourcePortalId = this._normalizePortalRef(sourcePortalId);
        if (normalizedSourcePortalId) {
            const exactLinkedPortal = portals.find(portal =>
                portal.getResolvedTargetMapId?.() === sourceMapId &&
                this._normalizePortalRef(portal.targetPortalId) === normalizedSourcePortalId
            );

            if (exactLinkedPortal) {
                return exactLinkedPortal;
            }
        }

        const returnCandidates = portals.filter(portal =>
            portal.getResolvedTargetMapId?.() === sourceMapId
        );

        return returnCandidates.length === 1 ? returnCandidates[0] : null;
    }

    _resolveArrivalDestination(map, options = {}) {
        const {
            myte = this.container.activeMyte,
            targetPortalId = null,
            targetSpawnPoint = null,
            sourceMapId = null,
            sourcePortalId = null
        } = options;

        const explicitPortal = this._findPortalByReference(map, targetPortalId);
        if (explicitPortal) {
            return {
                type: 'portal',
                portal: explicitPortal,
                position: explicitPortal.getCenteredPositionFor?.(myte) || {
                    x: explicitPortal.posX,
                    y: explicitPortal.posY
                }
            };
        }

        if (targetSpawnPoint) {
            const spawnPoint = map?.getSpawnPoint?.(targetSpawnPoint);
            if (spawnPoint) {
                return {
                    type: 'spawn',
                    spawnPoint: targetSpawnPoint,
                    position: { x: spawnPoint.x, y: spawnPoint.y }
                };
            }
        }

        const linkedReturnPortal = this._findLinkedReturnPortal(map, sourceMapId, sourcePortalId);
        if (linkedReturnPortal) {
            return {
                type: 'portal',
                portal: linkedReturnPortal,
                position: linkedReturnPortal.getCenteredPositionFor?.(myte) || {
                    x: linkedReturnPortal.posX,
                    y: linkedReturnPortal.posY
                }
            };
        }

        const myteSpawn = map?.getSpawnPoint?.('myte');
        if (myteSpawn) {
            return {
                type: 'spawn',
                spawnPoint: 'myte',
                position: { x: myteSpawn.x, y: myteSpawn.y }
            };
        }

        const defaultSpawn = map?.getSpawnPoint?.('default');
        if (defaultSpawn) {
            return {
                type: 'spawn',
                spawnPoint: 'default',
                position: { x: defaultSpawn.x, y: defaultSpawn.y }
            };
        }

        return null;
    }

    _applyMyteArrival(myte, arrival) {
        if (!myte || !arrival?.position) return;

        myte.setPosition(arrival.position.x, arrival.position.y);
        myte.setTarget(arrival.position.x, arrival.position.y);
        myte.setSpritePosition(arrival.position.x, arrival.position.y);

        if (arrival.portal) {
            myte.portalCooldownUntil = Date.now() + (
                arrival.portal.getPortalCooldownDuration?.() || 1500
            );
        }
    }

    _prepareMyteForTransition(myte) {
        if (!myte) return;
        myte.queue?.clear?.();
        myte.unsetTarget?.();
    }

    _centerCameraOnMyte(myte) {
        if (!myte || !this.container.camera) return;
        this.container.camera.centerToPosition(myte.posX, myte.posY, myte.size, true);
        this.container.camera.updateTransform(
            this.container.camera.posX,
            this.container.camera.posY,
            this.container.camera.zoomLevel
        );
    }

    async _waitForRevealReadiness(map, mapId) {
        if (!map) return;
        await map.waitForRevealReady?.();
    }

    _completeTransitionUi(isInitialLoad) {
        if (isInitialLoad) return;

        this.hideTransition();

        if (this.container.inputHandler && this.container.inputHandler.enable) {
            this.container.inputHandler.enable();
        } else {
            console.warn('InputHandler enable method not available');
        }
    }

    _finishSuccessfulTransition(options, isInitialLoad) {
        this.container.invalidateCanvasRect?.();

        if (typeof options.onComplete === 'function') {
            options.onComplete(true);
        }

        this._completeTransitionUi(isInitialLoad);
        return true;
    }

    _buildTransitionCopy(options = {}, mapId = null) {
        const fallbackName = this.core?.mapLoader?.getCachedMapDisplayName?.(mapId) ||
            this.core?.mapLoader?.humanizeMapId?.(mapId) ||
            String(mapId || 'Travel');
        const defaultMessage = mapId ? `Traveling to ${fallbackName}...` : 'Traveling...';

        return {
            message: options.message || defaultMessage,
            title: options.transitionTitle || fallbackName,
            description: options.transitionDescription || defaultMessage,
            tip: options.transitionTip || this.core?.mapLoader?.getRandomTransitionTip?.() || '',
            minVisibleTime: Number.isFinite(options.minVisibleTime)
                ? Math.max(0, options.minVisibleTime)
                : 1650
        };
    }

    async startTransition(options = {}) {
        const sourceMapId = options.sourceMapId || (this.container.gameMap?.id ?? null);
        const mapId = options.targetMap || sourceMapId;
        const spawnPoint = options.targetSpawnPoint || null;
        const targetPortalId = options.targetPortalId || null;
        const isInitialLoad = options.isInitialLoad || false;
        const sourcePortal = options.sourcePortal || null;
        const sourcePortalId = options.sourcePortalId || sourcePortal?.getPortalReferenceId?.() || null;
        const sameMapTransition = !isInitialLoad && !!mapId && mapId === sourceMapId;
        const transitionCopy = this._buildTransitionCopy(options, mapId);

        if (!isInitialLoad) {
            if (this.container.inputHandler && this.container.inputHandler.disable) {
                this.container.inputHandler.disable();
            } else {
                console.warn('InputHandler disable method not available');
            }

            if (!sameMapTransition) {
                await this.showTransition(transitionCopy.message || `Loading...`, transitionCopy.tip || '');
            }
        }

        if (sameMapTransition) {
            const myte = options.myte || this.container.activeMyte || null;
            const currentMap = this.container.gameMap;

            this.container.ui.setSelected(null);
            this._prepareMyteForTransition(myte);

            const arrival = this._resolveArrivalDestination(currentMap, {
                myte,
                targetPortalId,
                targetSpawnPoint: spawnPoint,
                sourceMapId,
                sourcePortalId
            });

            if (myte && arrival) {
                this._applyMyteArrival(myte, arrival);
            }

            this._centerCameraOnMyte(myte);
            return this._finishSuccessfulTransition(options, isInitialLoad);
        }

        let newMap;

        if (this.core && this.core.mapLoader) {
            if (isInitialLoad) {
                newMap = await this.core.mapLoader.loadMap(mapId, this.container, { isInitialLoad: true });
            } else {
                newMap = await this.core.mapLoader.loadMapWithTransition(mapId, this.container, {
                    ...options,
                    message: transitionCopy.message,
                    transitionTitle: transitionCopy.title,
                    transitionDescription: transitionCopy.description,
                    transitionTip: transitionCopy.tip,
                    minVisibleTime: transitionCopy.minVisibleTime,
                    isInitialLoad: false
                });
            }
        } else {
            console.warn('Core mapLoader not available, creating map directly');
            newMap = new GameMap(this.container);

            try {
                const success = await newMap.initialize(mapId, { isInitialLoad });
                if (!success) {
                    console.error(`[MapTransitionManager] Failed to initialize map: ${mapId}`);
                    newMap = null;
                }
            } catch (error) {
                console.error('[MapTransitionManager] Error initializing map:', error);
                newMap = null;
            }
        }

        if (newMap) {
            this.previousMapId = sourceMapId;
            this.currentMapId = mapId;

            this.container.gameMap = newMap;

            if (newMap.gridSystem && document.body.classList.contains('debug')) {
                console.log('[MapTransitionManager] Reinitializing GridSystem debug mode');

                setTimeout(() => {
                    newMap.gridSystem.debugInitialized = false;
                    if (!newMap.gridSystem.debugMode) {
                        newMap.gridSystem.toggleDebug();
                    } else {
                        newMap.gridSystem.toggleDebug();
                        newMap.gridSystem.toggleDebug();
                    }
                }, 200);
            }

            this.container.ui.setSelected(null);

            const activeMyte = options.myte || this.container.activeMyte || null;
            this._prepareMyteForTransition(activeMyte);

            if (!options.preserveCamera && this.container.camera) {
                // Reserved for future custom camera reset behavior.
            }

            if (this.container.mytes && this.container.mytes.length > 0) {
                if (activeMyte) {
                    const arrival = this._resolveArrivalDestination(newMap, {
                        myte: activeMyte,
                        targetPortalId,
                        targetSpawnPoint: spawnPoint,
                        sourceMapId: this.previousMapId,
                        sourcePortalId
                    });

                    if (arrival) {
                        this._applyMyteArrival(activeMyte, arrival);
                    }
                }

                let firstMyte = this.container.mytes[0];
                if (activeMyte) {
                    firstMyte = activeMyte;
                }


                this._centerCameraOnMyte(firstMyte);
            }

            await this._waitForRevealReadiness(newMap, mapId);

            return this._finishSuccessfulTransition(options, isInitialLoad);
        }

        if (!isInitialLoad) {
            this.messageElement.textContent = "Map not found!";

            if (this.container.ui && this.container.ui.showMessage) {
                this.container.ui.showMessage(`Cannot find map "${mapId}"`);
            }

            setTimeout(() => {
                this.hideTransition();

                if (this.container.inputHandler && this.container.inputHandler.enable) {
                    this.container.inputHandler.enable();
                } else {
                    console.warn('InputHandler enable method not available');
                }
            }, 2000);
        } else {
            console.error(`[MapTransitionManager] Initial map load failed for ${mapId}`);

            const fallbackMapId = 'House';

            if (mapId !== fallbackMapId) {
                console.log(`[MapTransitionManager] Trying fallback map: ${fallbackMapId}`);
                return this.startTransition({
                    ...options,
                    targetMap: fallbackMapId,
                    message: `Loading fallback map...`
                });
            }

            console.error(`[MapTransitionManager] Critical error: Fallback map failed to load`);

            if (this.core && this.core.loadingManager) {
                this.core.loadingManager.setMessage(`Critical error: Could not load any map`);
            }
        }

        if (typeof options.onComplete === 'function') {
            options.onComplete(false);
        }

        if (sourcePortal) {
            sourcePortal.isAnimating = false;
            sourcePortal.isActive = true;
        }

        return false;
    }

    showTransition(message, tip = '') {
        this.transitionStartTime = Date.now();
        if (this.messageElement) {
            this.messageElement.textContent = message;
        }
        if (this.tipElement) {
            this.tipElement.textContent = tip;
        }

        this.transitionElement.classList.add('active');

        return new Promise(resolve => {
            const transitionEndHandler = () => {
                this.transitionElement.removeEventListener('transitionend', transitionEndHandler);
                resolve();
            };

            this.transitionElement.addEventListener('transitionend', transitionEndHandler);

            const computedStyle = window.getComputedStyle(this.transitionElement);
            const transitionDuration = parseFloat(computedStyle.transitionDuration) * 1000;

            setTimeout(() => {
                this.transitionElement.removeEventListener('transitionend', transitionEndHandler);
                resolve();
            }, transitionDuration + 50);
        });
    }

    hideTransition() {
        const timeShown = Date.now() - this.transitionStartTime;

        if (timeShown < this.minimumDisplayTime) {
            setTimeout(() => {
                this.transitionElement.classList.remove('active');
            }, this.minimumDisplayTime - timeShown);
        } else {
            this.transitionElement.classList.remove('active');
        }
    }

    dispose() {
        console.log('[MapTransitionManager] Disposing');
        if (this.transitionElement && this.transitionElement.parentNode) {
            this.transitionElement.parentNode.removeChild(this.transitionElement);
        }
        this.transitionElement = null;
        this.messageElement = null;
    }
}
