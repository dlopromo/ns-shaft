# Online Lobby Start and Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit host START action after both players are ready, simplify the ONLINE 2P lobby, restore dropdown settings, and make online results readable.

**Architecture:** Keep the existing Firebase lobby/countdown phases and session methods. Remove the automatic lobby transition, expose button state through the existing lobby view model, and let the host START handler invoke the existing synchronized countdown. Render results into a small fixed DOM grid instead of a newline-delimited paragraph.

**Tech Stack:** TypeScript, Vite, Canvas UI overlay, Firebase Realtime Database, Vitest, Playwright.

---

### Task 1: Explicit Host Start State

**Files:**
- Modify: `src/game/online/round.ts`
- Modify: `src/game/online/lobby.ts`
- Test: `tests/online-round.test.ts`
- Test: `tests/online-ui.test.ts`

- [ ] **Step 1: Write failing tests**

Assert that `nextOnlineHostAction({ phase: "lobby", bothReady: true, ... })` returns `null`. Assert lobby actions show COPY only while player 2 is absent, show START after player 2 connects, enable START only for a host with both players ready, and always disable START for a guest.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run tests/online-round.test.ts tests/online-ui.test.ts`

Expected: failures showing the automatic `begin-countdown` action and missing START view state.

- [ ] **Step 3: Implement minimal state changes**

Remove the lobby auto-start return from `nextOnlineHostAction`. Extend `LobbyView.actions` with `showStart`; add `startButton: { enabled: boolean }`; calculate guest presence and both-ready once in `buildLobbyView`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm test -- --run tests/online-round.test.ts tests/online-ui.test.ts`

Expected: all focused tests pass.

### Task 2: Lobby DOM, Dropdowns, and Start Handler

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Modify: `src/game/i18n.ts`
- Test: `tests/layout.test.ts`
- Test: `tests/browser-qa.mjs`
- Test: `tests/firebase-smoke.mjs`

- [ ] **Step 1: Write failing layout and browser assertions**

Require a hidden transient message below the room header, three enlarged header cells, `select#online-room-mode`, `select#online-difficulty`, a START button, no radio controls, and the action visibility matrix from Task 1. Require Normal as the selected difficulty for a newly created room.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- --run tests/layout.test.ts && npm run test:browser`

Expected: failures for radio markup, missing START button, and current header sizing.

- [ ] **Step 3: Implement the lobby UI**

Move `#online-status` below `.online-room-header` and keep it hidden except for success/error messages. Replace mode/difficulty radios with two dropdowns. Add `#online-start`; render it for both clients after player 2 connects, enable/highlight it only for a both-ready host, and hide COPY at the same point.

- [ ] **Step 4: Implement explicit countdown start**

Extract the existing host countdown payload construction into `beginOnlineCountdown()`. Call it from `#online-start`; keep `driveOnlineRoundLifecycle()` responsible only for countdown-to-playing, playing-to-results, and results-to-lobby transitions.

- [ ] **Step 5: Enforce online defaults**

Create rooms with `difficulty: "normal"` and render room metadata as authoritative after creation/join. Keep local Options independent.

- [ ] **Step 6: Update Firebase smoke selectors and flow**

Use dropdown selection in the smoke test, assert both-ready remains in lobby, click host START, then assert both clients enter the existing five-second frozen countdown.

### Task 3: Structured Online Results

**Files:**
- Modify: `src/main.ts`
- Modify: `src/style.css`
- Test: `tests/browser-qa.mjs`

- [ ] **Step 1: Write failing browser assertions**

Require structured result elements for result title, score, room placement, Best 5 state, and return countdown. Assert the dialog is contained and each field has a distinct computed background/color role.

- [ ] **Step 2: Run browser QA and verify RED**

Run: `npm run test:browser`

Expected: failure because results are currently one newline-delimited paragraph.

- [ ] **Step 3: Add minimal result markup and rendering**

Add one hidden result grid inside `.online-state-dialog`. In the results branch, populate its four rows from the existing `OnlineResultViewModel`; hide the ordinary detail paragraph. Ensure all non-result calls restore the ordinary paragraph and hide the result grid.

- [ ] **Step 4: Add restrained Windows 95 styling**

Use inset borders, pale yellow for the primary score, pale green for placement/rank success, gray for countdown, tabular numbers, and fixed spacing. Keep the existing overlay shell and three-language text.

### Task 4: Full Verification

**Files:**
- Modify: `progress.md`

- [ ] **Step 1: Run complete verification**

Run:

```bash
npm test -- --run
npm run build
npm run test:browser
npm run test:cross-browser
```

Start Vite on port 5175, then run `npm run test:firebase`. Run `git diff --check` last.

- [ ] **Step 2: Inspect screenshots**

Open Japanese, Traditional Chinese, and English lobby screenshots plus Co-op and Split Race result screenshots. Confirm no clipping, START state is obvious, the header is larger, dropdowns align, and result rows are readable.

- [ ] **Step 3: Record completion**

Append the explicit-start flow, dropdown defaults, and structured-result verification to `progress.md`.
