export const MOBILE_MEDIA_QUERY = "(pointer: coarse) and (max-width: 1024px)";

export type MobileOrientation = "portrait" | "landscape";
export type MobilePrimaryAction = "pause" | "resume" | "retry" | "disabled";

export function mobilePrimaryAction(
  mode: string | undefined,
  overlayOwnsFlow: boolean
): MobilePrimaryAction {
  if (overlayOwnsFlow || !mode) return "disabled";
  if (mode === "paused") return "resume";
  if (mode === "gameover") return "retry";
  return mode === "playing" ? "pause" : "disabled";
}

export function mobileOrientationForViewport(width: number, height: number): MobileOrientation {
  return width >= height ? "landscape" : "portrait";
}

export function mobileScaleForViewport(
  width: number,
  height: number,
  options: { controlsHeight?: number; landscapeControlsWidth?: number } = {}
): number {
  const controlsHeight = options.controlsHeight ?? 184;
  const landscapeControlsWidth = options.landscapeControlsWidth ?? 180;
  // 16px page gutter + 20px Game Boy screen bezel.
  const safeWidth = Math.max(1, width - 36);
  if (mobileOrientationForViewport(width, height) === "landscape") {
    return Math.max(0.25, Math.min(1, (safeWidth - landscapeControlsWidth) / 634, (height - 32) / 436));
  }
  return Math.max(0.25, Math.min(1, safeWidth / 634, (height - controlsHeight) / 436));
}
