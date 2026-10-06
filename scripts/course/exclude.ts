// The unreleased weeks, hidden from the public repository in Praise's copy by .git/info/exclude
// (git's local ignore list: never committed, so it hides nothing from anyone else). Rewritten from
// course.json's `week` by npm run instructor:setup and npm run release.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unreleasedPatterns } from "./private-paths";

const BEGIN = "# netsim: unreleased weeks (npm run release rewrites this block)";
const END = "# netsim: end";

export function released(root = process.cwd()): number {
  return Number((JSON.parse(readFileSync(join(root, "course.json"), "utf8")) as { week?: unknown }).week) || 0;
}

/** .git/info/exclude with the block for weeks after `week`, keeping anything else in it. */
export function withBlock(current: string, week: number): string {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kept = current.replace(new RegExp(`${escape(BEGIN)}[\\s\\S]*?${escape(END)}\\n?`), "").replace(/\n*$/, "\n");
  return `${kept}${BEGIN}\n${unreleasedPatterns(week).join("\n")}\n${END}\n`;
}

export function writeExclude(week: number, root = process.cwd()): string {
  const file = join(execFileSync("git", ["rev-parse", "--git-path", "info/exclude"], { cwd: root, encoding: "utf8" }).trim());
  const path = file.startsWith("/") ? file : join(root, file);
  writeFileSync(path, withBlock(existsSync(path) ? readFileSync(path, "utf8") : "", week));
  return path;
}
