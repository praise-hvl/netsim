// Small programs that keep extra cores busy: each counts up and keeps every count in its own
// memory cell, so the memory grid shows who wrote what. The recorded runs use them, and so does
// the in-browser machine when it has more than 2 cores (countdown and blink alone would leave
// the other cores idle). Pure: assembled in the browser or in Node alike.
import { assemble } from "@/core/asm";

export type ExtraProgram = { name: string; address: number; bytes: number[] };

/**
 * Where each tally lives (44 bytes each): 0x0C0 upwards, then the gaps after countdown (0x000)
 * and blink (0x080). Their counts go in 0x1E0-0x1FF, 4 bytes each.
 */
const TALLY_HOMES = [0x0c0, 0x0f0, 0x120, 0x150, 0x180, 0x1b0, 0x020, 0x050] as const;
export const MAX_TALLIES = TALLY_HOMES.length;

/** The source of tally number `index` (from 0): count up in steps of index + 1. STORE takes a fixed address, so the loop is written out. */
function tallySource(index: number): string {
  const lines = ["LOADI R0, 0", `LOADI R1, ${index + 1}`];
  for (let k = 0; k < 4; k++) lines.push("ADD R0, R1", `STORE R0, ${0x1e0 + index * 4 + k}`);
  lines.push("HALT");
  return lines.join("\n");
}

/** The first `count` tally programs (up to MAX_TALLIES), assembled at their homes. */
export function tallyPrograms(count: number): ExtraProgram[] {
  return Array.from({ length: Math.max(0, Math.min(count, MAX_TALLIES)) }, (_, i) => ({
    name: `tally-${i + 1}`,
    address: TALLY_HOMES[i],
    bytes: assemble(tallySource(i), { origin: TALLY_HOMES[i] }),
  }));
}

/**
 * What the board adds to an in-browser machine on top of countdown and blink: nothing on 1 or 2
 * cores; one tally per core above that (up to 8), so there are always more programs than cores
 * and the scheduler moves them around, as in the 8-core recording.
 */
export function extraProgramsFor(cores: number): ExtraProgram[] {
  return cores <= 2 ? [] : tallyPrograms(cores);
}
