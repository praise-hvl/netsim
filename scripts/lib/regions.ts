// Finds `@student` regions in source files and replaces them with stubs.
// Shared by make-week-branches.ts (instructor) and catch-up.ts (students).
//
//   // @student week=3 part=class id=decode "Turn 4 bytes into an Instruction"
//   // @stub return { ok: false, error: "not yet" };   <- optional, replaces the default stub
//   ...solution...
//   // @end
//
// In .asm files the same markers start with `;` instead of `//`. In the student notes
// (docs/notes/*.md, and only there) they are HTML comments:
//   <!-- @student week=1 part=home id=setup-doctor "Paste your npm run doctor output" -->
//   ...example answer...
//   <!-- @end -->
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

export type Region = {
  file: string;
  week: number;
  part: "class" | "home";
  id: string;
  description: string;
  /** Line index (0-based) of the `@student` marker and the `@end` marker. */
  start: number;
  end: number;
  indent: string;
  /** Explicit stub lines (without the comment prefix), if any. */
  stub: string[] | null;
  /** The solution lines between the markers (without @stub lines). */
  body: string[];
};

export class RegionError extends Error {}

// `//` for TypeScript, `;` for assembly, `<!--` … `-->` for the notes.
const START = /^(\s*)(\/\/|;|<!--) @student week=(\d+|stretch) part=(class|home) id=([a-z0-9-]+) "([^"]*)"(?:\s*-->)?\s*$/;

/**
 * Stretch work (portfolio only, not graded) is tagged `week=stretch`. It counts as "week 9":
 * after the course, so every week branch ships it as a stub and no week's tests depend on it.
 * Its tests live in tests/stretch/ and only run when a student turns stretch on.
 */
export const STRETCH_WEEK = 9;

/** How a region's week reads in messages: "week 3", or "stretch". */
export function weekLabel(week: number): string {
  return week === STRETCH_WEEK ? "stretch" : `week ${week}`;
}
const STUB = /^\s*(\/\/|;|<!--) @stub(?: (.*?))?(?:\s*-->)?$/;
const END = /^\s*(\/\/|;|<!--) @end(?:\s*-->)?\s*$/;

/** Notes are the only Markdown with regions: other docs show markers as examples. */
function isNotesFile(file: string): boolean {
  return /^docs\/notes\/[^/]+\.md$/.test(file);
}

export function isRegionFile(file: string): boolean {
  return /\.(ts|tsx|asm)$/.test(file) || isNotesFile(file);
}

export function findRegions(file: string, text: string): Region[] {
  const lines = text.split("\n");
  const regions: Region[] = [];
  let open: Region | null = null;

  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    const start = START.exec(line);
    if (start) {
      if (open) throw new RegionError(`${where}: @student inside another region (${open.id})`);
      const week = start[3] === "stretch" ? STRETCH_WEEK : Number(start[3]);
      if (week < 1 || week > STRETCH_WEEK) throw new RegionError(`${where}: week must be 1-8 or stretch`);
      open = { file, week, part: start[4] as Region["part"], id: start[5], description: start[6], start: index, end: -1, indent: start[1], stub: null, body: [] };
      return;
    }
    if (line.includes("@student") && !line.includes("`@student`")) {
      if (/^\s*(\/\/|;|<!--) @student/.test(line)) throw new RegionError(`${where}: malformed @student marker`);
    }
    if (!open) {
      if (END.test(line)) throw new RegionError(`${where}: @end without @student`);
      return;
    }
    const stub = STUB.exec(line);
    if (stub) {
      (open.stub ??= []).push(stub[2] ?? "");
    } else if (END.test(line)) {
      open.end = index;
      regions.push(open);
      open = null;
    } else {
      open.body.push(line);
    }
  });

  if (open) throw new RegionError(`${file}: region ${(open as Region).id} has no @end`);
  return regions;
}

/** Throws if two regions anywhere share an id. */
export function checkUniqueIds(regions: readonly Region[]): void {
  const seen = new Map<string, Region>();
  for (const region of regions) {
    const other = seen.get(region.id);
    if (other) throw new RegionError(`duplicate region id "${region.id}" in ${other.file} and ${region.file}`);
    seen.set(region.id, region);
  }
}

// ── Stubs ───────────────────────────────────────────────────────────────────

/** Names of the parameters of the function the region sits in, so the stub can "use" them. */
function enclosingParameters(file: string, text: string, line: number): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const position = source.getPositionOfLineAndCharacter(line, 0);
  let best: ts.SignatureDeclaration | null = null;
  const visit = (node: ts.Node) => {
    if (position < node.getFullStart() || position > node.getEnd()) return;
    if (ts.isFunctionLike(node)) best = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  const fn = best as ts.SignatureDeclaration | null;
  if (!fn) throw new RegionError(`${file}:${line + 1}: a region must be inside a function (or give an explicit @stub)`);
  return fn.parameters.map((p) => p.name).filter(ts.isIdentifier).map((name) => name.text);
}

/** The first line of a region's stub: its TODO comment. A solution never starts with it. */
export function todoLine(region: Region): string {
  const label = weekLabel(region.week);
  if (isNotesFile(region.file)) return `${region.indent}<!-- TODO(${label}, ${region.id}): ${region.description} -->`;
  return `${region.indent}${region.file.endsWith(".asm") ? ";" : "//"} TODO(${label}, ${region.id}): ${region.description}`;
}

