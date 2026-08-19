class MapTransitionManager {
    constructor(container) {
        this.container = container;
        this.core = container.core;
        this.transitionElement = document.querySelector('.map-transition');
        this.messageElement = this.transitionElement?.querySelector('.transition-message');
        this.tipElement = this.transitionElement?.querySelector('.transition-tip');

        Utility.logDebug('[MapTransitionManager] Initializing');

        this.minimumDisplayTime = 500;

        this.currentMapId = null;
        this.previousMapId = null;

        if (!this.transitionElement) {
            this.createTransitionElement();
        }
    }

    createTransitionElement() {
        Utility.logDebug('[MapTransitionManager] Creating transition element');
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
            // SimClock: gameplay cooldown — must not expire while the tab is hidden
            myte.portalCooldownUntil = SimClock.now() + (
                arrival.portal.getPortalCooldownDuration?.() || 1500
            );
        }
    }

    // Move the .myte-slot wrapper to match a game-space position so
    // getHomePosition() returns the correct spawn coords for the new map.
    _syncMyteSlotToPosition(myte, position) {
        if (!myte?.homeSlot || !position) return;
        const slotEl = myte.homeSlot.element;
        if (!slotEl) return;
        slotEl.style.left = `${position.x}px`;
        slotEl.style.top  = `${position.y}px`;
        myte.homeSlot.invalidate();
        Utility.logDebug(`[MapTransition] slot synced for ${myte.name} to (${position.x}, ${position.y})`);
    }

    // Each Myte owns one home slot on one map. Nonresident slots are detached
    // from the world entirely; the Myte's deployed world element is independent.
    _syncAllMyteSlotsToSpawn(map) {
        const spawnPoint = map?.getSpawnPoint?.('myte') ?? map?.getSpawnPoint?.('default');
        const mytes = this.container.mytes ?? [];
        const mapId = map?.id;
        // One slot, one map: residency is the slot's own answer, and the
        // non-residents are removed rather than hidden so no map can ever be
        // holding a second copy of somebody's home.
        const residentMytes = mytes.filter(myte => myte.homeSlot?.isOnMap(mapId));
        const residentSet = new Set(residentMytes);
        const slotLayer = map?.layers?.objects;

        mytes.forEach(myte => {
            const slotEl = myte.homeSlot?.element;
            if (!slotEl) return;

            slotEl.hidden = false;
            if (residentSet.has(myte) && slotLayer) {
                if (slotEl.parentElement !== slotLayer) {
                    slotLayer.appendChild(slotEl);
                }
            } else {
                slotEl.remove();
            }
        });

        // A slot somebody placed by hand keeps its place; only the ones still
        // on the automatic layout get laid out. Restoring them here as well is
        // what makes a hand-placed slot survive a map change rather than
        // springing back to the spawn point.
        const placedByHand = residentMytes.filter(myte => myte.homeSlot.isPlaced);
        for (const myte of placedByHand) {
            this._syncMyteSlotToPosition(myte, myte.homeSlot.position);
        }
        const autoMytes = residentMytes.filter(myte => !myte.homeSlot.isPlaced);

        if (!spawnPoint) return;
        const layout = SiteConfig.myte.homeSlotLayout;
        const spacing = layout.spacing;
        const slotSize = layout.slotSize;
        const mapWidth = map.dimensions?.width ?? Infinity;
        const mapHeight = map.dimensions?.height ?? Infinity;
        const offsets = [
            { x: 0, y: 0 },
            { x: spacing, y: 0 },
            { x: -spacing, y: 0 },
            { x: 0, y: spacing },
            { x: 0, y: -spacing },
            { x: spacing, y: spacing },
            { x: -spacing, y: spacing },
            { x: spacing, y: -spacing },
            { x: -spacing, y: -spacing }
        ];
        const placed = placedByHand.map(myte => ({ ...myte.homeSlot.position }));

        autoMytes.forEach((myte, index) => {
            const candidates = offsets.slice(index).concat(offsets.slice(0, index));
            const offset = candidates.find(candidate => {
                const x = spawnPoint.x + candidate.x;
                const y = spawnPoint.y + candidate.y;
                const insideMap = x >= 0 && y >= 0 && x + slotSize <= mapWidth && y + slotSize <= mapHeight;
                const clear = placed.every(position =>
                    Math.abs(position.x - x) >= slotSize ||
                    Math.abs(position.y - y) >= slotSize
                );
                return insideMap && clear;
            }) || { x: index * spacing, y: 0 };
            const position = {
                x: spawnPoint.x + offset.x,
                y: spawnPoint.y + offset.y
            };
            placed.push(position);
            this._syncMyteSlotToPosition(myte, position);
        });
    }

    // Re-place every myte home slot for `map` — resident slots into the object
    // layer around the spawn point, non-resident slots detached. Public because
    // relocating a myte's home between maps needs the same placement pass.
    syncMyteHomeSlots(map = this.container.gameMap) {
        this._syncAllMyteSlotsToSpawn(map);
    }

    // Where a myte arriving from `sourceMapId` should appear on `map` — the
    // portal that leads back there when there is one, else the spawn point.
    resolveArrivalFrom(myte, sourceMapId, map = this.container.gameMap) {
        return this._resolveArrivalDestination(map, { myte, sourceMapId });
    }

    placeMyteAtArrival(myte, arrival) {
        this._applyMyteArrival(myte, arrival);
    }

    _prepareMyteForTransition(myte) {
        if (!myte) return;
        myte.queue?.clear?.();
        myte.unsetTarget?.();
    }

    _centerCameraOnMyte(myte) {
        if (!myte || !this.container.camera) return;
        this._centerCameraOnPosition({ x: myte.posX, y: myte.posY }, myte.size);
    }

    _centerCameraOnPosition(position, size = { width: 0, height: 0 }) {
        if (!position || !this.container.camera) return;
        this.container.camera.centerToPosition(position.x, position.y, size, true);
        this.container.camera.updateTransform(
            this.container.camera.posX,
            this.container.camera.posY,
            this.container.camera.zoomLevel
        );
    }

    _getViewerCameraFocus(map, options = {}) {
        const arrival = this._resolveArrivalDestination(map, {
            myte: null,
            targetPortalId: options.targetPortalId,
            targetSpawnPoint: options.targetSpawnPoint,
            sourceMapId: options.sourceMapId,
            sourcePortalId: options.sourcePortalId
        });

        if (arrival?.type === 'portal') {
            return {
                position: arrival.position,
                size: { width: 0, height: 0 }
            };
        }

        if (options.targetSpawnPoint && arrival?.position) {
            const slotSize = SiteConfig.myte.homeSlotLayout.slotSize;
            return {
                position: arrival.position,
                size: { width: slotSize, height: slotSize }
            };
        }

        const dimensions = map?.dimensions;
        if (!dimensions) return null;
        return {
            position: {
                x: dimensions.width / 2,
                y: dimensions.height / 2
            },
            size: { width: 0, height: 0 }
        };
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
            Utility.warnDebug('InputHandler enable method not available');
        }
    }

    _showMapLoadFailureToast(mapId) {
        const message = `Failed to load map ${mapId}`;
        const toastManager = this.core?.toastManager;
        if (toastManager?.error) {
            toastManager.error(message, 'Map Load Failed');
            return;
        }

        this.container.ui?.showMessage?.(message, 'error', 'Map Load Failed');
    }

    _finishSuccessfulTransition(options, isInitialLoad) {
        const resolvedMapId = this.currentMapId || this.container.gameMap?.id || options.targetMap || null;
        if (resolvedMapId && this.core?.user) {
            this.core.user.currentMapId = resolvedMapId;
            this.core.user.saveUserData?.();
        }

        this.container.invalidateCanvasRect?.();
        this.container.gameMode?.handleMapChanged?.();
        this.core?.eventManager?.emit(EVENTS.MAP_CHANGED, {
            mapId: resolvedMapId,
            displayName: this.container.getMapDisplayName?.(resolvedMapId) ?? String(resolvedMapId ?? ''),
            isInitialLoad
        });

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
        const allowFallback = options.allowFallback === true;
        const sourcePortal = options.sourcePortal || null;
        const sourcePortalId = options.sourcePortalId || sourcePortal?.getPortalReferenceId?.() || null;
        const sameMapTransition = !isInitialLoad && !!mapId && mapId === sourceMapId;

        // Leaving the map mid-build would strand an unfinished edit against a
        // world state that is about to be recaptured. Finish the session first.
        if (!isInitialLoad && !sameMapTransition && this.container.gameMode?.isBuild()) {
            this.container.gameMode.setMode(GAME_MODES.PLAY);
        }

        const transitionCopy = this._buildTransitionCopy(options, mapId);

        if (!isInitialLoad) {
            if (this.container.inputHandler && this.container.inputHandler.disable) {
                this.container.inputHandler.disable();
            } else {
                Utility.warnDebug('InputHandler disable method not available');
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

        // A portal takes whoever walked into it, and nobody else. Every other
        // deployed myte stays on the map being left, standing where it stands,
        // until the player comes back for it.
        if (!isInitialLoad) {
            this.container.mytePresence?.parkOthers(
                sourceMapId,
                options.myte ?? this.container.activeMyte ?? null
            );
        }

        let newMap;
        let loadError = null;

        try {
            if (this.core && this.core.mapLoader) {
                if (isInitialLoad) {
                    newMap = await this.core.mapLoader.loadMap(mapId, this.container, {
                        isInitialLoad: true,
                        allowFallback
                    });
                } else {
                    newMap = await this.core.mapLoader.loadMapWithTransition(mapId, this.container, {
                        ...options,
                        message: transitionCopy.message,
                        transitionTitle: transitionCopy.title,
                        transitionDescription: transitionCopy.description,
                        transitionTip: transitionCopy.tip,
                        minVisibleTime: transitionCopy.minVisibleTime,
                        isInitialLoad: false,
                        allowFallback
                    });
                }
            } else {
                Utility.warnDebug('Core mapLoader not available, creating map directly');
                newMap = new GameMap(this.container);
                try {
                    await newMap.initialize(mapId, { isInitialLoad, allowFallback });
                } catch (error) {
                    newMap.dispose?.();
                    newMap = null;
                    throw error;
                }
            }
        } catch (error) {
            loadError = error;
            newMap = null;
        }

        if (newMap) {
            this.previousMapId = sourceMapId;
            this.currentMapId = mapId;

            this.container.gameMap = newMap;
            // Canvas dimensions changed with the map. Camera bounds must be
            // recomputed now, before arrival framing, rather than after reveal.
            this.container.invalidateCanvasRect?.();

            if (newMap.gridSystem && document.body.classList.contains('debug')) {
                Utility.logDebug('[MapTransitionManager] Reinitializing GridSystem debug mode');

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
            this.container.camera?.cancelDragPan?.();

            if (!options.preserveCamera && this.container.camera) {
                // Reserved for future custom camera reset behavior.
            }

            // Sync all myte home slots to the new map's spawn point first,
            // then override the active myte's position with its specific arrival.
            this._syncAllMyteSlotsToSpawn(newMap);

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

                if (activeMyte) {
                    this._centerCameraOnMyte(activeMyte);
                } else {
                    const viewerFocus = this._getViewerCameraFocus(newMap, {
                        targetPortalId,
                        targetSpawnPoint: spawnPoint,
                        sourceMapId: this.previousMapId,
                        sourcePortalId
                    });
                    this._centerCameraOnPosition(viewerFocus?.position, viewerFocus?.size);
                }
            }

            // Anyone left standing on this map last time is still standing there.
            this.container.mytePresence?.restoreOn(newMap.id);

            await this._waitForRevealReadiness(newMap, mapId);

            return this._finishSuccessfulTransition(options, isInitialLoad);
        }

        if (!isInitialLoad) {
            console.error(`[MapTransitionManager] Failed to load map ${mapId}:`, loadError);
            this._showMapLoadFailureToast(mapId);
            this._completeTransitionUi(false);
        } else {
            console.error(`[MapTransitionManager] Initial map load failed for ${mapId}:`, loadError);

            const fallbackMapId = SiteConfig?.world?.defaultMap ?? 'House';

            if (mapId !== fallbackMapId) {
                Utility.logDebug(`[MapTransitionManager] Trying fallback map: ${fallbackMapId}`);
                return this.startTransition({
                    ...options,
                    targetMap: fallbackMapId,
                    allowFallback,
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
        Utility.logDebug('[MapTransitionManager] Disposing');
        if (this.transitionElement && this.transitionElement.parentNode) {
            this.transitionElement.parentNode.removeChild(this.transitionElement);
        }
        this.transitionElement = null;
        this.messageElement = null;
    }
}
