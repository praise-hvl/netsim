import { describe, expect, it } from "vitest";
import { proximity } from "@/components/peripherals/proximity";
import { statusPayload } from "@/protocol/messages";
import { notChosen } from "@/tests/course";

const ctx = { tick: 1, register: null };
const start = () => proximity.onTick(proximity.init({ radius: 100 }), ctx).state;

describe.skipIf(notChosen("proximity"))("proximity sensor", () => {
  it("starts FAR and writes 255 to its register on tick 1", () => {
    const first = proximity.onTick(proximity.init({ radius: 100 }), ctx);
    expect(first.state.fsm).toBe("FAR");
    expect(first.effects).toEqual([{ kind: "write", value: 255 }]);
  });

  it("writes the distance as a whole byte, capped at 255", () => {
    expect(proximity.onTick(proximity.onInput(start(), { distance: 180.7 }), ctx).effects).toEqual([
      { kind: "write", value: 180 },
    ]);
    const far = proximity.onInput(proximity.onInput(start(), { distance: 50 }), { distance: 900 });
    expect(far.distance).toBe(255);
  });

  it("raises one irq when something comes inside the radius", () => {
    const near = proximity.onTick(proximity.onInput(start(), { distance: 40 }), ctx);
    expect(near.effects).toEqual([{ kind: "write", value: 40 }, { kind: "irq" }]);
    expect(near.state).toMatchObject({ fsm: "NEAR", approaches: 1 });

    const closer = proximity.onTick(proximity.onInput(near.state, { distance: 10 }), ctx);
    expect(closer.effects).toEqual([{ kind: "write", value: 10 }]);
  });

  it("treats the radius itself as outside", () => {
    expect(proximity.onTick(proximity.onInput(start(), { distance: 100 }), ctx).state.fsm).toBe("FAR");
  });

  it("re-arms after leaving the radius", () => {
    let state = start();
    const irqs: number[] = [];
    for (const distance of [20, 150, 30]) {
      const result = proximity.onTick(proximity.onInput(state, { distance }), ctx);
      state = result.state;
      irqs.push(result.effects.filter((e) => e.kind === "irq").length);
    }
    expect(irqs).toEqual([1, 0, 1]);
  });

  it("does nothing while nothing moves", () => {
    expect(proximity.onTick(start(), ctx).effects).toEqual([]);
  });

  it("describes itself for the dashboard", () => {
    const view = proximity.view({ fsm: "NEAR", radius: 100, distance: 42, approaches: 3, pendingWrite: false });
    expect(view).toEqual({ state: "NEAR", data: { distance: 42, radius: 100, approaches: 3 } });
    expect(statusPayload.safeParse({ ...view, label: "Proximity" }).success).toBe(true);
  });
});
