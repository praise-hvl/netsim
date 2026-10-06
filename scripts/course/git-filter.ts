// The solutions filter, in Praise's copy only (npm run instructor:setup turns it on; a student's
// clone never has it, so for them it does nothing). .gitattributes sends it every file that can
// have regions marked for students:
//
//   clean  (git add):      the file as Praise has it, with the solutions -> the stubbed file that is
//                          committed. The solved file is kept in solutions/<path> (private, never pushed).
//   smudge (git checkout): the committed, stubbed file -> the solved one from solutions/<path>.
//
// It's git's long-running filter process (one process for a whole `git add` or checkout), spoken
// over stdin/stdout in pkt-lines: https://git-scm.com/docs/gitattributes#_long_running_filter_process
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { findRegions, isRegionFile, stubFile } from "../lib/regions";

export const SOLUTIONS = "solutions";

const stubbed = stubFile;

/**
 * clean: the committed form of a file. A file with any region that holds code is kept in
 * `solutions` first. A file that is already all stubs (or has no regions) is left alone, so a
 * stubbed copy can never overwrite the solutions.
 */
export function clean(path: string, text: string, root = process.cwd()): string {
  if (!isRegionFile(path) || !text.includes("@student")) return text;
  const stub = stubbed(path, text);
  if (stub !== text) {
    const file = join(root, SOLUTIONS, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  return stub;
}

/**
 * smudge: the solved form of a committed file. When the committed file is exactly the stubbed form
 * of what's kept, that is it. When the committed file has changed outside its regions since (a fix
 * pulled from elsewhere), each region's solution is put back by id, into the new file.
 */
export function smudge(path: string, text: string, root = process.cwd(), warn = (line: string) => process.stderr.write(`${line}\n`)): string {
  if (!isRegionFile(path) || !text.includes("@student")) return text;
  const file = join(root, SOLUTIONS, path);
  if (!existsSync(file)) return text;
  const solved = readFileSync(file, "utf8");
  if (stubbed(path, solved) === text) return solved;
  const merged = fillRegions(path, text, solved);
  if (merged !== null && stubbed(path, merged) === text) return merged;
  warn(`netsim-solutions: ${path} changed outside its regions and its solutions couldn't be put back; it's checked out as stubs (the solutions are still in ${SOLUTIONS}/${path}).`);
  return text;
}

/**
 * The stubbed file with each region's lines (between its markers, @stub lines included) taken from
 * the solved file, by region id. The helper imports a stub needed (todo, notBuilt) go when nothing
 * uses them any more. Null when a region has no solution.
 */
export function fillRegions(path: string, stubText: string, solvedText: string): string | null {
  const solvedLines = solvedText.split("\n");
  const inner = new Map(findRegions(path, solvedText).map((r) => [r.id, solvedLines.slice(r.start + 1, r.end)]));
  const lines = stubText.split("\n");
  const regions = findRegions(path, stubText);
  for (const region of [...regions].reverse()) {
    const body = inner.get(region.id);
    if (!body) return null;
    lines.splice(region.start + 1, region.end - region.start - 1, ...body);
  }
  let result = lines.join("\n");
  for (const [name, from] of [["todo", "@/core/todo"], ["notBuilt", "@/board/shell/layer"]] as const) {
    const line = `import { ${name} } from "${from}";\n`;
    if (result.includes(line) && !solvedText.includes(line) && !new RegExp(`\\b${name}\\(`).test(result.replace(line, ""))) result = result.replace(line, "");
  }
  return result;
}

// ── git's long-running filter protocol ────────────────────────────────────

/** Reads pkt-lines from a stream. */
class PktReader {
  private buffer = Buffer.alloc(0);
  private waiting: (() => void) | null = null;
  private ended = false;
  constructor(stream: NodeJS.ReadableStream) {
    stream.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.waiting?.();
    });
    stream.on("end", () => {
      this.ended = true;
      this.waiting?.();
    });
  }
  private async need(bytes: number): Promise<boolean> {
    while (this.buffer.length < bytes) {
      if (this.ended) return false;
      await new Promise<void>((resolve) => (this.waiting = resolve));
      this.waiting = null;
    }
    return true;
  }
  /** One packet's payload, null for a flush packet, undefined at the end of input. */
  async packet(): Promise<Buffer | null | undefined> {
    if (!(await this.need(4))) return undefined;
    const length = parseInt(this.buffer.subarray(0, 4).toString("ascii"), 16);
    if (length === 0) {
      this.buffer = this.buffer.subarray(4);
      return null;
    }
    if (!(await this.need(length))) return undefined;
    const payload = this.buffer.subarray(4, length);
    this.buffer = this.buffer.subarray(length);
    return payload;
  }
  /** Text packets up to a flush ("key=value" lines, without their newline). */
  async lines(): Promise<string[] | undefined> {
    const out: string[] = [];
    for (;;) {
      const p = await this.packet();
      if (p === undefined) return undefined;
      if (p === null) return out;
      out.push(p.toString("utf8").replace(/\n$/, ""));
    }
  }
  /** Binary packets up to a flush, joined. */
  async content(): Promise<Buffer | undefined> {
    const parts: Buffer[] = [];
    for (;;) {
      const p = await this.packet();
      if (p === undefined) return undefined;
      if (p === null) return Buffer.concat(parts);
      parts.push(p);
    }
  }
}

const MAX = 65516;
const packet = (data: Buffer | string) => {
  const body = typeof data === "string" ? Buffer.from(data) : data;
  return Buffer.concat([Buffer.from((body.length + 4).toString(16).padStart(4, "0")), body]);
};
const FLUSH = Buffer.from("0000");
const textPackets = (lines: string[]) => Buffer.concat([...lines.map((l) => packet(`${l}\n`)), FLUSH]);
function contentPackets(data: Buffer): Buffer {
  const parts: Buffer[] = [];
  for (let i = 0; i < data.length; i += MAX) parts.push(packet(data.subarray(i, i + MAX)));
  return Buffer.concat([...parts, FLUSH]);
}

export async function serve(input: NodeJS.ReadableStream = process.stdin, write: (b: Buffer) => void = (b) => process.stdout.write(b)): Promise<void> {
  const reader = new PktReader(input);
  const hello = await reader.lines();
  if (!hello || hello[0] !== "git-filter-client" || !hello.includes("version=2")) throw new Error("netsim-solutions: not git's filter protocol");
  write(textPackets(["git-filter-server", "version=2"]));
  const offered = (await reader.lines()) ?? [];
  write(textPackets(["clean", "smudge"].filter((c) => offered.includes(`capability=${c}`)).map((c) => `capability=${c}`)));
  for (;;) {
    const headers = await reader.lines();
    if (!headers) return;
    const field = (key: string) => headers.find((h) => h.startsWith(`${key}=`))?.slice(key.length + 1) ?? "";
    const data = await reader.content();
    if (data === undefined) return;
    const command = field("command");
    const path = field("pathname");
    try {
      const text = data.toString("utf8");
      const out = command === "clean" ? clean(path, text) : command === "smudge" ? smudge(path, text) : text;
      write(Buffer.concat([textPackets(["status=success"]), contentPackets(Buffer.from(out, "utf8")), FLUSH]));
    } catch (error) {
      process.stderr.write(`netsim-solutions: ${path}: ${error instanceof Error ? error.message : String(error)}\n`);
      write(textPackets(["status=error"]));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serve().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
