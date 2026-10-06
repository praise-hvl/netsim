// Which cells of the memory grid to highlight, from what Memory reported in its last status.
import type { MemoryStatusData } from "@/protocol/messages";

export type Access = "read" | "write" | null;

/** Was `address` inside the last read or the last write? A write wins if it was both. */
export function accessAt(address: number, memory: Pick<MemoryStatusData, "lastRead" | "lastWrite">): Access {
  const inside = (range: MemoryStatusData["lastRead"]) =>
    range !== null && address >= range.address && address < range.address + range.length;
  if (inside(memory.lastWrite)) return "write";
  if (inside(memory.lastRead)) return "read";
  return null;
}
