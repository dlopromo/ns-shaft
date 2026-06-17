# NS-SHAFT Browser Reconstruction

A faithful browser reconstruction and research project for NS-SHAFT Windows 1.3J. The Windows 1.3J release is the main reference for visuals, audio, and rules. The project also references the mature game-loop model from iPel/NS-SHAFT and implements the remake with TypeScript, HTML5 Canvas, Web Audio/MIDI, and deterministic simulation.

## Status

The current build is playable in desktop browsers at the original `634x436` logical size, with integer nearest-neighbor scaling. Major visible and interactive elements now use original assets:

- Original title, copyright, frame, background, walls, spikes, HUD, digits, and record glyphs
- Local 1P and 2P modes
- Normal, conveyor, rotating/disappearing, spring, spike, and ceiling hazards
- 12-state LIFE, floor counter, sidebar difficulty, and RECORD display
- Original WAVE effect mapping and MIDI BGM playback
- `localStorage` settings, Best 5 records, and name entry
- Browser QA screenshots, pixel audits, and deterministic test hooks

Ongoing research and remaining work are tracked in [progress.md](./progress.md).

## Quick Start

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

Common commands:

```bash
npm test -- --run
npm run build
npm run test:browser
npm run test:cross-browser
```

Asset and research commands:

```bash
npm run assets:web
npm run assets:native
npm run research
```

## Controls

- 1P: left and right arrow keys
- 2P: 1P uses arrow keys, 2P uses `Z` / `X`
- `Esc`: pause / resume
- `F`: fullscreen

The goal is to avoid the ceiling spikes and dangerous platforms while descending as far as possible.

## Project Layout

```text
src/
  game/          Game logic, rendering, audio, input, save data, and layout
tests/           Vitest unit tests and Playwright/browser QA scripts
tools/           Resource extraction, conversion, analysis, and sprite generation
public/assets/   Extracted resources, browser-ready assets, and BGM
docs/            Research notes
artifacts/       Analysis output, QA screenshots, and local generated artifacts
```

Key files:

- [src/game/simulation.ts](./src/game/simulation.ts): deterministic simulation, platform generation, collision, and life rules
- [src/game/renderer.ts](./src/game/renderer.ts): native-size Canvas renderer and HUD
- [src/game/atlas.ts](./src/game/atlas.ts): original sprite source rectangles, anchors, and collision data
- [src/game/layout.ts](./src/game/layout.ts): coordinate layout inside the 634x436 original frame
- [tests/browser-qa.mjs](./tests/browser-qa.mjs): browser flow, pixel audit, and screenshot coverage

## Platform Generation Rules

Platform generation follows an iPel-style fixed-row model: one platform per row, with new rows filled from the bottom. Current safety rules include:

- Platforms stay inside the blue playable area and never spawn beyond the side walls.
- If a wall-side gap is smaller than the `26px` player collision width, it snaps closed.
- If snapping closed would break reachability, the gap is kept exactly wide enough for the player.
- Each newly generated row is anchored to the nearest previous row, guaranteeing that a directly reachable platform exists within three rows.

## Test Strategy

The project uses three layers of verification:

- Vitest: simulation, storage, audio, atlas, layout, and animation timing
- Browser QA: real Chromium canvas flows, native-size screenshots, and pixel audits
- Cross-browser QA: baseline Chromium, Firefox, and WebKit flows

Recommended full verification:

```bash
npm test -- --run
npm run build
npm run test:browser
npm run test:cross-browser
```