class WallOpenings extends WallCutaway {
    normalizeOpeningFootprints() {
        for (const opening of this.openings) {
            const object = this.gameMap.getObjectById?.(opening.id);
            if (!object || !opening.cells?.length) continue;
            const axis = this.getOpeningAxis(object);
            const count = Math.max(1, Math.round(
                (axis === 'horizontal' ? object.size.width : object.size.height) / this.cellSize
            ));
            const startX = Math.min(...opening.cells.map(cell => cell[0]));
            const startY = Math.min(...opening.cells.map(cell => cell[1]));
            opening.axis = axis;
            opening.cells = Array.from({ length: count }, (_, index) => [
                startX + (axis === 'horizontal' ? index : 0),
                startY + (axis === 'vertical' ? index : 0)
            ]);
        }
    }

    pruneOrphanedRecords() {
        const exists = id => !!this.gameMap.getObjectById?.(id);
        const openings = this.openings.filter(opening => exists(opening.id));
        const fixtures = this.fixtures.filter(record => exists(record.id));
        const changed = openings.length !== this.openings.length ||
            fixtures.length !== this.fixtures.length;
        this.openings = openings;
        this.fixtures = fixtures;
        return changed;
    }

    releaseObject(object) {
        const id = String(object?.id ?? object);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        const level = this.gameMap?.buildDocument?.level?.();
        const transaction = this.gameMap?.buildTransaction;
        const hadOpening = level?.openings.has(id) === true;
        const hadFixture = level?.fixtures.has(id) === true;
        const hadAttachment = level?.attachments.has(id) === true;
        if (!transaction || (!hadOpening && !hadFixture && !hadAttachment)) return false;
        transaction.run('Release wall attachment', (_draft, draftLevel) => {
            draftLevel.openings.delete(id);
            draftLevel.fixtures.delete(id);
            draftLevel.attachments.delete(id);
        }, { recordHistory: false });
        this.openingSlots.delete(id);
        this.evaluateCutaway(true);
        if (String(object?.type).toUpperCase() === 'DOOR') this.gameMap.buildDoorRoomTopology?.();
        return true;
    }

    reindexOpenings() {
        this.openingKeys.clear();
        this.openingByCell.clear();
        this.cells = new Map([...this.baseCells].map(([key, cell]) => [key, { ...cell, opening: null }]));
        for (const opening of this.openings) {
            const cells = opening.cells || [];
            for (let index = 0; index < cells.length; index++) {
                const [x, y] = cells[index];
                const key = `${x},${y}`;
                this.openingKeys.add(key);
                this.openingByCell.set(key, {
                    ...opening,
                    isStart: index === 0,
                    isEnd: index === cells.length - 1
                });
            }
        }
        for (const opening of this.openings) this.bridgeOpeningGap(opening);
        for (const [key, opening] of this.openingByCell) {
            const cell = this.cells.get(key);
            if (cell) cell.opening = opening;
        }
        this.syncGridWallState();
    }

    bridgeOpeningGap(opening) {
        const openingCells = opening.cells || [];
        if (openingCells.length === 0 || openingCells.every(([x, y]) => this.cells.has(`${x},${y}`))) return;
        const { ordered, before, bridgeable } = this._resolveOpeningBridge(
            openingCells,
            opening.axis,
            this.cells
        );
        const existing = ordered.map(([x, y]) => this.cells.get(`${x},${y}`)).find(Boolean);
        if (!existing && !bridgeable) return;
        const template = existing || before;

        for (const [x, y] of ordered) {
            const key = `${x},${y}`;
            if (this.cells.has(key)) continue;
            this.cells.set(key, {
                ...this.wallData.defaults,
                constructionId: template.constructionId,
                finishId: template.finishId,
                heightCells: template.heightCells,
                connectGroup: template.connectGroup,
                x,
                y,
                opening: this.openingByCell.get(key)
            });
        }
    }

    _resolveOpeningBridge(cells, axis, source) {
        const horizontal = axis === 'horizontal';
        const ordered = [...cells].sort((a, b) => horizontal ? a[0] - b[0] : a[1] - b[1]);
        const [startX, startY] = ordered[0];
        const [endX, endY] = ordered[ordered.length - 1];
        const before = source.get(`${startX - (horizontal ? 1 : 0)},${startY - (horizontal ? 0 : 1)}`);
        const after = source.get(`${endX + (horizontal ? 1 : 0)},${endY + (horizontal ? 0 : 1)}`);
        return {
            ordered,
            before,
            after,
            bridgeable: !!before && !!after && before.connectGroup === after.connectGroup
        };
    }

