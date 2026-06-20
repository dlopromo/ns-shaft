# Game Boy Style Mobile Playability

## Goal

Add a responsive mobile shell without changing the 634x436 game simulation,
desktop layout, InputFrame, save data, or Firebase protocol.

## Implemented Design

- Coarse-pointer screens up to 1024px use the classic gray Game Boy shell.
- The original cabinet is scaled as one pixelated surface with its full frame visible.
- LEFT and RIGHT sit at opposite screen edges; PAUSE/RESUME/RETRY, ABORT, and
  FULLSCREEN occupy the center action group.
- Mobile supports Local 1P and Online; the Local 2P menu entry remains desktop-only.
- Options, Best 5, About, and Online lobby use scrollable full-viewport dialogs.
- Split Race places the opponent preview below the local game in portrait and in
  the right control rail in landscape.

## Verification

- Vitest covers touch merging, simultaneous pointers, pause latching, mobile scale,
  orientation, and primary-action state mapping.
- `test:mobile` covers 360x640, 390x844, and 844x390 layouts, Local 1P actions,
  full-page dialogs, Split Race geometry, and browser console errors.
- Desktop browser and cross-browser suites remain the regression gate.
