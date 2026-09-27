# Ashveil architecture

Ashveil is a single-player browser game with a deterministic simulation, a Canvas 2D renderer, and a DOM interface. It has no runtime JavaScript dependencies or backend.

## Simulation

`src/engine.js` owns combat, enemy behavior, pathfinding, collision, loot, equipment, leveling, and floor progression. `createGame({ seed })` creates an independent run; `updateGame(game, dt, input)` advances that state in seconds. The simulation has no DOM, timer, network, or storage dependencies.

Coordinates use continuous tile units. `map.tiles[y][x]` is `1` for traversable floor and `0` for masonry or void; tile centers are at `(x + 0.5, y + 0.5)`. Walking, dodging, attacks, and projectiles check traversability or line of sight. Breadth-first paths route mouse movement and enemy pursuit around walls. Equipment bonuses are recomputed from the equipped slots, never accumulated across equip operations.

A run is `playing`, `dead`, or `victory`. Pausing freezes simulation and rejects active abilities, while allowing equipment changes. Every hostile must die before a floor exit unlocks. Interacting near the final unlocked exit wins the run. Terminal states stop simulation until a new game is created.

## Rendering

`src/renderer.js` projects tile coordinates into an isometric view, sorts actors and structures by depth, and follows the player with a smoothed camera. `DungeonRenderer.render(game, dt)` reads game state without modifying it. `screenToWorld` reverses the camera projection for pointer input; `screen` projects world points for sprite hit testing.

Artwork is original procedural Canvas 2D geometry and cached stone textures. Effects, floating damage numbers, enemy attack telegraphs, lighting, and minimaps read the same simulation state. The canvas scales for device pixel ratio, capped at 2.

## Interface

`src/main.js` translates keyboard and pointer events into simulation commands, renders the HUD and dialogs, and drives a bounded animation loop. Keyboard movement follows screen directions. Pointer targets are recomputed when the camera moves; clicking a monster follows it until it dies or movement cancels pursuit. Dialogs and a hidden or unfocused window pause gameplay. Touch uses the same targeting and on-screen ability controls.

Only the best run record and sound preference persist in local storage. Current runs remain in memory. Audio is synthesized with the Web Audio API and starts muted. Google Fonts is an optional visual enhancement with local serif and sans-serif fallbacks.

A development inspection object, `window.__ASHVEIL__`, is exposed only on loopback hostnames for browser verification. It provides no network access or multiplayer authority.

## Verification

`npm test` runs the simulation through deterministic worlds, blocked paths, combat, equipment, death races, and a complete three-floor victory using ordinary gameplay commands. `npm run check` checks JavaScript syntax. `npm run build` validates entry assets and copies only the game to `dist/`.

The interface was also checked in Chromium at desktop and phone sizes: sprite targeting, skills, native keyboard activation, pause, inventory, potions, map, terminal screens, restart, and touch controls. Browser checks are separate from the Node simulation suite.