    getApertureInsets(opening) {
        const object = this.gameMap.getObjectById?.(opening.id);
        const configured = object?.getConfig?.('wallOpeningConfig.apertureInset') ??
            SiteConfig.wallSystem.apertureInsetPx;
        const uniform = Number.isFinite(configured) ? configured : 0;
        const insets = {
            top: uniform, right: uniform, bottom: uniform, left: uniform,
            ...(Number.isFinite(configured) ? {} : configured || {})
        };
        // An opening that reaches the floor has no bottom frame to tuck under,
        // and any inset there leaves a sliver of wall inside the doorway.
        if (!(Number(opening.sillHeight) > 0)) insets.bottom = 0;
        return insets;
    }

    applyOpeningAperture(context, cell, x, construction) {
        const opening = cell.opening;
        if (!opening) return;
        const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
        const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
        const insets = this.getApertureInsets(opening);

        const bottom = construction.baselineRow + 1 - sillHeight - insets.bottom;
        const height = openingHeight - insets.bottom - insets.top;
        if (height <= 0) return;

        const horizontal = opening.axis !== 'vertical';
        const left = x + (horizontal && opening.isStart ? insets.left : 0);
        const right = x + construction.cellSize - (horizontal && opening.isEnd ? insets.right : 0);
        if (right <= left) return;

        // A wall running SOUTH draws past its own baseline, down into the next
        // cell's footprint. An opening that reaches the floor passes through
        // that stretch as well, so the hole runs to the bottom of the frame
        // rather than stopping at the baseline — otherwise a doorway in a
        // north-south wall leaves a sliver of wall hanging under each of its
        // cells. A sill keeps the baseline, because the wall below a window is
        // solid and that stretch is part of it.
        const top = bottom - height;
        const depth = (sillHeight > 0 ? bottom : construction.frameHeight) - top;
        if (depth <= 0) return;
        context.clearRect(left, top, right - left, depth);
    }

    getCellObstruction(x, y) {
        const cellSize = this.cellSize;
        const rect = { x: x * cellSize, y: y * cellSize, width: cellSize, height: cellSize };

        const gridCell = this.gameMap.gridSystem?.grid?.[x]?.[y];
        for (const object of gridCell?.objects || []) {
            if (this._travellingRecordIds.has(String(object.id))) continue;
            if (this.openingByCell.has(`${x},${y}`) && String(this.openingByCell.get(`${x},${y}`).id) === String(object.id)) continue;
            if (this.isWallMountedObject(object)) continue;
            // Walkability is a pathfinding answer and this is a masonry
            // question. Borrowing it meant anything you could step over — a rug,
            // a flower bed, a crop, a butterfly resting on a tile — was invisible
            // to the wall tool and got built straight through.
            if (object.contributesToWalkability === false) continue;
            return { reason: `${object.getDisplayName?.() || 'Something'} is in the way.`, entity: object };
        }

        if (this.isPortalApproachCell(x, y)) {
            return { reason: 'A way out of the map has to stay reachable.', entity: null };
        }

        if (this.isHomeSlotCell(rect)) {
            return { reason: 'A Myte needs to be able to reach its slot.', entity: null };
        }

        const creature = this.findCreatureInRect(rect);
        if (creature) {
            return { reason: `${creature.name || 'A Myte'} is standing there.`, entity: creature };
        }

        return null;
    }

    getOpeningJunctionConflict(x, y) {
        const group = this.baseCells.get(`${x},${y}`)?.connectGroup ||
            this.wallData.defaults.connectGroup;

        for (const direction of WallBuilder.DIRECTIONS) {
            const neighborX = x + direction.dx;
            const neighborY = y + direction.dy;
            const opening = this.openingByCell.get(`${neighborX},${neighborY}`);
            if (!opening || this._travellingRecordIds.has(String(opening.id))) continue;

            const neighbor = this.cells.get(`${neighborX},${neighborY}`);
            if (!neighbor || neighbor.connectGroup !== group) continue;

            // The arm this build would add to the opening's cell, on top of
            // whatever it already connects to.
            const opposite = WallBuilder.DIRECTIONS.find(
                candidate => candidate.dx === -direction.dx && candidate.dy === -direction.dy
            );
            const mask = this.computeMask(neighbor) | opposite.bit;
            if (this.isOpeningCellCompatible(mask, opening.axis)) continue;

            const type = String(opening.type || 'opening').toLowerCase();
            return {
                reason: `A wall here would run through the ${type}.`,
                entity: this.gameMap.getObjectById?.(opening.id)
            };
        }

        return null;
    }

