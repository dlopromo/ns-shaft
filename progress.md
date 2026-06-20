Original prompt: Reverse engineer the supplied NS-SHAFT 1.3J Macintosh and Windows packages and build a faithful browser remake using TypeScript, Canvas, deterministic simulation, audio, local save data, tests, and research documentation.

Latest: ONLINE 2P lobby now uses one three-locale layout: three-cell room header, native radio groups for mode/difficulty, a 2x2 mechanism grid, no duplicated in-room room-code/status rows, and full-frame start/resume countdown overlays.
Latest polish: room-rule and outer labels now share an 11px/13px rhythm, radio/checkbox controls are vertically centered, player status no longer steals HOST/GUEST label width, and lobby row spacing is compact.
Latest online flow: lobby mode/difficulty use compact dropdowns, online difficulty defaults to Normal, COPY is replaced by a host-only START after the guest joins, and both Ready states wait for an explicit host start. The three room status cells are larger, transient messages no longer reserve space, and results use structured score/place/Best 5/countdown rows.

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
- Added title, options, records, about and local two-player flows.
- Browser QA now verifies natural Game Over without the retired local name-entry flow
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
- Restored the original two-player HUD composition with separate `2P LIFE` and
  `1P LIFE` labels, independent life bars and a shorter centered floor counter
  so the right-side player health no longer overlaps the score text.
- Shifted the two-player floor counter to start after the left life bar and
  added browser pixel checks for both the left health gap and right `1P` gap.
- Aligned the visible `1P/2P` label baselines with `LIFE` and moved the sidebar
  record digits down to match the fixed `地下` / `階` text in the frame bitmap.
- Aligned the two-player left life bar to the `2P LIFE` text start instead of
  the single-player bar position.
- Re-centered the two-player top HUD around the playfield: left/right life bars
  are now symmetric to the game frame and the floor counter sits between them.
- Moved floor suffix sprites two pixels right to stop overlapping the final
  large digit, and top-aligned sidebar record digits for consistent rows.
- Re-cut the `階` floor suffix from bitmap x=200..236, preserving the left
  stroke while excluding neighboring packed pixels that appeared as a dot
  beside the ones digit.
- Added an opaque black backing behind the full floor counter so frame texture
  specks cannot show through as stray dots around the ones digit or suffix.
- Tightened platform generation near side walls and between rows: wall-adjacent
  gaps now either fit the 26px player collision box or snap closed, and every
  newly generated row is anchored to the nearest previous row so the player is
  guaranteed a reachable platform within three rows.
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
  Touching it keeps collision for 150ms before dropping the player; the
  following 240ms roll then restores the first frame and collision.
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
  audited `地` and `下` source rectangles, `階` uses the `x=200..236` crop to
  keep its left stroke without neighboring packed pixels, and all HUD glyphs
  now draw from the transparent native sheet so large digit black backgrounds
  cannot cut adjacent Japanese glyph edges.
- Added an explicit inner playable area matching the blue side walls. Player
  collision clamps and platform generation now stay inside the 16..404 native
  x-range instead of using the full 0..420 visual playfield that includes wall
  sprites.
- Added an options-panel sound preview list for all nine extracted WAVE effects.
  Each row shows the current event mapping, source resource id and approximate
  duration so the original sounds can be auditioned before remapping events.
- Remapped the first audio pass from user listening notes: land stays on
  `wave-107`; hurt uses `wave-110`; spring uses `wave-109`; rotate uses
  `wave-111`; ceiling also uses the hurt sound `wave-110`; death uses
  `wave-113`; pause uses `wave-114`; and the new abort event uses `wave-115`.
  Heal remains `wave-108`; conveyor now uses the same `wave-107` as land.
- Drew walls and ceiling before players so characters are always visible above
  gameplay blockers, changed the unloaded background fallback from black to
  blue, and moved the ceiling spike strip into the transparent native sprite
  sheet so the top spikes do not carry a black background.
- Restored the previous spring launch timing and strength. Each launch now
  freezes the source spring and every platform above it into an ignored ID set;
  the next lower platform remains landable even after screen scrolling moves it
  above the spring's former screen position.
- Added the first Online 2P implementation: Firebase Realtime Database rooms,
  anonymous four-digit numeric room codes, local `.env.local` configuration,
  host/guest ready flow, deterministic two-player lockstep input buffering and
  browser QA coverage for missing Firebase configuration.
- Added Online Split Race as the second WAN mode. Both players run independent
  responsive one-player simulations with the same seed and settings, while two
  native 634x436 canvases show local and opponent gameplay side by side.
  Renderer-safe snapshots update about every 100ms, stale opponents show a
  waiting overlay, pause/game-over transitions publish once, and only local
  game events produce audio.
- Improved Online room flow with automatic room-code clipboard copy, a manual
  fallback, locked room settings, colored P1/P2 connection states and explicit
  Ready feedback. Co-op defeated players now fall out of view while survivors
  continue, and Split Race renders remote motion through a bounded 100ms
  interpolation buffer while keeping authoritative results unchanged.
- Added a real Firebase two-context smoke test. It verifies numeric room codes,
  clipboard copy, host/guest lobby state, both Ready actions, Co-op lockstep,
  Split Race remote snapshots and automatic test-room deletion.
- Separated Co-op input sequence and simulation sequence so a late packet is
  retried instead of permanently skipping its tick; asymmetric-delay coverage
  now proves both clients converge on the same deterministic state.
- Reduced the title dialog to 300px high and moved the native 288x140 title art
  clear of the first menu row without scaling the source image.
