#!/usr/bin/env node
// An old alias: node setup-week N is npm start -- --week N (NetSim Studio, opened on week N). The
// course's one entry point is npm start; this stays only for anyone who learned the old command.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [week, ...rest] = process.argv.slice(2);
if (!/^\d+$/.test(week ?? "") || Number(week) < 1) {
  console.log("Which week? For example: node setup-week 2");
  process.exit(2);
}
const setup = join(dirname(fileURLToPath(import.meta.url)), "setup.mjs");
const run = spawnSync(process.execPath, [setup, "--week", String(Number(week)), ...rest], { stdio: "inherit" });
process.exit(run.status ?? 1);
