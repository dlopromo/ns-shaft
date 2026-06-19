# NS-SHAFT Browser Reconstruction

A faithful browser reconstruction and research project for NS-SHAFT Windows 1.3J. The Windows 1.3J release is the main reference for visuals, audio, and rules. The project also references the mature game-loop model from iPel/NS-SHAFT and implements the remake with TypeScript, HTML5 Canvas, Web Audio/MIDI, and deterministic simulation.

## Status

The current build is playable in desktop browsers at the original `634x436` logical size, with integer nearest-neighbor scaling. Major visible and interactive elements now use original assets:

- Original title, copyright, frame, background, walls, spikes, HUD, digits, and record glyphs
- Local 1P and 2P modes
- Online 2P with four-digit room codes, lockstep co-op, and a Split Race that shows the opponent's live game
- Normal, conveyor, rotating/disappearing, spring, spike, and ceiling hazards
- 12-state LIFE, floor counter, sidebar difficulty, and RECORD display
- Original WAVE effect mapping and MIDI BGM playback
- `localStorage` settings, saved 1P/2P names, leaderboard cache, and failed-submission queue
- Firebase global Best 5 for 1P, 2P, Co-op, and Race across all three difficulties
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
- Online 2P: select `協力プレイ` or `対戦プレイ`; creating a room copies its four-digit code, then both players press Ready for a five-second countdown
- `Esc`: pause / resume
- `F`: fullscreen

The goal is to avoid the ceiling spikes and dangerous platforms while descending as far as possible.

## Online 2P Setup

Online mode uses Firebase Realtime Database as a lightweight sync layer. Do not paste Firebase API keys or config values into chat, and do not commit them to the repository. Create a local `.env.local` instead:

```bash
cp .env.example .env.local
```

Then fill in your Firebase web app config:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

Enable **Authentication > Anonymous** in Firebase Console. All database data lives
under `/ns-shaft`; the old `/rooms` root is intentionally closed. Deploy the tested rules with:

```bash
npx firebase login
npx firebase deploy --only database --project YOUR_PROJECT_ID
```

Two WAN room modes are available:

- `Co-op 2P`: both players interact in one shared game using fixed-delay lockstep input. A defeated player keeps falling out of view while the survivor continues; Game Over starts only after both players are defeated.
- `Split Race`: your original-size `634x436` cabinet is paired with the opponent's exact 50% `317x218` cabinet on the right. Each player sees themselves as the yellow 1P character and the opponent as the green 2P character. Both use the same seed, difficulty, and mechanisms while running independent responsive 1P simulations. Snapshots are exchanged about every `100ms`, with a `100ms` interpolation buffer for remote motion.

After both players are Ready, the host uses Firebase server time for a synchronized `5, 4, 3, 2, 1, GO`. Co-op ends after both players die; in Split Race the first finisher watches the opponent until both finish. Results remain visible for five seconds, then both modes return to the same room with settings preserved and Ready reset. Abort is reserved for leaving the room.

Either player can pause. Simulation, input, snapshots, and BGM stop together; after both players mark resume-ready, a server-time three-second countdown resumes the round. Split Race keeps the last remote image during packet gaps and shows a disconnect dialog after five seconds, which disappears automatically on recovery.

P1/P2 lobby rows use gray, yellow, and green for waiting, connected, and ready. Room creation attempts to copy the code automatically; if clipboard permission is denied, `Copy Code` retries and the selected code remains available for manual copying.

Best 5 displays Firebase global records only. Natural Game Over submits a score; abort, room leave, and disconnect do not. Failed submissions retain a stable UUID in `localStorage` and retry later.

With the local app running at `http://127.0.0.1:5175`, `npm run test:firebase`
opens two isolated browser contexts and exercises room creation, clipboard copy,
joining, Ready, countdown, synchronized pause/resume, live synchronization, results, same-room rematches,
and cleanup in both modes. This test
briefly creates real Firebase rooms.
Use `npm run test:firebase-rules` for the local rules-emulator suite.
Use `npm run test:firebase-browser` to exercise Anonymous Auth, the deployed rules
shape, and both two-client room modes entirely against local emulators.

## Project Layout

```text
src/
  game/          Game logic, rendering, audio, input, save data, and layout
  game/online/   Firebase rooms, four-digit codes, and deterministic lockstep
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
- [src/game/online/](./src/game/online/): Online 2P room/session/lockstep/controller code
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
npm run test:firebase-rules
npm run test:firebase-browser
```
