import { expect, it } from "vitest";
import { defineFsm } from "@/core/fsm";

it("exports a transition table as a mermaid state diagram", () => {
  const light = defineFsm("Light", ["OFF", "ON"] as const, "OFF", [
    { from: "OFF", to: "ON", on: "switch up" },
    { from: ["ON"], to: "OFF", on: "switch down" },
  ]);
  expect(light.toMermaid()).toBe(
    ["stateDiagram-v2", "  [*] --> OFF", "  OFF --> ON: switch up", "  ON --> OFF: switch down"].join("\n"),
  );
});

it("draws self-transitions the table lists, like a core taking an interrupt from FETCH", async () => {
  const { coreFsm } = await import("@/core/cpu-core");
  const diagram = coreFsm.toMermaid();
  expect(diagram).toContain("FETCH --> FETCH: interrupt taken: PC = vector");
  expect(diagram).toContain("WAIT_FETCH --> WAIT_FETCH: no bytes yet (stall)");
});
