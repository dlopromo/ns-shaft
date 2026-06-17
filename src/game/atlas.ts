export interface SpriteDefinition {
  source: "main" | "native";
  x: number;
  y: number;
  width: number;
  height: number;
  anchor: { x: number; y: number };
  collision: { x: number; y: number; width: number; height: number };
  mirrorX: boolean;
  usage?: "stand" | "walk" | "fall" | "hurt" | "dead" | "platform" | "ui";
}

const character = (x: number, y: number, usage: SpriteDefinition["usage"], mirrorX = false): SpriteDefinition => ({
  source: "native",
  x,
  y,
  width: 32,
  height: 32,
  anchor: { x: 16, y: 32 },
  collision: { x: 3, y: 6, width: 26, height: 26 },
  mirrorX,
  usage
});

const sprite = (
  x: number, y: number, width: number, height: number,
  usage: SpriteDefinition["usage"] = "platform"
): SpriteDefinition => ({
  source: "main", x, y, width, height,
  anchor: { x: 0, y: height },
  collision: { x: 0, y: 0, width, height },
  mirrorX: false,
  usage
});

const ui = (
  x: number, y: number, width: number, height: number
): SpriteDefinition => ({
  source: "native", x, y, width, height,
  anchor: { x: 0, y: height },
  collision: { x: 0, y: 0, width, height },
  mirrorX: false,
  usage: "ui"
});

const object = (
  x: number, y: number, width: number, height: number
): SpriteDefinition => ({
  source: "native", x, y, width, height,
  anchor: { x: 0, y: height },
  collision: { x: 0, y: 0, width, height },
  mirrorX: false,
  usage: "platform"
});

export const SPRITE_ATLAS = {
  image: `${import.meta.env.BASE_URL}assets/web/rt_bitmap-101-1041.png`,
  nativeImage: `${import.meta.env.BASE_URL}assets/web/sprites-native.png`,
  players: {
    yellow: Array.from({ length: 20 }, (_, index) =>
      character(
        (index % 4) * 32,
        Math.floor(index / 4) * 32,
        index < 4 ? "walk" : index < 16 ? "fall" : "dead",
        index >= 4 && index <= 7
      )
    ),
    green: Array.from({ length: 20 }, (_, index) =>
      character(
        (index % 4) * 32,
        160 + Math.floor(index / 4) * 32,
        index < 4 ? "walk" : index < 16 ? "fall" : "dead",
        index >= 4 && index <= 7
      )
    )
  },
  hurtPlayers: {
    yellow: Array.from({ length: 20 }, (_, index) =>
      character(128 + (index % 4) * 32, Math.floor(index / 4) * 32, "hurt",
        index >= 4 && index <= 7)
    ),
    green: Array.from({ length: 20 }, (_, index) =>
      character(128 + (index % 4) * 32, 160 + Math.floor(index / 4) * 32, "hurt",
        index >= 4 && index <= 7)
    )
  },
  playerAnimations: {
    walk: [0, 1, 2, 3],
    jump: [4, 5, 6, 7],
    side: [8, 9, 10, 11],
    stand: [12],
    dead: [16, 17, 18, 19]
  },
  platforms: {
    normal: object(288, 0, 96, 16),
    conveyor: object(288, 16, 96, 16),
    spring: object(384, 208, 96, 23),
    rotating: object(288, 154, 96, 16),
    spike: object(384, 368, 96, 32)
  },
  platformAnimations: {
    normal: [object(288, 0, 96, 16)],
    rotating: [
      object(288, 154, 96, 16), object(288, 184, 96, 29),
      object(288, 216, 96, 36), object(288, 254, 96, 32),
      object(288, 289, 96, 35), object(288, 327, 96, 30)
    ],
    conveyorRight: Array.from({ length: 4 }, (_, index) =>
      object(288, 16 + index * 16, 96, 16)
    ),
    conveyorLeft: Array.from({ length: 4 }, (_, index) =>
      object(288, 80 + index * 16, 96, 16)
    ),
    spring: [
      object(384, 208, 96, 23), object(384, 232, 96, 21),
      object(384, 256, 96, 20), object(384, 280, 96, 18),
      object(384, 304, 96, 16), object(384, 328, 96, 14),
      object(384, 352, 96, 12)
    ],
    spike: [object(384, 368, 96, 32)]
  },
  wall: sprite(512, 0, 16, 32),
  ceiling: object(0, 368, 384, 16),
  pause: ui(0, 320, 128, 40),
  floorPrefix: ui(128, 320, 72, 32),
  floorPrefixParts: [
    ui(128, 320, 36, 32),
    ui(166, 320, 34, 32)
  ],
  floorSuffix: ui(200, 320, 36, 32),
  onePlayerLabel: ui(238, 320, 34, 16),
  twoPlayerLabel: ui(234, 336, 38, 16),
  lifeLabel: ui(224, 352, 48, 16),
  lifeBars: Array.from({ length: 12 }, (_, index) =>
    ui(384, index * 16, 96, 16)
  ),
  gameOver: ui(128, 352, 96, 16),
  digits: Array.from({ length: 10 }, (_, index) =>
    ui(480, index * 32, 32, 32)
  ),
  difficultyLabels: [
    ui(40, 385, 58, 13),
    ui(155, 385, 43, 13),
    ui(224, 385, 74, 13)
  ],
  smallDigits: [
    ui(272, 224, 16, 13),
    ui(272, 237, 16, 14),
    ui(272, 252, 16, 13),
    ui(272, 266, 16, 14),
    ui(272, 280, 16, 13),
    ui(272, 294, 16, 14),
    ui(272, 308, 16, 14),
    ui(272, 322, 16, 13),
    ui(272, 336, 16, 14),
    ui(272, 350, 16, 14)
  ]
};
