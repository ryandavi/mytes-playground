---
name: verify
description: Drive the Neko app in a headless browser to verify changes end-to-end.
---

# Verifying Neko changes

The app is served by XAMPP at `http://localhost/genes/chat/neko/index.html` (check for HTTP 200). JavaScript is bundled for the single HTML/GitHub Pages entry: add new JS files to `scripts/script-manifest.json` **by hand**, then run `node scripts/build-manifest.js` (fail-loud: it reports unlisted files, never auto-adds). SCSS compiles with `npx sass css/style.scss css/style.css --no-source-map`.

## Driving it

Playwright works. Install it in the session scratchpad (never the repo): `npm init -y && npm i playwright`. Chromium binaries already exist in `%LOCALAPPDATA%/ms-playwright`.

Gotchas that cost time:

- `MyteCore` is a top-level class in a classic script — it is **not** `window.MyteCore`. In `page.evaluate`/`waitForFunction` use `typeof MyteCore !== 'undefined' && MyteCore.instance`.
- Boot wait: `MyteCore.instance.containers.values().next().value` must exist with `.mytes.length > 0` and `.ui` (~10–20 s, use 60 s timeout).
- **A cold profile boots with the myte docked and AI idle** (`isActive: false`, empty queue). Nothing simulation-driven happens until you activate it: `container.setActiveMyte(container.mytes[0])` — the equivalent of clicking the myte in the roster.
- The loading modal stays visible indefinitely in headless (a loading stage never reaches 100%, pre-existing) but the game runs fine behind it and clicks on UI chrome still work.
- Map objects resolve by id via `gameMap.getObjectById(id)` (keys are `String(id)` internally — raw `objectsById.get(numericId)` misses).
- Camera position eases; to assert a pan happened read `camera.targetX/targetY`, not `posX/posY`.
- Game events go through one bus: `MyteCore.instance.eventManager` (same instance as `container.eventManager` / `gameMap.eventManager`). Emitting synthetic events from `page.evaluate` is a legitimate way to drive consumers (toasts, log).

## Flows worth driving

- AI life: activate a myte, watch 20–30 s, count `myte:action_completed` via a listener.
- UI panels: toolbar buttons `#settings-toggle #sound-toggle #view-toggle #log-toggle #debug-toggle` open ModalWindow panels.
- Persistence: `page.reload()` and re-check (user/roster and the game log restore from localStorage).
- Collect `page.on('console')` errors and `page.on('pageerror')` for every run; the app normally boots with zero console errors.
