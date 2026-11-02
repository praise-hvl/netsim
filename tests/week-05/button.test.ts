import { describe, expect, it } from "vitest";
import { button } from "@/components/peripherals/button";
import { statusPayload } from "@/protocol/messages";

const ctx = { tick: 1, register: null };

describe("button", () => {
  it("starts released and does nothing on a tick", () => {
    const state = button.init({});
    expect(button.onTick(state, ctx)).toEqual({ state, effects: [] });
  });

  it("raises exactly one interrupt the tick after a press", () => {
    const pressed = button.onInput(button.init({}), { action: "press" });
    expect(pressed).toEqual({ fsm: "PRESSED", presses: 1 });

    const first = button.onTick(pressed, ctx);
    expect(first.effects).toEqual([{ kind: "irq" }]);
    expect(first.state.fsm).toBe("RELEASED");

    expect(button.onTick(first.state, ctx).effects).toEqual([]);
  });

  it("treats a double press within one tick as one press", () => {
    const once = button.onInput(button.init({}), { action: "press" });
    expect(button.onInput(once, { action: "press" })).toEqual(once);
  });

  it("describes itself for the dashboard", () => {
    const view = button.view({ fsm: "PRESSED", presses: 2 });
    expect(view).toEqual({ state: "PRESSED", data: { presses: 2 } });
    expect(statusPayload.safeParse({ ...view, label: "Button" }).success).toBe(true);
  });

  it("only moves along its transition table", () => {
    expect(button.fsm.states).toEqual(["RELEASED", "PRESSED"]);
    expect(button.fsm.canGo("RELEASED", "PRESSED")).toBe(true);
  });
});
