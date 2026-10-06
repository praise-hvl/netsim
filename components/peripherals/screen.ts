// A scrolling screen (stretch), like an oscilloscope. It reads its register every tick, and every
// `divider` ticks it adds that value as a new column on the right; the oldest column falls off
// the left. Point it at a sensor's register (copy the value in an ISR) to watch the signal move.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";

export const screenFsm = defineFsm<"DRAWING">("Screen", ["DRAWING"], "DRAWING", []);

const byte = z.number().int().min(0).max(255);

const configSchema = z.object({
  width: z.number().int().min(1).max(64).default(32),
  height: z.number().int().min(1).max(32).default(8),
  /** Scroll once every `divider` ticks; bigger is slower. */
  divider: z.number().int().min(1).default(2),
});
type ScreenConfig = z.infer<typeof configSchema>;

const inputSchema = z.object({ action: z.literal("clear") });
type ScreenInput = z.infer<typeof inputSchema>;

const stateSchema = z.object({
  fsm: z.literal("DRAWING"),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  divider: z.number().int().min(1),
  /** Ticks since the last scroll. */
  ticks: z.number().int().min(0),
  /** Register values, oldest first. At most `width` of them. */
  columns: z.array(byte),
});
type ScreenState = z.infer<typeof stateSchema>;

export const screen: PeripheralDefinition<ScreenState, ScreenInput, ScreenConfig> = {
  kind: "screen",
  label: "Screen",
  direction: "output",
  defaultPriority: 0,
  configSchema,
  inputSchema,
  stateSchema,
  fsm: screenFsm,

  init: ({ width, height, divider }) => ({ fsm: "DRAWING", width, height, divider, ticks: 0, columns: [] }),

  onInput: (state) => ({ ...state, columns: [] }),

  onTick(state, { register }) {
    const effects = [{ kind: "read" as const }];
    const ticks = state.ticks + 1;
    if (register === null || ticks < state.divider) return { state: { ...state, ticks }, effects };
    const columns = [...state.columns, register].slice(-state.width);
    return { state: { ...state, ticks: 0, columns }, effects };
  },

  view: (state) => ({ state: state.fsm, data: { columns: state.columns, height: state.height } }),
};
