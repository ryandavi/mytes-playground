# Smoke Checklist — run at the end of EVERY refactor task

One page, ~5 minutes in the browser (`index.php` via XAMPP). Every delegated task prompt ends with "run docs/SMOKE_CHECKLIST.md and report results". A failure means *your task* caused it — fix before hand-back.

## Boot
- [ ] Game loads to the world with **zero console errors or warnings** (warnings that existed before your change: note them, don't fix them silently).
- [ ] Loading screen progresses through its stage messages and disappears.

## Mytes
- [ ] Deploy a myte from its home slot; it exits the slot and appears in the world.
- [ ] Myte follows the mouse in default mode; switch to free-roam and it wanders on its own.
- [ ] Within ~1–2 minutes of free-roam, the AI takes at least one autonomous action (inspect / eat / sit / social) — watch the queue UI.
- [ ] Drag the myte and drop it; it lands where dropped, no coordinate warnings in console.
- [ ] Rub gesture produces its reaction (input stack is fragile — always check).
- [ ] Return the myte to its home slot; slot state and battery display look normal.

## Objects & interactions
- [ ] Double-click the couch: myte approaches, settles into a seat, bobs, dismounts. Deploy a second myte and sit both — they take **different seats**.
- [ ] Myte picks up a carryable item (ball), holds it while moving, drops it.
- [ ] Myte carries another myte (pick up + put down).
- [ ] Open the treasure chest via double-click.
- [ ] Walk a myte through a door — it auto-opens.

## World
- [ ] Take the portal to another map and back; no console errors, mytes intact, no duplicate objects.
- [ ] Ambient creatures (butterfly/bee/bird) are moving and animating.
- [ ] Zone effect works: park a myte in a rest zone, watch comfort/energy tick up in the stats panel.

## UI
- [ ] Select a map object: sidebar shows its actions; run one action from the sidebar.
- [ ] Settings panel opens; toggle a setting; it persists after reload.
- [ ] `?debug` URL param: debug overlays render and toggle without errors.

## Editor
- [ ] `editor/` loads and displays the object types list without console errors.

## After your specific change
- [ ] Re-verify the feature areas your diff touched, beyond the items above.
- [ ] Run `const run = __audit.autoplay(); const report = await run.promise; console.log(report);` while the Mytes free-roam. Confirm `report.passed === true`, then save it with `__audit.download('autoplay', report)`.
- [ ] If your task has a recorded baseline (depth / affordances / candidates — see `window.__audit` in `js/UI/Debug/AuditHarness.js`), dump the *after* JSON and diff against `docs/audit-baselines/`.
