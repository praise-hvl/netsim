// npm run pages:check [-- --base /my-repo]
// Builds the static copy GitHub Pages would serve (NETSIM_PAGES=1, see next.config.ts) into out/,
// then checks that your board is in it and that its files load from the base path Pages uses
// ("/<your repo's name>"). Plain Node, so it works the same on macOS and Windows.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, join } from "node:path";

const args = process.argv.slice(2);
const at = args.indexOf("--base");
const base = at >= 0 && args[at + 1] ? args[at + 1] : `/${basename(process.cwd())}`;
if (!/^\/[\w.-]+$/.test(base)) {
  console.error(`--base must look like /my-repo (got ${base})`);
  process.exit(2);
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
rmSync("out", { recursive: true, force: true });
console.log(`Building the Pages copy with base path ${base} ...`);
const build = spawnSync(process.execPath, [next, "build"], { stdio: "inherit", env: { ...process.env, NETSIM_PAGES: "1", NETSIM_BASE_PATH: base } });
if (build.status !== 0) {
  console.error("\n✗ the static build failed (see above)");
  process.exit(1);
}

const problems = [];
const page = join("out", "board", "index.html");
if (!existsSync(page)) problems.push(`${page} is missing: /board wasn't exported`);
else {
  const html = readFileSync(page, "utf8");
  if (!html.includes(`${base}/_next/static/`)) problems.push(`${page} doesn't load its scripts from ${base}/_next/static/`);
  if (/(?:src|href)="\/_next\//.test(html)) problems.push(`${page} loads files from /_next/ without the base path, so they would 404 on Pages`);
}
if (!existsSync(join("out", "_next", "static"))) problems.push("out/_next/static is missing");

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`\n✓ out/ is ready for GitHub Pages: your board will be at https://<you>.github.io${base}/board/`);
