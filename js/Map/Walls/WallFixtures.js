class WallFixtures extends WallOpenings {
    getMountedClearancePx() {
        const value = Number(SiteConfig.wallSystem.mountedClearancePx);
        return Number.isFinite(value) && value > 0 ? value : 0;
    }

    getMountedWallSpans() {
        const cellSize = this.cellSize;
        const spans = [];
        const travelling = record => this._travellingRecordIds.has(String(record.id));

        for (const opening of this.openings) {
            if (travelling(opening)) continue;
            const type = String(opening.type || 'opening').toLowerCase();
            const object = this.gameMap.getObjectById?.(opening.id) || null;
            for (const [cellX, cellY] of opening.cells || []) {
                spans.push({
                    kind: 'opening',
                    row: cellY,
                    left: cellX * cellSize,
                    right: (cellX + 1) * cellSize,
                    reason: `Remove the ${type} first.`,
                    entity: object
                });
            }
        }

        for (const record of this.fixtures) {
            if (travelling(record)) continue;
            const object = this.gameMap.getObjectById?.(record.id);
            const span = object ? this.getFixtureSpan(object) : null;
            if (!span) continue;
            spans.push({
                kind: 'fixture',
                row: span.piece.y,
                left: span.left,
                right: span.right,
                reason: `Take the ${object.getDisplayName?.() || 'fixture'} down first.`,
                entity: object
            });
        }

        return spans;
    }

    getCellMounting(x, y, clearance = 0) {
        const left = x * this.cellSize;
        const right = left + this.cellSize;
        for (const span of this.getMountedWallSpans()) {
            if (span.row !== y) continue;
            if (right <= span.left - clearance || left >= span.right + clearance) continue;
            return { reason: span.reason, entity: span.entity };
        }
        return null;
    }

    getFixtureJunctionConflict(x, y) {
        const clearance = this.getMountedClearancePx();
        const left = (x * this.cellSize) - clearance;
        const right = left + this.cellSize + (2 * clearance);
        const group = this.baseCells.get(`${x},${y}`)?.connectGroup ||
            this.wallData.defaults.connectGroup;

        for (const dy of [-1, 1]) {
            const neighbor = this.cells.get(`${x},${y + dy}`);
            if (!neighbor || neighbor.connectGroup !== group) continue;
            for (const span of this.getMountedWallSpans()) {
                if (span.kind !== 'fixture' || span.row !== y + dy) continue;
                if (right <= span.left || left >= span.right) continue;
                return {
                    reason: `A wall here would split the wall the ${
                        span.entity?.getDisplayName?.() || 'fixture'} hangs on.`,
                    entity: span.entity
                };
            }
        }

        return null;
    }

    hasAuthoredAttachmentAt(x, y) {
        return (this.wallData.attachments || []).some(record => {
            const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            return cellX === x && cellY === y;
        });
    }

    isWallMountedObject(object) {
        const id = String(object?.id ?? '');
        return this.openings.some(opening => String(opening.id) === id) ||
            this.fixtures.some(record => String(record.id) === id) ||
            this.isWallOpeningObject(object);
    }

    isHomeSlotCell(rect) {
        const mapId = this.gameMap?.id;
        return (this.gameMap.container?.mytes || []).some(myte => {
            const slot = myte.homeSlot;
            if (!slot?.isOnMap(mapId)) return false;

            const home = slot.getStandingPosition();
            if (!home) return false;
            return RectUtils.boundsOverlap(rect, {
                x: home.x,
                y: home.y,
                width: myte.size?.width ?? this.cellSize,
                height: myte.size?.height ?? this.cellSize
            });
        });
    }

    findCreatureInRect(rect) {
        const container = this.gameMap.container;
        const candidates = [
            ...(container?.mytes || []).filter(myte => myte.isActive),
            ...(this.gameMap.objects || []).filter(object => object instanceof MovingMapObject)
        ];
        return candidates.find(entity => RectUtils.boundsOverlap(rect, {
            x: entity.posX,
            y: entity.posY,
            width: entity.size?.width ?? 0,
            height: entity.size?.height ?? 0
        })) || null;
    }

    cancelFixtureMove(object) {
        const id = String(object.id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        this.syncBuildDocumentRecords();
        const record = this.fixtures.find(candidate => String(candidate.id) === id);
        if (record) this.attachFixtureObject(object, record);
        this.evaluateCutaway(true);
    }

    createAuthoredAttachments(records) {
        for (const record of records) {
            if (this.decorations.some(decoration => decoration.id === record.id)) continue;
			const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            const piece = this.findPieceForCell(cellX, cellY);
            const surface = piece?.faces?.[record.face];
            if (!surface) continue;
            const decoration = new WallDecoration(this, record);
			const localU = Number(record.u) <= 1
				? Utility.clamp(Number(record.u), 0, 1) * this.cellSize
				: Utility.clamp(Number(record.u), 0, this.cellSize);
			const surfaceU = ((cellX - piece.x) * this.cellSize) + localU;
            const attachment = this.gameMap.container?.attachments?.attach(
                surface,
                decoration,
                record.socketId || 'surface',
                {
                    surfacePoint: { u: surfaceU, v: record.v },
                    surfaceWidth: record.width,
                    inheritFacing: false,
                    zBias: 1
                }
            );
            if (!attachment) {
                decoration.dispose();
                continue;
            }
            decoration.wallAttachmentRecord = { ...record };
            this.decorations.push(decoration);
        }
    }

    getFixtureFaceForPoint(x, y) {
        const construction = this.registry.getConstruction(this.wallData.defaults?.constructionId);
        if (!construction) return null;
        let best = null;
        for (const piece of this.pieces) {
            // Only a straight horizontal run presents a face to this camera.
            if (!piece.cells.every(cell => this.isHorizontalOnlyCell(cell))) continue;
            const left = piece.x * this.cellSize;
            const right = left + (piece.cells.length * this.cellSize);
            const top = piece.baseline - construction.height;
            if (x < left || x > right || y < top || y > piece.baseline) continue;
            if (best && piece.baseline <= best.piece.baseline) continue;
            best = { piece, surface: piece.faces?.south, left, right, top, construction };
        }
        return best;
    }

    getFixturePlacementCandidate(object, x = object.posX, y = object.posY) {
        const width = object.size?.width || 0;
        const height = object.size?.height || 0;
        const face = this.getFixtureFaceForPoint(x + (width / 2), y + (height / 2));
        if (!face) return null;

        const positionX = Utility.clamp(x, face.left, face.right - width);
        const positionY = Utility.clamp(y, face.top, face.piece.baseline - height);
        return {
            piece: face.piece,
            surface: face.surface,
            construction: face.construction,
            position: { x: positionX, y: positionY },
            u: positionX - face.left + (width / 2),
            v: (positionY - face.top + (height / 2)) / Math.max(1, face.construction.height)
        };
    }

    resolveFixturePlacement(object, x = object.posX, y = object.posY) {
        const placement = this.getFixturePlacementCandidate(object, x, y);
        if (!placement || this.overlapsWallFaceObstacle(
            placement.piece,
            placement.construction || this.registry.getConstruction(placement.piece.constructionId),
            object,
            placement.position.x,
            placement.position.y
        )) return null;
        return placement;
    }

    canPlaceFixtureObject(object, x = object.posX, y = object.posY) {
        return this.resolveFixturePlacement(object, x, y) !== null;
    }

    getWallFaceObstacles(piece, construction, excludeId) {
        const obstacles = [];
        for (const cell of piece.cells) {
            const opening = cell.opening;
            if (!opening || String(opening.id) === String(excludeId)) continue;
            const openingHeight = Utility.clamp(Number(opening.openingHeight) || 0, 0, construction.height);
            const sillHeight = Utility.clamp(Number(opening.sillHeight) || 0, 0, construction.height - openingHeight);
            const bottom = piece.baseline - sillHeight;
            obstacles.push({
                left: cell.x * this.cellSize,
                right: (cell.x + 1) * this.cellSize,
                top: bottom - openingHeight,
                bottom
            });
        }
        for (const record of this.fixtures) {
            if (String(record.id) === String(excludeId)) continue;
            // Only what hangs on THIS piece. Faces are 160px tall but rows are
            // 32px apart, so several walls' faces overlap in world space — take
            // every fixture on the map and a painting on the wall in front
            // reserves a band of the wall behind it, where nothing is visible
            // and nothing can be hung.
            const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
            if (this.findPieceForCell(cellX, cellY)?.id !== piece.id) continue;
            const other = this.gameMap.getObjectById?.(record.id);
            if (!other) continue;
            obstacles.push({
                left: other.posX,
                right: other.posX + other.size.width,
                top: other.posY,
                bottom: other.posY + other.size.height
            });
        }
        return obstacles;
    }

    overlapsWallFaceObstacle(piece, construction, object, x, y) {
        const right = x + object.size.width;
        const bottom = y + object.size.height;
        const bounds = { left: x, right, top: y, bottom };
        return this.getWallFaceObstacles(piece, construction, object.id).some(area =>
            this.rectsOverlap(bounds, area)
        );
    }

    createFixtureRecord(object, placement = this.resolveFixturePlacement(object)) {
        if (!placement) return null;
        const center = placement.position.x + (object.size.width / 2);
        const cellX = Math.floor(center / this.cellSize);
        const cellY = placement.piece.y;
        return {
            id: String(object.id),
            mapId: this.gameMap.id,
            cells: { from: [cellX, cellY], to: [cellX, cellY] },
            face: 'south',
            socketId: 'surface',
            u: center - (cellX * this.cellSize),
            uPx: true,
            v: placement.v,
            width: object.size.width,
            height: object.size.height
        };
    }

    attachFixtureObject(object, record) {
        const [cellX, cellY] = record.cells?.from || [record.cellX, record.cellY];
        const piece = this.findPieceForCell(cellX, cellY);
        const surface = piece?.faces?.[record.face || 'south'];
        const construction = this.registry.getConstruction(piece?.constructionId);
        if (!surface || !construction) return false;

        // `uPx` records say outright that u is pixels from the anchor cell's
        // left edge. Without it the only signal is magnitude, and a fixture
        // centred within a pixel of that edge reads as a normalized 0..1
        // offset and jumps half a cell.
        const localU = record.uPx !== true && Number(record.u) <= 1
            ? Utility.clamp(Number(record.u), 0, 1) * this.cellSize
            : Number(record.u);
        const u = ((cellX - piece.x) * this.cellSize) + localU;

        // Place it before attaching, the way an opening is placed into its
        // slot: the socket keeps it there afterwards, but the authored u/v is
        // what decides where on the wall it actually hangs.
        const faceTop = piece.baseline - construction.height;
        object.posX = (piece.x * this.cellSize) + u - (object.size.width / 2);
        object.posY = faceTop + (Utility.clamp(Number(record.v) || 0, 0, 1) * construction.height) -
            (object.size.height / 2);
        object.updatePosition?.();

        const attachment = this.gameMap.container?.attachments?.attach(
            surface, object, record.socketId || 'surface',
            {
                surfacePoint: { u, v: record.v },
                surfaceWidth: object.size.width,
                inheritFacing: false,
                zBias: 1
            }
        );
        return !!attachment;
    }

    bindFixtureObjects() {
        for (const record of this.fixtures) {
            const object = this.gameMap.getObjectById?.(record.id);
            if (object) this.attachFixtureObject(object, record);
        }
    }

    rebindFixtureObjects() {
        const attachments = this.gameMap.container?.attachments;
        if (!attachments) return;
        for (const record of this.fixtures) {
            const object = this.gameMap.getObjectById?.(record.id);
            if (object && attachments.getAttachment(object)) {
                this.attachFixtureObject(object, record);
            }
        }
    }

    beginFixtureMove(object) {
        const id = String(object.id);
        object._wallBuildRecordBefore = Utility.deepClone(this.fixtures.find(record => String(record.id) === id) || null);
        object._wallBuildRecordKind = 'fixtures';
        // A fixture in hand is never cut. Detaching stops the wall talking to
        // it, so a painting picked up off a lowered wall would otherwise keep
        // the hidden state it had when it was hanging there and be dragged
        // around invisible.
        object.applyWallCut?.(null);
        this._movingObjects.set(id, object);
        this._movingRevealPieceIds.set(id, new Set(
            this.getMovingObjectRevealSpans(object).map(span => span.piece.id)
        ));
        this.gameMap.container?.attachments?.detach?.(object);
        this.fixtures = this.fixtures.filter(record => String(record.id) !== id);
        this.evaluateCutaway(true);
    }

    finishFixtureMove(object) {
        const id = String(object.id);
        this._movingObjects.delete(id);
        this._movingRevealPieceIds.delete(id);
        const record = this.createFixtureRecord(object);
        if (!record) {
            this.evaluateCutaway(true);
            return false;
        }
        const placement = this.resolveFixturePlacement(object);
        object.posX = placement.position.x;
        object.posY = placement.position.y;
        object.updatePosition?.();
        const build = this.gameMap?.buildTransaction;
        if (build) {
            build.run(`Move ${object.getDisplayName?.() || object.type}`, (_draft, level) => {
                level.fixtures.set(id, record);
            }, { recordHistory: false });
        } else {
            this.fixtures.push(record);
        }
        object._wallBuildRecordAfter = Utility.deepClone(record);
        const attached = this.attachFixtureObject(object, record);
        this.evaluateCutaway(true);
        return attached;
    }

    applyObjectBuildRecord(object, kind, record) {
        const build = this.gameMap?.buildTransaction;
        if (!build || !['openings', 'fixtures'].includes(kind)) return false;
        const id = String(object.id);
        const result = build.run(`Move ${object.getDisplayName?.() || object.type}`, (_draft, level) => {
            if (record) level[kind].set(id, record);
            else level[kind].delete(id);
        }, { recordHistory: false });
        if (kind === 'openings' && record) this.rebindOpeningObjects([id]);
        if (kind === 'fixtures' && record) {
            this.gameMap.container?.attachments?.detach?.(object);
            this.attachFixtureObject(object, this.fixtures.find(candidate => String(candidate.id) === id) || record);
        }
        return result.committed;
    }
}
