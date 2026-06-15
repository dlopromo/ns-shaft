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

const character = (x: number, y: number, usage: SpriteDefinition["usage"]): SpriteDefinition => ({
  source: "native",
  x,
  y,
  width: 32,
  height: 32,
  anchor: { x: 16, y: 32 },
  collision: { x: 3, y: 6, width: 26, height: 26 },
  mirrorX: false,
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
  image: "/assets/web/rt_bitmap-101-1041.png",
  nativeImage: "/assets/web/sprites-native.png",
  players: {
    yellow: Array.from({ length: 20 }, (_, index) =>
      character(
        (index % 4) * 32,
        Math.floor(index / 4) * 32,
        index < 4 ? "walk" : index < 16 ? "fall" : "dead"
      )
    ),
    green: Array.from({ length: 20 }, (_, index) =>
      character(
        (index % 4) * 32,
        160 + Math.floor(index / 4) * 32,
        index < 4 ? "walk" : index < 16 ? "fall" : "dead"
      )
    )
  },
  hurtPlayers: {
    yellow: Array.from({ length: 20 }, (_, index) =>
      character(128 + (index % 4) * 32, Math.floor(index / 4) * 32, "hurt")
    ),
    green: Array.from({ length: 20 }, (_, index) =>
      character(128 + (index % 4) * 32, 160 + Math.floor(index / 4) * 32, "hurt")
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
  ceiling: sprite(0, 368, 384, 16),
  pause: sprite(0, 320, 128, 40, "ui"),
  floorPrefix: sprite(128, 320, 64, 32, "ui"),
  floorSuffix: sprite(192, 320, 32, 32, "ui"),
  lifeLabel: sprite(224, 352, 48, 16, "ui"),
  lifeBars: Array.from({ length: 11 }, (_, index) =>
    sprite(384, index * 16, 96, 16, "ui")
  ),
  gameOver: sprite(128, 352, 96, 16, "ui"),
  digits: Array.from({ length: 10 }, (_, index) =>
    sprite(480, index * 32, 32, 32, "ui")
  ),
  difficultyLabels: [
    sprite(0, 384, 96, 16, "ui"),
    sprite(96, 384, 96, 16, "ui"),
    sprite(192, 384, 96, 16, "ui")
  ],
  smallDigits: [
    sprite(272, 224, 16, 13, "ui"),
    sprite(272, 237, 16, 14, "ui"),
    sprite(272, 252, 16, 13, "ui"),
    sprite(272, 266, 16, 14, "ui"),
    sprite(272, 280, 16, 13, "ui"),
    sprite(272, 294, 16, 14, "ui"),
    sprite(272, 308, 16, 14, "ui"),
    sprite(272, 322, 16, 13, "ui"),
    sprite(272, 336, 16, 14, "ui"),
    sprite(272, 350, 16, 14, "ui")
  ]
};