    isWallOpeningObject(object) {
        return !!object?.getConfig?.('wallOpeningConfig', null);
    }

    isPortalApproachCell(x, y) {
        const cellSize = this.cellSize;
        for (const object of this.gameMap.objects || []) {
            if (String(object.type).toUpperCase() !== 'PORTAL') continue;
            const left = Math.floor(object.posX / cellSize) - 1;
            const top = Math.floor(object.posY / cellSize) - 1;
            const right = Math.floor((object.posX + object.size.width) / cellSize) + 1;
            const bottom = Math.floor((object.posY + object.size.height) / cellSize) + 1;
            if (x >= left && x <= right && y >= top && y <= bottom) return true;
        }
        return false;
    }

    getOpeningAxis(object) {
        const facing = object.getConfig?.('facingDirection', object.facingDirection);
        if (facing === 'E' || facing === 'W') return 'vertical';
        if (facing === 'N' || facing === 'S') return 'horizontal';
        return object.size.width >= object.size.height ? 'horizontal' : 'vertical';
    }

    getFootInset(constructionId = this.wallData.defaults?.constructionId) {
        const construction = this.registry.getConstruction(constructionId);
        return construction ? (this.cellSize - construction.thickness) / 2 : 0;
    }

    getDefaultOpeningHeight(type) {
        const defaults = SiteConfig.wallSystem.defaultOpeningHeightPx || {};
        return Number(defaults[type]) || Number(defaults.door) || 0;
    }

    getOpeningObjectOffset(object, opening = null) {
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const offset = object?.getConfig?.('wallOpeningConfig.placementOffset', {}) || {};
        const type = String(object?.type || '').toLowerCase();
        const openingHeight = Number(opening?.openingHeight ?? wallOpening.openingHeight) ||
            this.getDefaultOpeningHeight(type);
        const sillHeight = Number(opening?.sillHeight ?? wallOpening.sillHeight) || 0;
        return {
            x: Number(offset.x) || 0,
            // Openings hang off the wall's foot, not the cell's south edge, so
            // they ride the centered baseline with the wall around them.
            y: (type === 'window'
                ? this.cellSize - openingHeight - sillHeight
                : Number(offset.y) || 0) - this.getFootInset()
        };
    }

    getOpeningSillHeights(object) {
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const defaultSill = Math.max(0, Number(wallOpening.sillHeight) || 0);
        if (String(object?.type || '').toLowerCase() !== 'window' ||
            this.getOpeningAxis(object) !== 'horizontal' ||
            wallOpening.adjustableSillHeight !== true) return [defaultSill];

        const min = Math.max(0, Number(wallOpening.minSillHeight) || 0);
        const max = Math.max(min, Number(wallOpening.maxSillHeight) || min);
        const step = Math.max(1, Number(wallOpening.sillHeightStep) || this.cellSize);
        const heights = [];
        for (let sill = min; sill <= max; sill += step) heights.push(sill);
        if (!heights.includes(defaultSill)) heights.push(defaultSill);
        return heights;
    }

    getOpeningPlacementCandidates(object, x = object.posX, y = object.posY) {
        const axis = this.getOpeningAxis(object);
        const count = Math.max(1, Math.round((axis === 'horizontal' ? object.size.width : object.size.height) / this.cellSize));
        const wallOpening = object?.getConfig?.('wallOpeningConfig', {}) || {};
        const openingHeight = Number(wallOpening.openingHeight) ||
            this.getDefaultOpeningHeight(String(object?.type || '').toLowerCase());

        return this.getOpeningSillHeights(object).map(sillHeight => {
            const offset = this.getOpeningObjectOffset(object, { openingHeight, sillHeight });
            const x0 = Math.round((x - offset.x) / this.cellSize);
            const y0 = Math.round((y - offset.y) / this.cellSize);
            const position = {
                x: x0 * this.cellSize + offset.x,
                y: y0 * this.cellSize + offset.y
            };
            return {
                axis,
                openingHeight,
                sillHeight,
                position,
                cells: Array.from({ length: count }, (_, index) => [
                    x0 + (axis === 'horizontal' ? index : 0),
                    y0 + (axis === 'vertical' ? index : 0)
                ]),
                distance: Math.hypot(position.x - x, position.y - y)
            };
        }).sort((left, right) => left.distance - right.distance);
    }

