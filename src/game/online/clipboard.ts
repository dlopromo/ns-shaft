export type ClipboardResult = "copied" | "blocked" | "unavailable";

export interface ClipboardWriter {
  writeText(value: string): Promise<void>;
}

export async function copyRoomCode(
  roomCode: string,
  clipboard: ClipboardWriter | undefined
): Promise<ClipboardResult> {
  if (!clipboard) return "unavailable";
  try {
    await clipboard.writeText(roomCode);
    return "copied";
  } catch {
    return "blocked";
  }
}
