// How the design-note check counts "your own words".
import { expect, it } from "vitest";
import { ownWords } from "@/tests/design-note";

it("doesn't count comments, table headers, image links or bold labels", () => {
  const stub = [
    "<!-- TODO(week 2, design-02-parts): Fill in the table -->",
    "| Part | Its job, in a few words | What it knows (its state) |",
    "|---|---|---|",
    "| | | |",
  ];
  expect(ownWords(stub)).toBe(0);
  expect(ownWords(["![My board sketch](week-02-board.jpg)"])).toBe(0);
  expect(ownWords(["- **Build:**", "- **Check:**"])).toBe(0);
  expect(ownWords(["| Part | Job |", "|---|---|", "| Bus | routes every message |"])).toBe(4);
  expect(ownWords(["- **Build:** the memory grid"])).toBe(3);
});
