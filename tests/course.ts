// The sensors stretch module: a student builds one optional peripheral, named in course.json's
// "peripheral". Tests for the other options are skipped. With no choice made (the instructor's
// netsim branch) all of them run.
import { readFileSync } from "node:fs";

export const OPTIONAL_PERIPHERALS = ["sensor", "proximity", "potentiometer"] as const;
type Choice = (typeof OPTIONAL_PERIPHERALS)[number] | null;

/** Check course.json's `peripheral`. A typo must fail loudly, not quietly skip every test. */
export function parseChoice(course: { peripheral?: unknown }): Choice {
  const choice = course.peripheral ?? null;
  if (choice === null) return null;
  const valid: readonly unknown[] = OPTIONAL_PERIPHERALS;
  if (!valid.includes(choice)) {
    throw new Error(`course.json: "peripheral" is ${JSON.stringify(choice)}; use one of ${OPTIONAL_PERIPHERALS.join(", ")}, or null`);
  }
  return choice as Choice;
}

const chosen = parseChoice(JSON.parse(readFileSync(new URL("../course.json", import.meta.url), "utf8")) as { peripheral?: unknown });

/** True when the tests for this optional peripheral should be skipped. */
export function notChosen(kind: string): boolean {
  return chosen !== null && chosen !== kind;
}
