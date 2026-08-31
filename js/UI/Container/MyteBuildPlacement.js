/**
 * MyteBuildPlacement — moving mytes, and the slots they live in, while building.
 *
 * Build mode freezes the world so you can lay it out, and until now the one
 * thing in it that could not be moved was the one thing that had walked into the
 * middle of the room you were laying out. "Leave build mode to wake it, walk it
 * out of the way, come back" is three steps to solve a problem the Move tool
 * already solves for every couch in the house.
 *
 * So: in Build mode, with the Select tool, a myte drags like furniture. The rule
 * for what actually moves is the one people already hold in their heads —
 *
 *   asleep in its slot    the slot moves, and the myte goes with it, because
 *                         the two are one thing: this is where it lives
 *   out on the map        only the myte moves, because its home did not change
 *
 * — so there is nothing to learn and no mode to be in. Nothing here wakes a
 * myte, changes its goal or touches its queue: build mode is scenery, and while
 * you are in it a myte is scenery too.
 */
class MyteBuildPlacement extends UIComponent {
    static SUBJECT_SELECTOR = '.myte-slot, .world-myte, .interactive-myte';

    constructor(parent) {
        super(parent);
        this.drag = null;
        this.dropTargetElement = null;
        this.boundPointerDown = this.handlePointerDown.bind(this);
        this.boundPointerMove = this.handlePointerMove.bind(this);
        this.boundPointerUp = this.handlePointerUp.bind(this);
    }

    get gameMap() {
        return this.container?.gameMap || null;
    }

    /**
     * The furniture sounds, from the furniture's own config.
     *
     * Build mode treats a myte as scenery, so it has to sound like scenery —
     * picking one up in silence and then hearing the drop was the tell that this
     * was a second system wearing the Move tool's clothes. Read from
     * `MapObjectFactory.BASE_CONFIG` rather than copied into SiteConfig, so
     * retuning the drop of a chair retunes the drop of a myte with it.
     */
    get objectSounds() {
        return MapObjectFactory.BASE_CONFIG?.soundEffects || {};
    }

    init() {
        const canvas = this.container?.canvas;
        canvas?.addEventListener('pointerdown', this.boundPointerDown, true);
        document.addEventListener('pointermove', this.boundPointerMove, true);
        document.addEventListener('pointerup', this.boundPointerUp, true);
        document.addEventListener('pointercancel', this.boundPointerUp, true);
        this.track(() => {
            canvas?.removeEventListener('pointerdown', this.boundPointerDown, true);
            document.removeEventListener('pointermove', this.boundPointerMove, true);
            document.removeEventListener('pointerup', this.boundPointerUp, true);
            document.removeEventListener('pointercancel', this.boundPointerUp, true);
        });
    }

    get isArmed() {
        return this.container?.gameMode?.isBuild() === true &&
            this.parent?.isTool(UIToolModes.MOVE) === true;
    }

    // The myte a press landed on, whether it was hit through its slot, its
    // world sprite or the roster element inside the slot.
    resolveMyte(target) {
        const element = target instanceof Element
            ? target.closest(MyteBuildPlacement.SUBJECT_SELECTOR)
            : null;
        if (!element) return null;
        const id = element.dataset.myteId ||
            element.querySelector?.('.interactive-myte')?.dataset?.myteId ||
            element.closest?.('.myte-slot')?.dataset?.myteId;
        if (!id) return null;
        return this.container?.mytes?.find(myte => String(myte.id) === String(id)) || null;
    }

    handlePointerDown(event) {
        if (!this.isArmed || event.button !== 0) return;
        const myte = this.resolveMyte(event.target);
        if (!myte) return;

        // A slot that lives on another map is not on screen to be moved, and a
        // myte visiting from one has no home here to take with it.
        const movesSlot = myte.isInSlot && myte.isOnHomeMap;
        const origin = movesSlot
            ? this.slotOrigin(myte)
            : { x: myte.posX, y: myte.posY };
        if (!origin) return;

        const world = this.pointerToWorld(event);
        if (!world) return;

        event.preventDefault();
        event.stopPropagation();
        this.drag = {
            pointerId: event.pointerId,
            myte,
            movesSlot,
            origin,
            // The grab offset, so the thing does not jump its own corner to the
            // cursor the moment you touch it.
            grabX: world.x - origin.x,
            grabY: world.y - origin.y,
            size: this.subjectSize(myte, movesSlot),
            moved: false
        };
        document.body.classList.add('myte-placement-active');
        this.subjectElement(myte, movesSlot)?.classList.add('is-dragging');
        // The same camera courtesy furniture gets: drag toward the edge and the
        // view comes with you, instead of the myte stopping at the frame.
        this.container?.camera?.beginTemporaryCursorFollow?.(this);
        this.playSound(this.objectSounds.pickup);
        this.render(event);
    }

