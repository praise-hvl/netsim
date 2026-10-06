import { describe, expect, it } from "vitest";
import { sensor } from "@/components/peripherals/sensor";
import { statusPayload } from "@/protocol/messages";
import { notChosen } from "@/tests/course";

const ctx = { tick: 1, register: null };
const start = () => sensor.init({ threshold: 75 });

describe.skipIf(notChosen("sensor"))("sensor", () => {
  it("writes its first reading to the register on tick 1, then stays quiet", () => {
    const first = sensor.onTick(start(), ctx);
    expect(first.effects).toEqual([{ kind: "write", value: 0 }]);
    expect(sensor.onTick(first.state, ctx).effects).toEqual([]);
  });

  it("writes a new reading on the next tick, once", () => {
    const quiet = sensor.onTick(start(), ctx).state;
    const set = sensor.onInput(quiet, { value: 40 });
    const next = sensor.onTick(set, ctx);
    expect(next.effects).toEqual([{ kind: "write", value: 40 }]);
    expect(sensor.onTick(next.state, ctx).effects).toEqual([]);
  });

  it("raises one irq when the reading crosses the threshold going up", () => {
    const quiet = sensor.onTick(start(), ctx).state;
    const hot = sensor.onTick(sensor.onInput(quiet, { value: 90 }), ctx);
    expect(hot.effects).toEqual([{ kind: "write", value: 90 }, { kind: "irq" }]);
    expect(hot.state).toMatchObject({ fsm: "ABOVE", alarms: 1 });

    const hotter = sensor.onTick(sensor.onInput(hot.state, { value: 120 }), ctx);
    expect(hotter.effects).toEqual([{ kind: "write", value: 120 }]);
  });

  it("treats the threshold itself as not above", () => {
    const quiet = sensor.onTick(start(), ctx).state;
    expect(sensor.onTick(sensor.onInput(quiet, { value: 75 }), ctx).state.fsm).toBe("BELOW");
  });

  it("re-arms after the reading drops back", () => {
    let state = sensor.onTick(start(), ctx).state;
    const alarms: number[] = [];
    for (const value of [90, 50, 91]) {
      const result = sensor.onTick(sensor.onInput(state, { value }), ctx);
      state = result.state;
      alarms.push(result.effects.filter((e) => e.kind === "irq").length);
    }
    expect(alarms).toEqual([1, 0, 1]);
    expect(state.alarms).toBe(2);
  });

  it("describes itself for the dashboard", () => {
    const view = sensor.view({ fsm: "ABOVE", threshold: 75, value: 80, alarms: 1, pendingWrite: false });
    expect(view).toEqual({ state: "ABOVE", data: { value: 80, threshold: 75, alarms: 1 } });
    expect(statusPayload.safeParse({ ...view, label: "Sensor" }).success).toBe(true);
  });

  it("rejects readings that don't fit in a byte", () => {
    expect(sensor.inputSchema.safeParse({ value: 256 }).success).toBe(false);
  });
});
