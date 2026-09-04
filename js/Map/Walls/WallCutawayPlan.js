class WallCutawayPlan extends WallRenderer {
    expandCutOverOpenings(piece, cut) {
        const spans = new Map();
        piece.cells.forEach((cell, index) => {
            if (!cell.opening) return;
            const id = String(cell.opening.id);
            const span = spans.get(id) || { from: index, to: index, cut: false };
            span.from = Math.min(span.from, index);
            span.to = Math.max(span.to, index);
            span.cut = span.cut || cut[index];
            spans.set(id, span);
        });
        for (const span of spans.values()) {
            if (!span.cut) continue;
            // One cell of slack either side, because the cells next to a
            // lowered run become transition tiles — without the slack the
            // transition lands on the opening itself and a door ends up
            // straddling a step.
            const from = Math.max(0, span.from - 1);
            const to = Math.min(cut.length - 1, span.to + 1);
            for (let index = from; index <= to; index++) cut[index] = true;
        }
    }

    expandStandingOverOpenings(piece, cut) {
        const spans = new Map();
        piece.cells.forEach((cell, index) => {
            if (!cell.opening) return;
            const id = String(cell.opening.id);
            const span = spans.get(id) || { from: index, to: index, standing: false };
            span.from = Math.min(span.from, index);
            span.to = Math.max(span.to, index);
            span.standing = span.standing || !cut[index];
            spans.set(id, span);
        });
        for (const span of spans.values()) {
            if (!span.standing) continue;
            for (let index = span.from; index <= span.to; index++) cut[index] = false;
        }
    }

    hasOpening(piece, index) {
        return !!piece.cells[index]?.opening;
    }

    getRenderPlan(piece, construction) {
        const count = piece.cells.length;
        const cut = this.getResolvedCutStates(piece, count);

        const states = (cut || new Array(count).fill(false)).map((isCut, index) => {
            if (isCut) return 'stub';
            // The authored ramp art is a straight horizontal wall. Applying it
            // to a corner or junction would erase its vertical arm, so those
            // structural cells remain full while the neighboring run handles
            // the height change.
            if (!WallBuilder.isStraightHorizontal(piece.cells[index]?.mask)) return 'full';
            const nextCut = cut && (index + 1 < count
                ? cut[index + 1]
                : this.getNeighborCutState(piece, index, 1));
            const previousCut = cut && (index > 0
                ? cut[index - 1]
                : this.getNeighborCutState(piece, index, -1));
            if (nextCut) return 'rampDown';
            if (previousCut) return 'rampUp';
            return 'full';
        });
        return {
            mode: states.every(state => state === 'full') ? 'full'
                : states.every(state => state === 'stub') ? 'stub'
                : 'cut',
            states
        };
    }

    getResolvedCutStates(piece, count = piece.cells.length) {
        // "Walls Down" is an explicit global presentation, not an occlusion
        // cutaway. Every wall shape must use its stub frame; the transition and
        // structural-anchor rules below intentionally keep some cells standing
        // and therefore apply only to cutaway mode — the one exception is the
        // wall under an object being moved, which stands in every mode and
        // needs those rules to draw the step back down either side of it.
        if (this.presentation === 'down' && !this.hasMovingObjectSpans(piece)) {
            return new Array(count).fill(true);
        }

        const raw = this.getRawCutStates(piece, count);
        if (!raw || !piece.cells.every(cell => this.isHorizontalOnlyCell(cell))) return raw;

        // Cutaway height belongs to the structural run, not to its render
        // pieces. Resolve the whole horizontal chain at once so a paint/room
        // seam cannot independently create a second transition beside the
        // first one.
        const chain = this.getHorizontalCellChain(piece.cells[0]);
        const rawByPiece = new Map();
        const cut = chain.map(cell => {
            const host = this.findPieceForCell(cell.x, cell.y);
            if (!host) return false;
            if (!rawByPiece.has(host)) {
                rawByPiece.set(host, this.getRawCutStates(host, host.cells.length));
            }
            const index = host.cells.findIndex(candidate => candidate.x === cell.x && candidate.y === cell.y);
            return rawByPiece.get(host)?.[index] === true;
        });

        // Everything from here to the transition tidy-up exists to give a
        // cutaway somewhere sensible to return to full height. "Walls down" has
        // no such need: its one standing island is the span under the moving
        // object, and anchoring the run's ends on top of that just raises wall
        // the player did not ask for.
        const anchorRun = this.presentation !== 'down';

        // Straight endpoints abutting vertical structure remain standing. Pure
        // end caps keep their requested state: a cap can belong to a long stub
        // run as long as that run eventually reaches one valid transition.
        if (anchorRun) {
            this.resolveHorizontalBoundary(chain, cut, 0);
            this.resolveHorizontalBoundary(chain, cut, cut.length - 1);
        }

        // Opposing transitions may not touch. This most often happens when a
        // two-cell raised preview straddles a paint seam: extend the standing
        // island by one cell on both sides, leaving a full-height plateau
        // between the stepped transition tiles.
        for (let index = 0; index < cut.length;) {
            if (cut[index]) {
                index++;
                continue;
            }
            const from = index;
            while (index < cut.length && !cut[index]) index++;
            const to = index - 1;
            const bounded = from > 0 && index < cut.length && cut[from - 1] && cut[index];
            const length = to - from + 1;
            if (bounded && length === 1) {
                cut[from] = true;
            } else if (bounded && length === 2) {
                cut[from - 1] = false;
                cut[index] = false;
            }
        }

        // A completely lowered freestanding run has no transition at all. Keep
        // one end anchored at full height, leaving the opposite end cap free to
        // remain a stub. This is the minimum standing area that gives the whole
        // lowered run somewhere logical to return to full height.
        if (anchorRun) {
            this.ensureHorizontalChainAnchor(chain, cut);

            // A full-height cap cannot itself use the straight transition
            // artwork. Reserve its inward straight neighbor for that transition
            // whenever the run beyond it is lowered.
            this.reserveTransitionBesideFullCap(chain, cut, 0, 1);
            this.reserveTransitionBesideFullCap(chain, cut, cut.length - 1, -1);
        }

        const resolvedByCell = new Map(chain.map((cell, index) => [`${cell.x},${cell.y}`, cut[index]]));
        return piece.cells.map(cell => resolvedByCell.get(`${cell.x},${cell.y}`) === true);
    }

    getRawCutStates(piece, count = piece.cells.length) {
        const cut = this.getBaseCutStates(piece, count);
        if (cut) {
            // Never cut through half a door or window: an opening is one
            // object, so the lowered run swallows all of its cells or none.
            this.expandCutOverOpenings(piece, cut);
            // Stand the wall under whatever is being moved. The padded cells
            // push any transition away from the art instead of drawing a
            // height change through a painting or window.
            // Something being moved keeps its wall up in every mode; something
            // merely hanging there only in cutaway ("walls down" is the player
            // asking for the floor plan, and a column under every painting is
            // not that). Both come from one mask, shared with the desired state.
            const standing = this.getForcedStandingCells(piece, count);
            for (let index = 0; index < count; index++) {
                if (standing[index]) cut[index] = false;
            }
            // ...and take any opening that span reaches into up with it, so a
            // window is never half in a standing wall and half in a stub.
            this.expandStandingOverOpenings(piece, cut);
            // Vertical arms, corners, and junctions remain tall. Pure horizontal
            // end caps are resolved with their neighboring cells afterward so
            // they can lower when there is room for a valid transition.
            //
            // Not in "walls down": there the whole wall is deliberately a stub,
            // and the only thing standing is the span under the object being
            // moved. Applying the structural rules there raises the run's end
            // cap and corner as well, for no reason the player can see.
            if (this.presentation !== 'down') {
                for (let index = 0; index < count; index++) {
                    const mask = piece.cells[index]?.mask ?? 0;
                    if (WallBuilder.isVerticalMask(mask) || !WallBuilder.isHorizontalMask(mask)) cut[index] = false;
                }
            }
        }
        return cut;
    }

    isHorizontalOnlyCell(cell) {
        if (!cell) return false;
        const mask = cell?.mask ?? this.computeMask(cell);
        return WallBuilder.isHorizontalMask(mask) && !WallBuilder.isVerticalMask(mask);
    }

    resolveHorizontalBoundary(chain, cut, boundaryIndex) {
        const boundary = chain[boundaryIndex];
        if (!boundary) return;
        if (!WallBuilder.isEndCapMask(this.computeMask(boundary))) {
            // This horizontal sequence terminates at a corner, junction, or
            // other structural boundary outside the sequence. Its boundary
            // straight cell must stand so it can transition into the stub run.
            if (!boundary.opening) cut[boundaryIndex] = false;
        }
    }

    ensureHorizontalChainAnchor(chain, cut) {
        if (cut.length === 0 || cut.some(isCut => !isCut)) return;
        const anchorIndex = cut.length - 1;
        const transitionIndex = anchorIndex - 1;
        const anchor = chain[anchorIndex];
        const transition = chain[transitionIndex];
        if (!anchor || anchor.opening || !transition || transition.opening ||
            !WallBuilder.isStraightHorizontal(this.computeMask(transition))) {
            cut.fill(false);
            return;
        }
        cut[anchorIndex] = false;
        cut[transitionIndex] = false;
    }

    reserveTransitionBesideFullCap(chain, cut, capIndex, inwardDirection) {
        const cap = chain[capIndex];
        if (!cap || cut[capIndex] || !WallBuilder.isEndCapMask(this.computeMask(cap))) return;
        const transitionIndex = capIndex + inwardDirection;
        const transition = chain[transitionIndex];
        if (transition && WallBuilder.isStraightHorizontal(this.computeMask(transition)) && !transition.opening) {
            cut[transitionIndex] = false;
        }
    }

    getHorizontalCellChain(seed) {
        if (!seed || !this.isHorizontalOnlyCell(seed)) return [];
        // `piece.cells` are render-time clones with a cached mask, while
        // `this.cells` contains the canonical authored cells. Compute the mask
        // for canonical neighbors instead of expecting that cache to exist.
        const compatible = cell => this.isHorizontalOnlyCell(cell) &&
            cell.connectGroup === seed.connectGroup &&
            cell.constructionId === seed.constructionId &&
            cell.heightCells === seed.heightCells;
        let left = seed.x;
        while (compatible(this.cells.get(`${left - 1},${seed.y}`))) left--;
        const chain = [];
        for (let x = left;; x++) {
            const cell = this.cells.get(`${x},${seed.y}`);
            if (!compatible(cell)) break;
            chain.push(cell);
        }
        return chain;
    }

    getNeighborCutState(piece, index, direction) {
        const cell = piece.cells[index];
        if (!cell) return false;
        const neighborPiece = this.findPieceForCell(cell.x + direction, cell.y);
        if (!neighborPiece || neighborPiece === piece) return false;
        const neighborIndex = neighborPiece.cells.findIndex(neighbor =>
            neighbor.x === cell.x + direction && neighbor.y === cell.y
        );
        if (neighborIndex < 0) return false;
        return this.getResolvedCutStates(neighborPiece)?.[neighborIndex] === true;
    }

    getBaseCutStates(piece, count) {
        if (this.presentation === 'down') return new Array(count).fill(true);
        if (this.presentation !== 'cutaway') return null;
        return piece.cutStates.map(state => state.cut);
    }

    continuesAcrossPieceBoundary(piece, index, direction) {
        const cell = piece.cells[index];
        if (!cell || !WallBuilder.isStraightHorizontal(cell.mask)) return false;
        const neighbor = this.cells.get(`${cell.x + direction},${cell.y}`);
        if (!neighbor || neighbor.connectGroup !== cell.connectGroup ||
            neighbor.constructionId !== cell.constructionId ||
            neighbor.heightCells !== cell.heightCells) return false;
        return WallBuilder.isStraightHorizontal(this.computeMask(neighbor));
    }
}

