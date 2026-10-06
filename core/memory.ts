// Main memory: 1 KB of bytes. Reads and writes are checked against the edges of memory; going
// past them is a fault, like a real bus error.
import { z } from "zod";
import { MEMORY_SIZE, hex } from "@/protocol/memory-map";
import { todo } from "@/core/todo";

export const memorySchema = z.object({
  bytes: z.array(z.number().int().min(0).max(0xff)).length(MEMORY_SIZE),
});
export type Memory = z.infer<typeof memorySchema>;

export type MemoryResult<T> = { ok: true; value: T } | { ok: false; fault: string };

export function createMemory(): Memory {
  return { bytes: new Array<number>(MEMORY_SIZE).fill(0) };
}

function checkRange(address: number, length: number): string | null {
  if (length < 1) return "length must be at least 1";
  if (address < 0 || address + length > MEMORY_SIZE) {
    return `${hex(address)}..${hex(address + length - 1)} is outside memory (${hex(0)}..${hex(MEMORY_SIZE - 1)})`;
  }
  return null;
}

export function read(memory: Memory, address: number, length: number): MemoryResult<number[]> {
  // @student week=3 part=home id=memory-read "Return `length` bytes starting at `address`, or a fault if any of them is outside memory"
  // TODO(week 3, memory-read): Return `length` bytes starting at `address`, or a fault if any of them is outside memory
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: memory-read", memory, address, length);
  // @end
}

/** Returns a new Memory; the old one is left untouched. */
export function write(memory: Memory, address: number, bytes: readonly number[]): MemoryResult<Memory> {
  // @student week=3 part=home id=memory-write "Return a copy of memory with `bytes` written at `address`, or a fault"
  // TODO(week 3, memory-write): Return a copy of memory with `bytes` written at `address`, or a fault
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: memory-write", memory, address, bytes);
  // @end
}

export function snapshotMemory(memory: Memory): Memory {
  // @student week=stretch part=class id=memory-snapshot "Return what should go in a save file for this memory"
  // TODO(stretch, memory-snapshot): Return what should go in a save file for this memory
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: memory-snapshot", memory);
  // @end
}

/** Check saved data really is a memory before trusting it. Throws if it isn't. */
export function restoreMemory(data: unknown): Memory {
  // @student week=stretch part=class id=memory-restore "Validate the saved data with memorySchema and return it"
  // TODO(stretch, memory-restore): Validate the saved data with memorySchema and return it
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: memory-restore", data);
  // @end
}
