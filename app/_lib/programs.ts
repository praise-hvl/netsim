// The programs the dashboard can load: every program with a load address, with its assembly
// source and the bytes it assembles to. They come from programs/bundle.ts (made by
// `npm run programs`), so this works with no server at all, as on GitHub Pages.
import { z } from "zod";
import { address, byte } from "@/protocol/messages";
import { PROGRAMS } from "@/programs/index";
import { loadProgram } from "@/programs/load";

export const programListing = z.object({
  name: z.string(),
  file: z.string(),
  address,
  description: z.string(),
  source: z.string(),
  bytes: z.array(byte),
});
export type ProgramListing = z.infer<typeof programListing>;

export async function fetchPrograms(): Promise<ProgramListing[]> {
  return PROGRAMS.flatMap((p) => (p.address === null ? [] : [{ ...loadProgram(p.name), address: p.address }]));
}
