// Turn a program's assembly into bytes. Safe anywhere, the browser included: the sources come
// from programs/bundle.ts (made by `npm run programs`). programs/read.ts does the same from the
// .asm files on disk, for Node scripts that want an edit picked up without regenerating.
import { assemble } from "@/core/asm";
import { PROGRAM_SOURCES } from "@/programs/bundle";
import { findProgram, type ProgramInfo } from "@/programs/index";

export type LoadedProgram = ProgramInfo & { source: string; bytes: number[] };

/**
 * `symbols` fills in names the program doesn't define itself, e.g. { VECTOR, COUNTER, REGISTER }
 * for an interrupt handler. `origin` defaults to the program's own address (or VECTOR).
 */
export function assembleProgram(info: ProgramInfo, source: string, symbols: Record<string, number> = {}, origin?: number): LoadedProgram {
  const bytes = assemble(source, { origin: origin ?? info.address ?? symbols.VECTOR ?? 0, symbols });
  return { ...info, source, bytes };
}

/** A program from the bundle, assembled. */
export function loadProgram(name: string, symbols: Record<string, number> = {}, origin?: number): LoadedProgram {
  const info = findProgram(name);
  if (!info) throw new Error(`no program called "${name}"`);
  const source = PROGRAM_SOURCES[info.file];
  if (source === undefined) throw new Error(`${info.file} isn't in programs/bundle.ts: run npm run programs`);
  return assembleProgram(info, source, symbols, origin);
}
