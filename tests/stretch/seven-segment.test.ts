// Stretch: the seven-segment display.
import { describe, expect, it } from "vitest";
import { SEGMENTS, sevenSegment, toSegments } from "@/components/peripherals/seven-segment";
import { statusPayload } from "@/protocol/messages";

describe("seven-segment display", () => {
  it("shows its register value and keeps reading it", () => {
    const { state, effects } = sevenSegment.onTick(sevenSegment.init({}), { tick: 2, register: 42 });
    expect(state.value).toBe(42);
    expect(effects).toEqual([{ kind: "read" }]);
  });

  it("keeps the last value until the first read reply arrives", () => {
    const start = sevenSegment.init({});
    expect(sevenSegment.onTick(start, { tick: 1, register: null }).state).toEqual(start);
  });

  it("turns a byte into three digits of segment patterns", () => {
    expect(toSegments(42)).toEqual([SEGMENTS[0], SEGMENTS[4], SEGMENTS[2]]);
    expect(toSegments(255)).toEqual([SEGMENTS[2], SEGMENTS[5], SEGMENTS[5]]);
    expect(SEGMENTS[8]).toBe(0b1111111);
    expect(SEGMENTS[1]).toBe(0b0000110);
  });

  it("describes itself for the dashboard", () => {
    const view = sevenSegment.view({ fsm: "SHOWING", value: 7 });
    expect(view.data).toMatchObject({ value: 7 });
    expect(statusPayload.safeParse({ ...view, label: "7-seg" }).success).toBe(true);
  });
});
