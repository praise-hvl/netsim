import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only the weeks you have reached are tested. The week branches bump this number.
// tests/studio/ tests the studio and setup themselves; it only exists on netsim (the week branches
// never get it), so there it always runs and in a student's copy it matches nothing.
// tests/tools/ tests tools that ship to students but aren't week work (npm run portfolio), so it
// always runs too.
// Stretch modules (portfolio only) have their tests in tests/stretch/. Set "stretch": true in
// course.json to include them; they're left out otherwise, so they never fail by default.
const course = JSON.parse(readFileSync(new URL("./course.json", import.meta.url), "utf8")) as { week: number; stretch?: boolean };
// NETSIM_WEEK=8 (npm run test:all, in the instructor's copy): every week's tests, released or not.
const week = Number(process.env.NETSIM_WEEK) || course.week;
const stretch = course.stretch || process.env.NETSIM_WEEK !== undefined;
const weeks = Array.from({ length: week }, (_, i) => String(i + 1).padStart(2, "0"));

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: [...weeks.map((w) => `tests/week-${w}/**/*.test.ts`), "tests/studio/**/*.test.ts", "tests/tools/**/*.test.ts", ...(stretch === true ? ["tests/stretch/**/*.test.ts"] : [])],
    environment: "node",
    testTimeout: 10_000,
  },
});