- Preserved the original 634x436 cabinet identity in Split Race: the local
  machine remains native size and the opponent is an exact 317x218 half-size
  machine, vertically centered. The remote renderer uses the original green 2P
  sprites while each local player remains the yellow 1P character.
- Added a server-time synchronized five-second Online countdown, a three-second
  results phase, and automatic same-room rematches with settings preserved and
  both Ready flags reset. Co-op resolves after both deaths; Split Race lets the
  first finisher watch until the opponent also finishes.
- Made ONLINE 2P span both title-menu columns and extended browser/Firebase QA
  through countdown freeze, live play, result display and round-two Ready flow.
- Added centralized Online Pause for Co-op and Split Race. Either player may
  pause; both must mark resume-ready before a server-time three-second countdown.
  Simulation, input, snapshots and MIDI BGM remain suspended throughout.
- Replaced Online Canvas overlays with solid Windows-style Japanese HTML dialogs,
  added five-second Split Race disconnect handling, and retained the last remote
  snapshot until communication recovers or the player leaves.
- Added Firebase global Best 5 for solo, local 2P, Co-op and Race under the
  `/ns-shaft` namespace. Submissions are append-only, use stable UUID retry
  records in localStorage, and only occur after natural Game Over.
- Added saved uppercase 8-character player names, Anonymous Auth, namespaced
  database rules, a rules-emulator suite, and audible MIDI gain/browser probes.
- Added an Auth + Realtime Database emulator browser suite covering real
  two-client Co-op and Split Race rooms. Fixed Firebase's omission of null
  `pause.resumeAt` fields at the snapshot boundary, then verified both modes
  against the published production rules through countdown, synchronized
  pause/resume, results and same-room rematch.
- Rebuilt Online Co-op transport around deterministic three-frame input
  batches with measured 6-15 tick buffering, retained-packet resend, bounded
  Firebase cleanup, same-tick state hashes and host checkpoints. Both WAN
  players now use their own arrow keys while Local 2P keeps its original
  Arrow/Z-X controls.
- Bound every Online transport subscription to the authoritative room mode,
  round and exact opponent. Split Race no longer substitutes the local state
  before the opponent arrives and now smooths remote motion with an adaptive
  100-250ms jitter buffer.
- Added non-destructive presence, a 60-second reconnect slot, automatic reload
  resume and explicit onDisconnect cancellation on normal leave. Short Co-op
  stalls display a communication state and resume when the missing batch
  arrives instead of permanently freezing the simulation.
- Extended the production Firebase two-context smoke test through post-join
  mode switching, simultaneous arrow-key movement, same-tick hash agreement,
  in-game guest reload recovery and bidirectional Split Race position checks.
- Replaced single-signal disconnect checks with one Online connection monitor.
  Five seconds without opponent traffic now shows only a non-blocking
  `通信中...` indicator; the blocking disconnect dialog requires both stale
  traffic and continuously false presence for 15 seconds. Co-op input/status
  packets, guest checkpoints and Race snapshots all restore health
  immediately, while lobby, countdown, pause and results suppress warnings.
- Timed every spring launch from the individual player's landing. Each player
  now keeps an independent 100ms launch schedule even after walking off, while
  the spring completes its 100ms rebound animation.
- Rotating floors now hold for 100ms and complete their six-frame turn in
  250ms before restoring collision. Relative swept landing chooses the first
  crossed platform, including at Fast Mode speed.
- Added asymmetric conveyor control (0.35px/ms with the belt, 0.15px/ms
  against it) and prevent any exact platform variant from generating three
  rows in succession without changing difficulty weights.
- Spring descent now ignores the source spring plus all blocks above it at the
  instant of launch. Blocks below at launch remain landable throughout scroll,
  and landing clears the frozen ID set.
- The source spring is ignored only while the player rises. On descent it can
  catch the player again, start a fresh 100ms compression, and repeat without
  weakening the frozen ignore rule for other blocks above the launch point.
- Online Pause derives required Ready players from current Co-op or Race alive
  state. Eliminated players display Game Over and no longer block resume.
- Added one-second Split Race heartbeat snapshots and only count accepted
  current-round opponent sequences as connection activity, preventing a
  finished or motionless player from causing a false long-term sync warning.
- Added saved Japanese, Traditional Chinese and English HTML UI locales while
  preserving all original bitmap text and native asset dimensions.
- Moved locale selection onto the title menu for immediate switching. New
  saves detect the first supported browser language and otherwise fall back to
  Japanese; an existing saved locale remains authoritative.
- Reflowed the native title menu into a 360x330 Windows panel with its original
  288x140 art unchanged and a 120x22 language selector in the top-right tool
  row. The six menu buttons remain aligned below it at native 634x436 size.
- Moved the ten-sound preview list into its own Windows-style dialog so the
  Options panel remains fully visible at the native 634x436 cabinet size.
- Expanded Online Co-op and Split Race results with a server-time five-second
  return countdown, room placement/shared result, and the current submission's
  global Best 5 rank identified by its Firebase submission ID.
- Rebuilt BEST 5 as a fixed five-row grid with separate rank, eight-character
  player name and floor columns. Co-op/local 2P names use a stable two-line
  cell, and the panel stays centered over the original left playfield.
- Added host-authoritative Online room settings for difficulty, speed,
  conveyor, spring and rotating floors. Guests see the synchronized values,
  either player's Ready state locks editing, and online rounds now use room
  meta exclusively while the external Options panel is explicitly local-only.

## Remaining

- Measure provisional physics constants in original-system emulation.
- Compare provisional animation timing against original-system frame capture.
- Re-check spring and rotating timing against original video after the current
  `100ms spring / 100ms + 250ms rotating` playability adjustment.
