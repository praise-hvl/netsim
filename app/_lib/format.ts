/** A byte as two hex digits: 10 -> "0A". */
export function hex2(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

/** Read a number the components send as text, like "0x3F1". Returns null if it isn't one. */
export function parseAddress(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isNaN(parsed) ? null : parsed;
}
