/**
 * Files that stay with the instructor: never copied into a week branch. That includes CI: in a
 * student's fork the tests are meant to fail until the week's work is done, and the week-1
 * setup checks can only pass on the student's own machine. The studio's own tests
 * (tests/studio/) and tools (scripts/studio/) check the course's infrastructure, not the
 * student's work, so they stay here too (and out of --verify's per-week results).
 * teacher/ (Praise's run sheets, lesson pages and instructor curriculum) is committed to this private
 * repo as a backup, and never ships.
 * The one workflow that does ship is pages.yml: it only builds and publishes the student's board.
 */
const STUDENT_WORKFLOWS = [".github/workflows/pages.yml"];

export function instructorOnly(file: string): boolean {
  return (
    file.startsWith("teacher/") ||
    file.startsWith("course/") ||
    (file.startsWith(".github/") && !STUDENT_WORKFLOWS.includes(file)) ||
    file.startsWith("tests/studio/") ||
    file.startsWith("scripts/studio/") ||
    file === "scripts/make-week-branches.ts"
  );
}