    getOpeningCellsForObject(object, x = object.posX, y = object.posY) {
        const placement = this.resolveOpeningPlacement(object, x, y);
        return placement?.cells || this.getOpeningPlacementCandidates(object, x, y)[0]?.cells || [];
    }

    getOpeningBounds(opening) {
        const xs = opening.cells.map(cell => cell[0]);
        const ys = opening.cells.map(cell => cell[1]);
        return {
            x: Math.min(...xs) * this.cellSize,
            y: Math.min(...ys) * this.cellSize,
            width: (Math.max(...xs) - Math.min(...xs) + 1) * this.cellSize,
            height: (Math.max(...ys) - Math.min(...ys) + 1) * this.cellSize
        };
    }

    getOpeningRenderZIndex(object, x = object.posX, y = object.posY) {
        const bounds = this.getOpeningPlacementBounds(object, x, y);
        if (!bounds) return null;
        return this.gameMap.getDepthZIndex(bounds.y + bounds.height) + 1;
    }

    getOpeningPlacementBounds(object, x = object.posX, y = object.posY) {
        const placement = this.resolveOpeningPlacement(object, x, y);
        return placement ? this.getOpeningBounds(placement) : null;
    }

    canBridgeOpeningCells(cells, axis) {
        if (cells.every(([x, y]) => this.baseCells.has(`${x},${y}`))) return true;
        return this._resolveOpeningBridge(cells, axis, this.baseCells).bridgeable;
    }

    isOpeningCellCompatible(mask, axis) {
        return axis === 'horizontal'
            ? WallBuilder.isHorizontalMask(mask) && !WallBuilder.isVerticalMask(mask)
            : WallBuilder.isVerticalMask(mask) && !WallBuilder.isHorizontalMask(mask);
    }

    isOpeningPlacementValid(object, placement) {
        if (!placement || !this.canBridgeOpeningCells(placement.cells, placement.axis)) return false;
        const cellsAreValid = placement.cells.every(([cellX, cellY]) => {
            const occupied = this.openingByCell.get(`${cellX},${cellY}`);
            if (occupied && String(occupied.id) !== String(object.id)) return false;
            const cell = this.baseCells.get(`${cellX},${cellY}`);
            if (!cell) return true;
            return this.isOpeningCellCompatible(this.computeMask(cell), placement.axis);
        });
        if (!cellsAreValid || placement.axis !== 'horizontal') return cellsAreValid;

        const openingBounds = this.getOpeningFaceBounds(placement);
        return !this.fixtures.some(record => {
            if (String(record.id) === String(object.id)) return false;
            const fixture = this.gameMap.getObjectById?.(record.id);
            if (!fixture) return false;
            return this.rectsOverlap(openingBounds, {
                left: fixture.posX,
                right: fixture.posX + fixture.size.width,
                top: fixture.posY,
                bottom: fixture.posY + fixture.size.height
            });
        });
    }

    getOpeningFaceBounds(opening) {
        const footprint = this.getOpeningBounds(opening);
        const baseline = footprint.y + this.cellSize - this.getFootInset();
        const bottom = baseline - (Number(opening.sillHeight) || 0);
        return {
            left: footprint.x,
            right: footprint.x + footprint.width,
            top: bottom - (Number(opening.openingHeight) || 0),
            bottom
        };
    }

    rectsOverlap(left, right) {
        return left.right > right.left && left.left < right.right &&
            left.bottom > right.top && left.top < right.bottom;
    }

    resolveOpeningPlacement(object, x = object.posX, y = object.posY) {
        return this.getOpeningPlacementCandidates(object, x, y)
            .find(placement => this.isOpeningPlacementValid(object, placement)) || null;
    }

