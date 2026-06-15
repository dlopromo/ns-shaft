export const GAME_LAYOUT = {
  frame: { width: 634, height: 436 },
  scale: 1,
  playfield: { x: 22, y: 62, width: 420, height: 356 },
  hud: {
    lifeLabel: { x: 71, y: 12 },
    lifeBar: { x: 46, y: 28 },
    floorPrefix: { x: 194, y: 12 },
    floorDigits: { x: 262, y: 12, step: 30 },
    floorSuffix: { x: 374, y: 12 }
  },
  sidebar: {
    x: 447,
    width: 181,
    difficulty: { x: 464, y: 94 },
    difficultyValue: { x: 506, y: 112 },
    record: { x: 464, y: 146 },
    recordDigits: { x: 541, baselineY: 174, step: 13 },
    pause: { x: 512, y: 306, width: 48, height: 46 },
    abort: { x: 512, y: 366, width: 48, height: 46 }
  }
} as const;

export function integerScaleForViewport(width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(
    width / GAME_LAYOUT.frame.width,
    height / GAME_LAYOUT.frame.height
  )));
}
