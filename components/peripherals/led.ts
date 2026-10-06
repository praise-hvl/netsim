// An LED: an output device. Every tick it reads its register byte and lights up when the byte
// is 128 or more (the top bit is set). The CPU never tells it "turn on"; a program just does
// `STORE R0, <register>` and the LED sees the new byte on its next read.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";

type LedFsmState = "OFF" | "ON";

export const ledFsm = defineFsm<LedFsmState>("LED", ["OFF", "ON"], "OFF", [
  { from: "OFF", to: "ON", on: "tick, register >= 128" },
  { from: "ON", to: "OFF", on: "tick, register < 128" },
]);

/** The smallest register value that lights the LED. */
export const LED_THRESHOLD = 128;

const configSchema = z.object({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ef4444") });
type LedConfig = z.infer<typeof configSchema>;

const stateSchema = z.object({
  fsm: z.enum(["OFF", "ON"]),
  color: z.string(),
  /** The register byte from the last read. */
  value: z.number().int().min(0).max(255),
});
type LedState = z.infer<typeof stateSchema>;

export const led: PeripheralDefinition<LedState, never, LedConfig> = {
  kind: "led",
  label: "LED",
  direction: "output",
  defaultPriority: 0,
  configSchema,
  // The LED takes no input from the dashboard: only its register controls it.
  inputSchema: z.never(),
  stateSchema,
  fsm: ledFsm,

  init: (config) => ({ fsm: "OFF", color: config.color, value: 0 }),

  onInput: (state) => state,

  onTick(state, { register }) {
    // Always read, so the reply is here for the next tick. The first tick has no reply yet.
    const effects = [{ kind: "read" as const }];
    if (register === null) return { state, effects };
    const fsm = register >= LED_THRESHOLD ? "ON" : "OFF";
    return { state: { ...state, fsm: ledFsm.go(state.fsm, fsm), value: register }, effects };
  },

  view(state) {
    return { state: state.fsm, data: { value: state.value, color: state.color } };
  },
};
