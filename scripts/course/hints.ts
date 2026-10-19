// The studio's grey hint text: for some tasks, the reference code shows as ghost text in the
// studio's code box (students type over it, paste it, or hide it). Which tasks get one is decided
// here, in one place. A released week carries its hints in studio/hints/week-NN.json (written by
// npm run release); the leak check lets that file hold only these tasks' code, for released weeks.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRegions, isRegionFile, isStubbed, type Region } from "../lib/regions";
import { privateReason } from "./private-paths";

/** The switch: which parts get hint text. Praise's call (2026-10-19): every part, take-home included. */
export const HINT_PARTS: readonly Region["part"][] = ["class", "home"];
/** Per-task exceptions to HINT_PARTS: true always shows a hint, false never does. */
export const HINT_OVERRIDES: Readonly<Record<string, boolean>> = {};

export function showsHint(region: Pick<Region, "id" | "part">): boolean {
  return HINT_OVERRIDES[region.id] ?? HINT_PARTS.includes(region.part);
}

/** Where week N's hints go in the course. */
export function hintsPath(week: number): string {
  return `studio/hints/week-${String(week).padStart(2, "0")}.json`;
}

/** A hints file's path → its week, or null. */
export function hintsWeek(path: string): number | null {
  const match = /^studio\/hints\/week-(\d\d)\.json$/.exec(path);
  return match ? Number(match[1]) : null;
}

/** A task's hint: its code, and what each part of it does (the explanation, and the code line it starts on). */
export type Hint = { code: string; steps: { line: number; explain: string }[] };

/** An explanation in a solution: `// > what the next lines do` (`; >` in assembly). Not part of the hint's code. */
export const EXPLAIN = /^\s*(?:\/\/|;) > ?(.*)$/;

/** Split a solution's lines into the hint's code and its explained parts. */
export function toHint(lines: string[]): Hint {
  const code: string[] = [];
  const steps: Hint["steps"] = [];
  let pending: string[] = [];
  for (const line of lines) {
    const explain = EXPLAIN.exec(line);
    if (explain) {
      pending.push(explain[1].trim());
      continue;
    }
    if (pending.length) {
      steps.push({ line: code.length, explain: pending.join(" ") });
      pending = [];
    }
    code.push(line);
  }
  return { code: code.join("\n"), steps };
}

/**
 * Week N's hints from solved files: each hinted task's code, without its region's indent, by id,
 * with its explanations. Code files only (the notes are written in the note, not the code box).
 */
export function weekHints(files: Iterable<[string, string]>, week: number): Record<string, Hint> {
  const hints: Record<string, Hint> = {};
  for (const [path, text] of files) {
    if (!isRegionFile(path) || path.endsWith(".md") || !text.includes(`@student week=${week} `)) continue;
    for (const region of findRegions(path, text)) {
      if (region.week !== week || !showsHint(region) || isStubbed(region)) continue;
      hints[region.id] = toHint(region.body.map((line) => (line.startsWith(region.indent) ? line.slice(region.indent.length) : line.trimStart())));
    }
  }
  return hints;
}

/** Write week N's hints file from the working copy (Praise's: solved). Its path, or null when the week has none. */
export function writeHints(week: number, root = process.cwd()): string | null {
  // Only the course's own code: never an instructor-only file (teacher/, scripts/studio/, …).
  const tracked = execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx", "*.asm"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((path) => path && !privateReason(path, week));
  const hints = weekHints(
    tracked.map((path) => [path, readFileSync(join(root, path), "utf8")] as [string, string]),
    week,
  );
  if (!Object.keys(hints).length) return null;
  const path = hintsPath(week);
  mkdirSync(join(root, "studio", "hints"), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(hints, null, 2)}\n`);
  return path;
}

/**
 * Why a hints file mustn't be public, or "": its week is released, it's JSON of strings, and every
 * id in it is a task of that week that shows a hint (the regions in the same tree say which).
 */
export function hintsProblem(week: number, released: number, text: string, regions: readonly Region[]): string {
  if (week > released) return `week ${week} isn't released yet (released: weeks 1-${released})`;
  let hints: unknown;
  try {
    hints = JSON.parse(text);
  } catch {
    return "not valid JSON";
  }
  if (!hints || typeof hints !== "object" || Array.isArray(hints)) return "not a map of task ids to code";
  for (const [id, hint] of Object.entries(hints)) {
    const ok = typeof hint === "string" || (hint && typeof hint.code === "string" && Array.isArray(hint.steps) && hint.steps.every((s: unknown) => typeof (s as Hint["steps"][number])?.explain === "string" && Number.isInteger((s as Hint["steps"][number])?.line)));
    if (!ok) return `${id}: not code`;
    const region = regions.find((r) => r.id === id && r.week === week);
    if (!region) return `${id} isn't a week-${week} task`;
    if (!showsHint(region)) return `${id} is a ${region.part} task: its code may not be public`;
  }
  return "";
}
