import type { Difficulty, DifficultyProfile, PlatformVariant } from "./types";

const weights = (
  normal: number,
  disappearing: number,
  spike: number,
  conveyorLeft: number,
  conveyorRight: number,
  spring: number
): Record<PlatformVariant, number> => ({
  normal,
  disappearing,
  spike,
  "conveyor-left": conveyorLeft,
  "conveyor-right": conveyorRight,
  spring
});

export const DIFFICULTIES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    basePlatformVelocity: -0.06,
    platformGap: 60,
    weights: weights(0.7, 0.06, 0.06, 0.06, 0.06, 0.06)
  },
  normal: {
    basePlatformVelocity: -0.08,
    platformGap: 60,
    weights: weights(0.6, 0.08, 0.08, 0.08, 0.08, 0.08)
  },
  hard: {
    basePlatformVelocity: -0.1,
    platformGap: 60,
    weights: weights(0.5, 0.1, 0.1, 0.1, 0.1, 0.1)
  }
};
