import { describe, expect, it } from "vitest";
import { defineFsm, IllegalTransitionError } from "@/core/fsm";

const door = defineFsm("Door", ["OPEN", "CLOSED", "LOCKED"] as const, "CLOSED", [
  { from: "CLOSED", to: "OPEN", on: "push" },
  { from: "OPEN", to: "CLOSED", on: "pull" },
  { from: "CLOSED", to: "LOCKED", on: "key" },
  { from: ["LOCKED"], to: "CLOSED", on: "key" },
]);

describe("defineFsm", () => {
  it("allows moves that are in the table", () => {
    expect(door.go("CLOSED", "OPEN")).toBe("OPEN");
    expect(door.canGo("LOCKED", "CLOSED")).toBe(true);
  });

  it("always allows staying put", () => {
    expect(door.go("OPEN", "OPEN")).toBe("OPEN");
  });

  it("refuses moves that aren't in the table", () => {
    expect(door.canGo("OPEN", "LOCKED")).toBe(false);
    expect(() => door.go("OPEN", "LOCKED")).toThrow(IllegalTransitionError);
    expect(() => door.go("OPEN", "LOCKED")).toThrow("Door: illegal transition OPEN -> LOCKED");
  });
});