    // What is actually moving, for the classes that make it look lifted.
    subjectElement(myte, movesSlot) {
        return movesSlot ? myte?.elements?.wrapper : myte?.element;
    }

    handlePointerMove(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();
        this.drag.moved = true;
        this.container?.camera?.updateTemporaryCursorFollow?.(this, event.clientX, event.clientY);
        this.render(event);
    }

    // The camera calls this on the owner of its borrow after an edge-scroll
    // step: the world moved under a pointer that did not, so the dragged myte
    // has to be placed again from the same screen point.
    syncToCursor(clientX, clientY) {
        if (!this.drag) return;
        this.render({ clientX, clientY });
    }

    handlePointerUp(event) {
        if (!this.drag || event.pointerId !== this.drag.pointerId) return;
        event.preventDefault();
        event.stopPropagation();

        const drag = this.drag;
        const position = this.resolvePosition(event);
        const verdict = position ? this.check(position, drag) : BuildRules.deny('That is off the map.');
        this.clear();

        // A press that never moved is a click, not a placement.
        if (!drag.moved) return;
        // Refused means it does not go there, so it goes back where it was —
        // leaving it under the cursor would be the map keeping a change it just
        // said it would not accept.
        if (!verdict.allowed) {
            this.apply(drag.myte, drag.movesSlot, drag.origin);
            this.parent?.showMessage?.(verdict.reason, 'warning', 'Build Mode');
            this.playSound(this.objectSounds.drop_error);
            return;
        }
        this.commit(drag, position);
    }

    /**
     * Escape, and the same call the mode switch makes on the way out: put it
     * back where it was and forget the gesture.
     *
     * @returns {boolean} Whether there was anything to cancel.
     */
    cancel() {
        if (!this.drag) return false;
        const { myte, movesSlot, origin } = this.drag;
        this.clear();
        this.apply(myte, movesSlot, origin);
        return true;
    }

    // ── Where it would land ──────────────────────────────────────────────────

    pointerToWorld(event) {
        return this.container?.inputHandler?.screenToWorldCoordinates?.(event.clientX, event.clientY) || null;
    }

    slotOrigin(myte) {
        const wrapper = myte.elements?.wrapper;
        if (!wrapper) return null;
        return {
            x: Number.parseFloat(wrapper.style.left) || 0,
            y: Number.parseFloat(wrapper.style.top) || 0
        };
    }

    subjectSize(myte, movesSlot) {
        if (!movesSlot) return { width: myte.size?.width ?? 32, height: myte.size?.height ?? 32 };
        const slot = SiteConfig.myte.homeSlotLayout.slotSize;
        return { width: slot, height: slot };
    }

    /**
     * Where the thing stands, as opposed to where its picture is.
     *
     * A myte is a sprite with a lot of air around it and a home slot is a pad
     * nearly six cells across; neither of them *occupies* that. What either one
     * occupies is the cell under its middle — which is also the only sensible
     * thing to snap, because snapping a 192px pad by its corner moves it half a
     * room to line up an edge nobody was looking at.
     */
    centreOf(position, drag = this.drag) {
        const { width, height } = drag?.size ?? { width: 0, height: 0 };
        return { x: position.x + width / 2, y: position.y + height / 2 };
    }

    resolvePosition(event) {
        if (!this.drag) return null;
        const world = this.pointerToWorld(event);
        if (!world) return null;
        const raw = { x: world.x - this.drag.grabX, y: world.y - this.drag.grabY };

        const grid = this.gameMap?.gridSystem;
        if (!grid || this.container?.inputHandler?.shouldSnapToGrid?.() !== true) return raw;

        const cellSize = grid.config.cellSize;
        const centre = this.centreOf(raw);
        const cell = grid.worldToGrid(centre.x, centre.y);
        const { width, height } = this.drag.size;
        return {
            x: (cell.x * cellSize) + (cellSize / 2) - (width / 2),
            y: (cell.y * cellSize) + (cellSize / 2) - (height / 2)
        };
    }

    // The cell a drop would put it in, or null when that is off the map.
    cellFor(position, drag = this.drag) {
        const grid = this.gameMap?.gridSystem;
        if (!grid) return null;
        const centre = this.centreOf(position, drag);
        const cell = grid.worldToGrid(centre.x, centre.y);
        if (cell.x < 0 || cell.y < 0 || cell.x >= grid.gridWidth || cell.y >= grid.gridHeight) return null;
        return cell;
    }

