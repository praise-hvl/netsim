// What may never be in the course's public repository (praiseisaac/netsim), and what is only there
// once its week is released. The leak check (check-stubs), the pre-push hook, the local exclude list
// and the private backup (npm run private) all use this one list.

/** Folders and files that stay with the instructor: in Praise's copy, never in a commit. */
export const PRIVATE_DIRS = ["teacher/", "course/", "tests/studio/", "scripts/studio/", "solutions/", "private/", "archive/"] as const;
export const PRIVATE_FILES = ["scripts/make-week-branches.ts", "programs/bundle.ts"] as const;
/** The only workflows the public repo has: the student's Pages deploy and the course's own check. */
export const PUBLIC_WORKFLOWS = [".github/workflows/pages.yml", ".github/workflows/course.yml"] as const;

/** A week's own files: its guide and lesson page, its note template, its tests. */
const WEEK_FILE = /^(?:docs\/weeks\/week-|docs\/notes\/week-|tests\/week-)(\d\d)(?:[./-]|$)/;
/** A design week's board sketch is an example answer: never public. */
const SKETCH = /^docs\/notes\/week-\d\d-board\.(?:png|jpe?g)$/;

/** The week a path belongs to (a guide, note or test of week N), or null. */
export function weekOfPath(path: string): number | null {
  const match = WEEK_FILE.exec(path);
  return match ? Number(match[1]) : null;
}

/**
 * Why `path` mustn't be public when weeks 1..`released` are out, or "" when it may be.
 * @param released  the newest released week (course.json's `week` in that commit)
 */
export function privateReason(path: string, released: number): string {
  if (PRIVATE_DIRS.some((dir) => path.startsWith(dir))) return "instructor-only folder";
  if ((PRIVATE_FILES as readonly string[]).includes(path)) return path === "programs/bundle.ts" ? "generated from the .asm files (can carry solutions)" : "instructor-only file";
  if (path.startsWith(".github/") && !(PUBLIC_WORKFLOWS as readonly string[]).includes(path)) return "instructor-only workflow";
  if (SKETCH.test(path)) return "a design week's example sketch";
  const week = weekOfPath(path);
  if (week !== null && week > released) return `week ${week} isn't released yet (released: weeks 1-${released})`;
  return "";
}

/** The patterns for the unreleased weeks, for .git/info/exclude (local, never committed). */
export function unreleasedPatterns(released: number, last = 8): string[] {
  const out: string[] = [];
  for (let week = released + 1; week <= last; week++) {
    const nn = String(week).padStart(2, "0");
    out.push(`/docs/weeks/week-${nn}.*`, `/docs/notes/week-${nn}.*`, `/docs/notes/week-${nn}-*`, `/tests/week-${nn}/`);
  }
  return out;
}
