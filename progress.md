Original prompt: Reverse engineer the supplied NS-SHAFT 1.3J Macintosh and Windows packages and build a faithful browser remake using TypeScript, Canvas, deterministic simulation, audio, local save data, tests, and research documentation.

## Progress

- Confirmed Windows 1.3J is a 1997 PE32 i386 Win32/GDI program.
- Decoded the Macintosh BinHex wrapper to a StuffIt archive.
- Decoded the Japanese Shift-JIS readme and recorded authoritative gameplay rules.
- Added the initial failing simulation and save-data tests.
- Implemented deterministic simulation, three difficulties, special platforms,
  one/two-player rules, persistence, Canvas renderer, title flow and QA hooks.
- Extracted 33 Windows resources, including six bitmaps and nine WAVE resources.
- Added source inventory, Shift-JIS decoding, PE resource extraction and Mac
  BinHex/StuffIt unpacking tools.
- Integrated the original 1.3J title bitmap and shaft texture.
- Browser QA verified right movement, pause/resume, text-state output and zero
  console errors. Screenshots are generated under `artifacts/qa/`.
- Replaced the incorrect auto-bounce model with stand, walk-off and spring-only
  launch behavior, cross-checked against the Apache-2.0 iPel implementation.
- Connected all nine original WAVE resources to simulation events and parse the
  supplied MIDI for Web Audio playback.
- Replaced temporary Canvas art with the original sprite atlas and converted
  paletted BMP resources losslessly to browser-stable PNG files.
- Added title, options, records, about, name-entry and local two-player flows.
- Browser QA now requires a complete Game Over -> name entry -> Best 5 record
  round trip before testing two-player mode.
- Rebuilt player sprites into a transparent 26x26 atlas with explicit foot
  anchors and collision boxes; left-facing animation now mirrors the same frame.
- Standardized player coordinates as foot-center and platform `y` as the top
  surface, so standing frames align without per-sprite scaling.
- Seeded the initial 288x400 playfield with reachable platform rows and retained
  continuous bottom-up generation with guaranteed early special platforms.
- Kept the logical canvas and original assets at native 634x436 size; fullscreen
  presentation calculates a whole-number nearest-neighbor scale.
- Re-segmented bitmap 101 after visual inspection: each character color now has
  32 separate 32x20 frames rather than eight incorrectly joined 32x40 cells.
- Bitmap 103 now supplies the original monochrome alpha mask for every character
  frame, eliminating black backgrounds and duplicated lower-body frames.
- Added native variable-size platform sequences: conveyor 10x96x16,
  disappearing heights 10/29/36/32/35/30, spring heights
  23/21/20/18/16/14/12 and spike 1x96x32.
- Separated all eight four-frame character poses and render stand, walk, jump,
  fall, hurt and death without hiding dead players.
- Restored the complete 634x436 resource-106 frame behind title, options,
  records and gameplay; fixed cached-image load redraw ordering.
- Added clickable original-frame pause/abort regions, auto-pause on focus loss,
  immediate fast/music/sound settings, robust partial-save migration and
  graceful unavailable-audio fallback.
- Added a deterministic five-minute generation test and native-size browser
  screenshots. Chromium, Firefox and WebKit all pass at 634x436 with no console
  errors; each full QA run is archived under `artifacts/qa/runs/`.
- Corrected the character-sheet root cause after enlarged grid inspection:
  bitmap 101 contains 16 complete 32x40 frames per color, not 32 32x20
  half-frames. Rebuilt the masked 512x80 atlas and generated numbered yellow
  and green contact sheets under `artifacts/sprite-analysis/`.
- Audited every remaining packed object and UI crop with enlarged contact sheets.
  Corrected the conveyor animation from an invalid ten-frame range (which
  included a blue floor and part of a normal floor) to the eight original
  frames at bitmap-101 y=16..128. Normal, disappearing, spring, spike, ceiling,
  pause, game-over, labels and all ten digits show no split-frame defects.
- Replaced the rearranged character/object atlases with a transparent 544x400
  native-coordinate sprite sheet. Re-verified the character grid as four
  20-frame groups of native 32x32 sprites: yellow, yellow hurt/red, green and
  green hurt/red. Rendering now uses identical 32x32 source and destination
  sizes, and browser QA captures the red hurt state.
- Corrected platform behavior mapping: blue is the normal healing floor; the
  eight grey rail frames are the moving conveyor; the six variable-height
  stone frames are the rotating/disappearing floor. Conveyor movement is now
  derived only from the platform currently under the player, so it cannot leak
  into rotating floors. Spikes deal 5 health, every non-spike landing restores
  1 health, and idle standing uses one fixed front-facing frame.
- Split the eight grey conveyor sprites into their two original four-frame
  arrow sequences. Right uses bitmap-101 y=16/32/48/64; left uses
  y=80/96/112/128. The renderer no longer mirrors or reverses one shared
  sequence. Browser QA confirms x=120 becomes 130 on right and 110 on left.
- Implemented the full seven-frame spring interaction: frames 0 through 6
  compress over 200ms while the player remains attached, frame 6 launches the
  player, then frames 5 through 0 rebound over 100ms. QA captures both the
  compressed and rebound states.
- Corrected the rotating floor to use only its six grey source images. The
  seventh animation step returns to the first grey image; the blue normal
  floor is not part of this sequence. Its first crop is the complete original
  96x16 image at y=154, rather than the truncated 96x10 crop at y=160.
  Touching it keeps collision for 200ms before dropping the player; the
  following 300ms roll then restores the first frame and collision.
- Added renderer timing, collision-state and browser QA coverage for the
  rotating floor's drop, final frame and reset states. Native-size screenshots
  are `05d`, `05dd` and `05de` under `artifacts/qa/current/`.
- Standing movement now sets an explicit walking pose. The four original walk
  frames animate for both directions. The source sequence faces left, so right
  movement is rendered as its horizontal mirror.
- Audited the complete 1.2J gameplay recording and the supplied 1.3J screenshot.
  Restored the full native rock-texture playfield, both 16px side walls and the
  complete 384x16 ceiling-spike strip instead of the previous cropped 288x8 row.
- Replaced the hand-drawn/scaled HUD with bitmap-101 assets at measured native
  positions: 12 LIFE states, unscaled four-digit floor count, difficulty label
  and variable-height small record digits. The sidebar now tracks the selected
  difficulty's saved record rather than the current run's floor.
- Added browser pixel audits for the texture, left/right walls and full ceiling
  spikes alongside the existing interaction and native-size screenshots.
- Corrected the final HUD alignment against the 1.3J reference canvas and the
  YouTube gameplay capture: LIFE now has 12 states, the top `階` suffix is
  shifted clear of the fourth large digit, hard difficulty no longer includes
  a stray `う` from the neighboring packed label, and browser QA now guards the
  suffix gap plus difficulty-label stray pixels.
- Reworked the floor HUD text after boundary review: `地下` is split into
  audited `地` and `下` source rectangles, `階` uses the exact `x=196..236`
  crop before the neighboring magenta `1P` pixels, and all HUD glyphs now draw
  from the transparent native sheet so large digit black backgrounds cannot cut
  adjacent Japanese glyph edges.
- Added an explicit inner playable area matching the blue side walls. Player
  collision clamps and platform generation now stay inside the 16..404 native
  x-range instead of using the full 0..420 visual playfield that includes wall
  sprites.

## Remaining

- Measure provisional physics constants in original-system emulation.
- Compare provisional animation timing against original-system frame capture.
