// Node only: read a program's assembly from its .asm file and assemble it (an edit is picked up
// straight away). Code that runs in the browser uses loadProgram from programs/load.ts.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findProgram } from "@/programs/index";
import { assembleProgram, type LoadedProgram } from "@/programs/load";

export type { LoadedProgram };

/**
 * `symbols` fills in names the program doesn't define itself, e.g. { VECTOR, COUNTER, REGISTER }
 * for an interrupt handler. `origin` defaults to the program's own address (or VECTOR).
 */
export function readProgram(name: string, symbols: Record<string, number> = {}, origin?: number): LoadedProgram {
  const info = findProgram(name);
  if (!info) throw new Error(`no program called "${name}"`);
  // Resolved from the project root, which is where npm scripts and Next both run.
  const source = readFileSync(join(process.cwd(), "programs", info.file), "utf8");
  return assembleProgram(info, source, symbols, origin);
}
