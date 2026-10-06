// Stretch: the scrolling screen.
import { describe, expect, it } from "vitest";
import { screen } from "@/components/peripherals/screen";
import { statusPayload } from "@/protocol/messages";

type State = ReturnType<typeof screen.init>;

function feed(state: State, registers: number[]): State {
  for (const [i, register] of registers.entries()) state = screen.onTick(state, { tick: i + 1, register }).state;
  return state;
}

describe("screen", () => {
  it("adds one column every `divider` ticks, oldest first", () => {
    const state = feed(screen.init({ width: 4, height: 8, divider: 2 }), [10, 20, 30, 40, 50, 60]);
    expect(state.columns).toEqual([20, 40, 60]);
  });

  it("drops the oldest column once it is full", () => {
    const state = feed(screen.init({ width: 3, height: 8, divider: 1 }), [1, 2, 3, 4, 5]);
    expect(state.columns).toEqual([3, 4, 5]);
  });

  it("reads its register every tick", () => {
    const init = screen.init({ width: 3, height: 8, divider: 5 });
    expect(screen.onTick(init, { tick: 1, register: null }).effects).toEqual([{ kind: "read" }]);
  });

  it("clears from the dashboard", () => {
    const full = feed(screen.init({ width: 3, height: 8, divider: 1 }), [1, 2]);
    expect(screen.onInput(full, { action: "clear" }).columns).toEqual([]);
  });

  it("describes itself for the dashboard", () => {
    const view = screen.view(feed(screen.init({ width: 3, height: 8, divider: 1 }), [9]));
    expect(view).toEqual({ state: "DRAWING", data: { columns: [9], height: 8 } });
    expect(statusPayload.safeParse({ ...view, label: "Screen" }).success).toBe(true);
  });
});