    /**
     * Where it may stand.
     *
     * A myte is held to what it could walk to on its own: on the map, not
     * inside masonry, on a tile it can stand on. It is deliberately allowed to
     * share a square with furniture and with other mytes, because in Play mode
     * it already does — refusing here would be the build tool inventing a rule
     * the game does not have.
     *
     * A home slot is held to more, because it is not passing through. It is
     * where this myte sleeps, permanently, and a bed inside the dining table or
     * on top of somebody else's bed is a layout mistake you would want caught at
     * the moment you made it rather than the next time you looked.
     */
    check(position, drag = this.drag) {
        const cell = this.cellFor(position, drag);
        if (!cell) return BuildRules.deny('That is off the map.');
        if (this.gameMap?.wallBuilder?.cells?.has(`${cell.x},${cell.y}`)) {
            return BuildRules.deny('A wall is in the way.');
        }

        const square = this.gameMap?.gridSystem?.grid?.[cell.x]?.[cell.y];
        if (square && square.tileWalkable === false) {
            return BuildRules.deny('Nothing can stand there.');
        }
        if (!drag?.movesSlot) return BuildRules.ALLOWED;

        // Overlappable things — a rug, a puddle — are exactly the things a bed
        // is fine on top of, so they are the same exemption furniture uses.
        const blocker = [...(square?.objects ?? [])].find(entry =>
            typeof entry?.getConfig === 'function' &&
            !entry.getConfig('visual.overlappable', false));
        if (blocker) return BuildRules.deny(`${blocker.name || 'Something'} is in the way.`);

        const clash = this.container?.mytes?.find(other =>
            other !== drag.myte &&
            other.isOnHomeMap &&
            this.slotCell(other)?.x === cell.x &&
            this.slotCell(other)?.y === cell.y);
        if (clash) return BuildRules.deny(`${clash.name} lives there.`);

        return BuildRules.ALLOWED;
    }

    // The cell another myte's home slot sits in, by the same middle-of-it rule.
    slotCell(myte) {
        const origin = this.slotOrigin(myte);
        if (!origin) return null;
        const slot = SiteConfig.myte.homeSlotLayout.slotSize;
        return this.cellFor(origin, { size: { width: slot, height: slot } });
    }

    // ── What it looks like on the way ────────────────────────────────────────

    render(event) {
        const position = this.resolvePosition(event);
        if (!position) return;
        const allowed = this.check(position).allowed;

        // The subject follows the cursor rather than a ghost of it: a myte is
        // drawn with a shadow and a name and reads as itself, so a stand-in for
        // it would be a second myte on the map.
        this.apply(this.drag.myte, this.drag.movesSlot, position);
        this.renderDropTarget(position, allowed);
    }

    apply(myte, movesSlot, position) {
        if (movesSlot) {
            myte.setWrapperPosition(position.x, position.y);
            return;
        }
        myte.setPosition(position.x, position.y);
        myte.setTarget(position.x, position.y);
        myte.setSpritePosition(position.x, position.y);
    }

    renderDropTarget(position, allowed) {
        const layer = this.gameMap?.layers?.objects;
        const cellSize = this.gameMap?.gridSystem?.config?.cellSize;
        if (!layer || !cellSize) return;
        if (!this.dropTargetElement) {
            // The same footprint furniture gets, so a red rectangle under a
            // thing you are moving always means the same thing.
            this.dropTargetElement = document.createElement('div');
            this.dropTargetElement.className = 'drop-target';
            layer.appendChild(this.dropTargetElement);
        }
        // The cell, not the sprite box: this is the square being claimed, and
        // it is the square the refusal is about.
        const centre = this.centreOf(position);
        Object.assign(this.dropTargetElement.style, {
            left: `${Math.floor(centre.x / cellSize) * cellSize}px`,
            top: `${Math.floor(centre.y / cellSize) * cellSize}px`,
            width: `${cellSize}px`,
            height: `${cellSize}px`,
            display: ''
        });
        this.dropTargetElement.classList.toggle('is-drop-valid', allowed);
        this.dropTargetElement.classList.toggle('is-drop-invalid', !allowed);
    }

    clear() {
        if (this.drag) {
            this.subjectElement(this.drag.myte, this.drag.movesSlot)?.classList.remove('is-dragging');
        }
        this.container?.camera?.endTemporaryCursorFollow?.(this);
        this.drag = null;
        this.dropTargetElement?.remove();
        this.dropTargetElement = null;
        document.body.classList.remove('myte-placement-active');
    }

    // ── Keeping it ───────────────────────────────────────────────────────────

    commit(drag, position) {
        const { myte, movesSlot, origin } = drag;
        if (Math.round(origin.x) === Math.round(position.x) &&
            Math.round(origin.y) === Math.round(position.y)) {
            return;
        }

        const place = (target) => {
            if (movesSlot) myte.setHomeSlotPosition(target);
            else this.apply(myte, false, target);
            this.container?.core?.user?._scheduleSave?.();
        };

        place(position);
        this.playSound(this.objectSounds.drop);
        this.container?.buildHistory?.push({
            label: movesSlot ? `Move ${myte.name}'s Home` : `Move ${myte.name}`,
            undo: () => place(origin),
            redo: () => place(position)
        });
    }

    playSound(sound) {
        if (!sound) return;
        this.container?.core?.soundManager?.playWhenReady?.(sound);
    }
}
