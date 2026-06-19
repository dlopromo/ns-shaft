export function normalizePlayerName(value: string, fallback: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || fallback;
}
