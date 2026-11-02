// programs/bundle.ts is a copy of programs/*.asm for code that can't read files (the board in a
// web page, the peripheral host). If you edit a .asm file, run `npm run programs`.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BUNDLE_FILE, readSources, renderBundle } from "@/scripts/programs-bundle";

it("programs/bundle.ts matches the .asm files", () => {
  expect(readFileSync(BUNDLE_FILE, "utf8") === renderBundle(readSources()), `${BUNDLE_FILE} is out of date: run npm run programs`).toBe(true);
});