    canPlaceOpeningObject(object, x = object.posX, y = object.posY) {
        return this.resolveOpeningPlacement(object, x, y) !== null;
    }

    createOpeningRecord(object, placement = this.resolveOpeningPlacement(object)) {
        if (!placement) return null;
        const type = String(object.type).toLowerCase();
        return {
            id: String(object.id),
            type,
            cells: placement.cells,
            axis: placement.axis,
            openingHeight: placement.openingHeight,
            sillHeight: type === 'window' ? placement.sillHeight : 0,
            continuesTopTrim: object.getConfig?.('wallOpeningConfig.continuesTopTrim', false) === true,
            blocksLineOfSight: false
        };
    }

    attachOpeningObject(object, opening) {
        const slot = new WallOpeningSlot(this, opening, object);
        const offset = this.getOpeningObjectOffset(object, opening);
        object.posX = slot.posX + offset.x;
        object.posY = slot.posY + offset.y;
        object.updatePosition?.();
        this.gameMap.gridSystem?.updateObjectPosition?.(object);
        const attachment = this.gameMap.container?.attachments?.attach(slot, object, 'opening', {
            inheritFacing: false,
            collision: 'inherit',
            zBias: 1
        });
        if (!attachment) return false;
        this.openingSlots.set(String(opening.id), slot);
        object._wallOpeningSlotId = String(opening.id);
        const [cellX, cellY] = opening.cells?.[0] || [];
        const piece = this.findPieceForCell(cellX, cellY);
        if (piece) slot.setCutLine(piece);
        return true;
    }

    rebindOpeningObjects(ids = []) {
        const wanted = new Set((ids || []).map(String));
        if (wanted.size === 0) return;
        for (const opening of this.openings) {
            if (!wanted.has(String(opening.id))) continue;
            const object = this.gameMap.getObjectById?.(opening.id);
            if (!object) continue;
            this.gameMap.container?.attachments?.detach?.(object);
            this.attachOpeningObject(object, opening);
        }
    }

    bindOpeningObjects() {
        for (const opening of this.openings) {
            const object = this.gameMap.getObjectById?.(opening.id);
            if (object) this.attachOpeningObject(object, opening);
        }
    }

    beginOpeningMove(object) {
        const id = String(object.id);
        object._wallBuildRecordBefore = Utility.deepClone(this.openings.find(record => String(record.id) === id) || null);
        object._wallBuildRecordKind = 'openings';
        this._movingOpeningIds.add(id);
        this._movingObjects.set(id, object);
        this._movingRevealPieceIds.set(id, new Set(
            this.getMovingObjectRevealSpans(object).map(span => span.piece.id)
        ));
        this.gameMap.container?.attachments?.detach?.(object);
        this.openings = this.openings.filter(opening => String(opening.id) !== id);
        this.openingSlots.delete(id);
        this.reindexOpenings();
        this.rebuild();
    }

    finishOpeningMove(object) {
        const id = String(object.id);
        const placement = this.resolveOpeningPlacement(object);
        if (!placement) {
            this._movingOpeningIds.delete(id);
            this._movingObjects.delete(id);
            this._movingRevealPieceIds.delete(id);
            this.evaluateCutaway(true);
            return false;
        }
        object.posX = placement.position.x;
        object.posY = placement.position.y;
        object.updatePosition?.();
        const opening = this.createOpeningRecord(object, placement);
        const build = this.gameMap?.buildTransaction;
        if (build) {
            build.run(`Move ${object.getDisplayName?.() || object.type}`, (_draft, level) => {
                level.openings.set(id, opening);
            }, { recordHistory: false });
        } else {
            this.openings.push(opening);
            this.reindexOpenings();
            this.rebuild();
        }
        object._wallBuildRecordAfter = Utility.deepClone(opening);
        const attached = this.attachOpeningObject(object, opening);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.evaluateCutaway(true);
        if (attached && object.type === 'DOOR') this.gameMap.buildDoorRoomTopology?.();
        return attached;
    }

    cancelOpeningMove(object) {
        const id = String(object.id);
        this._movingOpeningIds.delete(id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.syncBuildDocumentRecords();
        this.reindexOpenings();
        this.rebuild();
        this.rebindOpeningObjects([id]);
        this.evaluateCutaway(true);
    }
}
