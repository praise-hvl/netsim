import { describe, expect, it } from "vitest";
import { potentiometer } from "@/components/peripherals/potentiometer";
import { statusPayload } from "@/protocol/messages";
import { notChosen } from "@/tests/course";

const ctx = { tick: 1, register: null };
const init = () => potentiometer.init({ settleTicks: 3 });
/** Powered on: the first tick has put the starting value in the register. */
const start = () => potentiometer.onTick(init(), ctx).state;

type State = ReturnType<typeof init>;

/** Apply one optional input, then one tick. Returns the new state and whether it wrote/irq'd. */
function step(state: State, value?: number) {
  const input = value === undefined ? state : potentiometer.onInput(state, { value });
  return potentiometer.onTick(input, ctx);
}

describe.skipIf(notChosen("potentiometer"))("potentiometer", () => {
  it("writes its starting value once at power-on, without an irq", () => {
    const first = step(init());
    expect(first.effects).toEqual([{ kind: "write", value: 0 }]);
    expect(first.state).toMatchObject({ fsm: "STABLE", pendingWrite: false });
    expect(step(first.state)).toEqual({ state: first.state, effects: [] });
  });

  it("writes the value and raises one irq after 3 quiet ticks", () => {
    const moved = step(start(), 200);
    expect(moved.state.fsm).toBe("SETTLING");
    expect(moved.effects).toEqual([]);

    const second = step(moved.state);
    expect(second.effects).toEqual([]);

    const third = step(second.state);
    expect(third.effects).toEqual([{ kind: "write", value: 200 }, { kind: "irq" }]);
    expect(third.state).toMatchObject({ fsm: "STABLE", settles: 1 });

    expect(step(third.state).effects).toEqual([]);
  });

  it("waits while the knob keeps turning, and reports only the final value", () => {
    let state = start();
    const effects = [];
    for (const value of [10, 20, 30, 40]) {
      const result = step(state, value);
      state = result.state;
      effects.push(...result.effects);
    }
    expect(effects).toEqual([]);

    state = step(step(state).state).state;
    expect(state.settles).toBe(1);
    expect(step(potentiometer.onInput(start(), { value: 40 })).state.value).toBe(40);
  });

  it("ignores a 'change' to the same value", () => {
    expect(potentiometer.onInput(start(), { value: 0 })).toEqual(start());
  });

  it("describes itself for the dashboard", () => {
    const view = potentiometer.view({ fsm: "SETTLING", settleTicks: 3, value: 128, quietTicks: 1, settles: 4, pendingWrite: false });
    expect(view).toEqual({ state: "SETTLING", data: { value: 128, settles: 4 } });
    expect(statusPayload.safeParse({ ...view, label: "Potentiometer" }).success).toBe(true);
  });
});
