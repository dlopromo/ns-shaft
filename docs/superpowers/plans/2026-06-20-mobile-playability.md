# Game Boy Style Mobile Playability

## Goal

Add a responsive mobile shell without changing the 634x436 game simulation,
desktop layout, InputFrame, save data, or Firebase protocol.

## Implemented Design

- Coarse-pointer screens up to 1024px use a low-glare charcoal Game Boy shell.
- The original cabinet is scaled as one pixelated surface with its full frame visible.
- LEFT and RIGHT sit at opposite screen edges; PAUSE/RESUME/RETRY, ABORT, and
  FULLSCREEN occupy the center action group.
- Mobile supports Local 1P and Online; the Local 2P menu entry remains desktop-only.
- Options, Best 5, About, and Online lobby use scrollable full-viewport dialogs.
- Split Race places the opponent preview below the local game in portrait and in
  the right control rail in landscape.
- Local 1P, Co-op, and Split Race share one portrait control-row anchor. Non-race
  play reserves the same vertical space as the opponent preview.
- The Split Race preview preserves the native 634:436 ratio at 317x218, plus a
  separate 20px player header.
- Countdown and results overlays are centered against the full 634x436 local
  canvas instead of the Race pane header.

## Verification

- Vitest covers touch merging, simultaneous pointers, pause latching, mobile scale,
  orientation, and primary-action state mapping.
- `test:mobile` covers 360x640, 390x844, 430x932, and 844x390 layouts, Local 1P actions,
  full-page dialogs, Split Race geometry, and browser console errors.
- Desktop browser and cross-browser suites remain the regression gate.
