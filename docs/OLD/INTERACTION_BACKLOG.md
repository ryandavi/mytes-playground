# Interaction Backlog

Updated: 2026-05-19

This note tracks interaction-system issues that came up during ball/item carry work.

## Implementation Status

Implemented in code:

- Item carry is now explicit instead of implicit:
  - `pickup_item`
  - `hold_item`
  - `drop_item`
- Clicking/selecting the ball no longer auto-queues pickup.
- Pickup validates live range before succeeding.
- Pickup follows moved targets instead of relying on a stale position snapshot.
- `go_to_object` now replans when the target moves significantly.
- Held items use species-based carry anchors and render in front of the carrier via elevated z-order.
- Select-mode pickup gesture for pickup-capable draggable objects now uses the same upward-drag style trigger as Mytes.
- Ball pickup/drop uses shared item-carry flow and still preserves ball-specific physics on release.

Still needs real gameplay QA:

- Confirm the select-mode ball pickup gesture now feels identical enough to Myte pickup in practice.
- Confirm the carried-item front layering looks right across all map depths and not just the shell case.
- Confirm the new pickup retry / replan behavior feels sensible when an item is dragged away mid-approach.

## Current Problems

### 1. Held items should render in front of the Myte sprite

- Current intent is species-based carry positioning.
- Remaining issue: carried items should also be visually layered in front of the carrier, not behind/inside the sprite stack.
- Snail-specific placement should sit on the shell, but still read clearly as "held" in front of the Myte.

### 2. Pickup can succeed even after the item moved away

- Current ball pickup queue is assembled in `js/Myte/Queue/MyteQueue.js` via `addPickupBall(ball)`.
- It snapshots the target position up front with:
  - `['astar-move', { target: { x: ball.posX + ball.size.width / 2, y: ball.posY + ball.size.height / 2 } }]`
  - then `['hold-ball', { ball }]`
- `HoldBallAction.start()` in `js/Myte/Queue/Actions/CarryActions.js` directly calls `ball.pickup(this.myte)` with no distance/range revalidation.
- Result: if the ball was nearby when queued, but moved before `hold-ball` starts, the Myte can still "teleport-pickup" it from too far away.

### 3. Queue semantics do not currently handle movable targets robustly

- `go_to_object` tracks an object target and can plan around a live object.
- `addPickupBall()` does not use `go_to_object`; it snapshots coordinates instead.
- More generally, queues need a rule for dynamic targets:
  - re-evaluate target location at action start
  - optionally re-path while approaching
  - fail gracefully if target is no longer valid / no longer in range
- We should decide whether movable-target awareness belongs:
  - in the movement actions
  - in the interaction action itself
  - or in both

### 4. "Move to item" and "pick up item" are currently conflated

- `BallMapObject.press()` currently causes the active Myte to queue `addPickupBall(this)`.
- That means clicking/selecting the ball effectively means "go pick it up", not just "interact with / inspect / move to" the item.
- This is probably the wrong abstraction.

### 5. `HoldBallAction` should likely become a general item carry action

- Current carry actions are split like this:
  - Myte carry: `carry_pickup`, `carry`, `being_carried`, `carry_putdown`
  - Ball carry: `hold-ball`
- For items, the action model should likely be:
  - `pickup_item`
  - `hold_item`
  - `drop_item`
- `hold-ball` can then become a specialized implementation detail or be replaced by a generic `hold_item`.

### 6. Carrying Mytes vs carrying items should share a pattern, but not be the same action

- Mytes and items have different rules:
  - Mytes have their own queue/state
  - Items may be physics objects
  - Drop behavior differs
  - Rendering anchors differ
- So they should not literally use the same action IDs.
- But they should probably share a common interaction model:
  - approach target
  - validate in range
  - pickup
  - hold
  - drop / put down

### 7. Select-mode drag parity is still incomplete

- Myte select-mode pickup uses a legacy handler path in:
  - `js/Myte/Input/MyteClickHandler.js`
  - `js/Myte/Input/MyteTouchHandler.js`
- It has a very specific gesture:
  - press
  - small delay
  - upward drag
  - temporary switch to drag mode
- Map-object select drag currently uses the newer map-object path in:
  - `js/Map/MapObjects/MapObject.js`
- Even when drag mode works, select-mode drag does not yet fully match the Myte pickup feel/behavior.
- User-facing symptom:
  - dragging the ball in drag mode works
  - dragging the ball from select mode does not behave like picking up a Myte

## Design Direction

### Item interactions should become explicit actions

Preferred direction:

- `go_to_object` means approach only
- `pickup_item` means pick it up if in range
- `drop_item` means place/release the held item
- `inspect` / `play` / other object interactions remain separate

This avoids "clicking an item means automatically carry it".

### Movable target actions need revalidation

At minimum:

- re-check target validity at action start
- re-check range before pickup
- abort or re-path if the item moved away

For physics items:

- if the target moved but is still nearby, re-approach
- if the target is already carried / no longer available, cancel the queued pickup

### Interaction parity should be behavioral first

We do not need Mytes and map objects to share identical internals immediately.

We do need them to share:

- select-mode gesture expectations
- hover cursor rules
- pickup/drop feedback
- clear separation between "move to", "pick up", and "drop"

## Likely Next Refactor Steps

1. Add a dedicated item pickup action that validates range before pickup.
2. Replace `addPickupBall()` coordinate snapshotting with object-target approach + validation.
3. Add explicit `drop_item` action and UI exposure for held items.
4. Move held-item rendering to a front layer / correct z-order relative to the carrier sprite.
5. Rework select-mode item drag so it matches the Myte pickup gesture instead of only generic drag behavior.
