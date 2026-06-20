# Online Lobby Start and Results Design

## Scope

Refine the existing ONLINE 2P lobby and results presentation without changing room ownership, gameplay synchronization, countdown duration, or the native 634x436 cabinet.

## Lobby Layout

- Remove the persistent top status text area.
- Enlarge the three room status cells: room code, player count, and ready state.
- Show a compact message row below the status cells only for errors and one-shot confirmations such as copied room codes.
- Keep the two player identity cards and shared room settings.
- Replace the mode and difficulty radio groups with dropdowns.
- Default new online rooms to Normal difficulty. Existing room metadata remains authoritative after joining.

## Lobby Actions

- Before a guest joins, the host action row is `COPY CODE | READY | BACK`.
- After a guest joins, both clients show `READY | START | BACK`; COPY CODE is hidden.
- Each player controls only their own READY action.
- START is always disabled for the guest.
- START is disabled for the host until both players are connected and ready, then becomes highlighted and enabled.
- Both players becoming ready does not automatically start the round.
- Pressing enabled START asks the existing host session to begin the synchronized five-second countdown.
- Any player becoming unready or leaving disables START again.

## Online State Flow

The lobby remains the single pre-game phase. Readiness and explicit host intent are separate:

1. Players join and choose readiness.
2. Both ready enables the host START button.
3. Host presses START.
4. Firebase room metadata transitions to countdown using the existing countdown timestamp and round seed flow.

The automatic `lobby + bothReady -> countdown` transition is removed. Countdown, playing, results, and rematch transitions otherwise remain unchanged.

## Results Presentation

Keep the Windows 95-style dialog shell but replace the newline text block with structured elements:

- Prominent result title using the existing win, lose, draw, or game-over wording.
- A score section showing both player floors for Split Race, or the shared floor for Co-op.
- A clearly separated room placement row.
- A Best 5 row with loading, ranked, or not-ranked state.
- A muted footer showing the automatic return-to-room countdown.

Use restrained cabinet-compatible colors: pale yellow for the main result, pale green for a successful placement or Best 5 rank, and gray for secondary information. Results remain readable in Japanese, Traditional Chinese, and English without locale-specific layouts.

## Testing

- Unit-test that both-ready no longer returns `begin-countdown` automatically.
- Test host START visibility, enabled state, guest-disabled state, COPY CODE switching, and readiness reset behavior.
- Test dropdown synchronization and Normal defaults.
- Browser-test the enlarged header, transient message row, compact lobby layout, and three locales.
- Browser-test structured Co-op and Split Race results for containment, colors, labels, and countdown.
- Run build, unit tests, browser QA, cross-browser QA, and Firebase two-client smoke tests.