/** Does this region hold its stub (not a solution)? */
export function isStubbed(region: Region): boolean {
  return region.body.length > 0 && region.body[0] === todoLine(region);
}

/**
 * The file with every region that holds a solution replaced by its stub; regions already stubbed
 * are kept exactly as they are, so stubbing a stubbed file changes nothing.
 */
export function stubFile(file: string, text: string): string {
  return renderFile(file, text, (region) => (isStubbed(region) ? "solution" : "stub"));
}

function stubLines(region: Region, text: string): string[] {
  const week = String(region.week).padStart(2, "0");
  const label = weekLabel(region.week);
  const where = region.week === STRETCH_WEEK ? "Tests: tests/stretch/   Guide: docs/stretch/" : `Tests: tests/week-${week}/   Guide: docs/weeks/week-${week}.md`;
  const asm = region.file.endsWith(".asm");
  if (isNotesFile(region.file)) {
    // Notes: the TODO comment, then any starter lines the region gives (a table's header row,
    // an image link), then a blank line to write in.
    const starter = (region.stub ?? []).map((line) => region.indent + line);
    return [`${region.indent}<!-- TODO(${label}, ${region.id}): ${region.description} -->`, ...starter, ""];
  }
  const comment = asm ? ";" : "//";
  const todoLine = `${region.indent}${comment} TODO(${label}, ${region.id}): ${region.description}`;
  const pointer = `${region.indent}${comment} ${where}`;
  if (region.stub) return [todoLine, pointer, ...region.stub.map((line) => region.indent + line)];
  if (asm) return [todoLine, `${region.indent}IRET`];
  const params = enclosingParameters(region.file, text, region.start);
  const args = [`"${label}: ${region.id}"`, ...params].join(", ");
  return [todoLine, pointer, `${region.indent}return todo(${args});`];
}

export type Fill = (region: Region) => "solution" | "stub";

/** Rewrite a file, keeping the markers and filling each region with its solution or a stub. */
export function renderFile(file: string, text: string, fill: Fill): string {
  const regions = findRegions(file, text);
  if (regions.length === 0) return text;
  const lines = text.split("\n");
  const out: string[] = [];
  let cursor = 0;
  for (const region of regions) {
    out.push(...lines.slice(cursor, region.start + 1));
    if (fill(region) === "solution") {
      out.push(...region.body);
    } else {
      out.push(...stubLines(region, text));
    }
    out.push(lines[region.end]);
    cursor = region.end + 1;
  }
  out.push(...lines.slice(cursor));
  let result = out.join("\n");
  if (/\.tsx?$/.test(file)) {
    for (const [name, from] of STUB_HELPERS) {
      const imported = new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "${from}"`);
      if (new RegExp(`\\b${name}\\(`).test(result) && !imported.test(result)) result = addImport(result, name, from);
    }
  }
  return result;
}

/**
 * Functions a stub may call, and where they come from. `todo` throws (a function that isn't
 * written yet); `notBuilt` is for a drawing on the student board: it shows "you build this in
 * week N" instead of throwing, so an unbuilt board loads without errors.
 */
const STUB_HELPERS: ReadonlyArray<readonly [string, string]> = [
  ["todo", "@/core/todo"],
  ["notBuilt", "@/board/shell/layer"],
];

function addImport(text: string, name: string, from: string): string {
  const lines = text.split("\n");
  let lastImport = -1;
  lines.forEach((line, i) => {
    if (/^import .* from ".*";\s*$/.test(line) || /^} from ".*";\s*$/.test(line)) lastImport = i;
  });
  lines.splice(lastImport + 1, 0, `import { ${name} } from "${from}";`);
  return lines.join("\n");
}

/** Replace the body of region `id` in `target` with the body of the same region in `source`. */
export function copyRegion(file: string, target: string, source: string, id: string): string {
  const from = findRegions(file, source).find((r) => r.id === id);
  const to = findRegions(file, target).find((r) => r.id === id);
  if (!from || !to) throw new RegionError(`${file}: region ${id} not found`);
  const lines = target.split("\n");
  lines.splice(to.start + 1, to.end - to.start - 1, ...from.body);
  return lines.join("\n");
}

// ── Reading a whole commit at once ─────────────────────────────────────────

/** Every file at `ref` as text. Fine for source files; use readRefBytes for images. */
export function readRef(ref: string, cwd = process.cwd()): Map<string, string> {
  return new Map([...readRefBytes(ref, cwd)].map(([path, bytes]) => [path, bytes.toString("utf8")]));
}

/** Every file at `ref` as raw bytes, read with one `git archive` (much faster than a `git show` per file). */
export function readRefBytes(ref: string, cwd = process.cwd()): Map<string, Buffer> {
  const dir = mkdtempSync(join(tmpdir(), "netsim-ref-"));
  try {
    const tar = execFileSync("git", ["archive", "--format=tar", ref], { cwd, maxBuffer: 256 * 1024 * 1024 });
    execFileSync("tar", ["-x", "-C", dir], { input: tar });
    const files = new Map<string, Buffer>();
    const walk = (relative: string) => {
      for (const entry of readdirSync(join(dir, relative), { withFileTypes: true })) {
        const path = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path);
        else files.set(path, readFileSync(join(dir, path)));
      }
    };
    walk("");
    return files;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
