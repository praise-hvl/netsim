// A periodic timer: while COUNTING it raises one interrupt every `interval` ticks. It is just a
// device that interrupts on a schedule; the ISR decides what that means.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";

type TimerFsmState = "STOPPED" | "COUNTING";

export const timerFsm = defineFsm<TimerFsmState>("Timer", ["STOPPED", "COUNTING"], "STOPPED", [
  { from: "STOPPED", to: "COUNTING", on: "input start" },
  { from: "COUNTING", to: "STOPPED", on: "input stop" },
]);

const configSchema = z.object({
  // The default handler (programs/isr-counter.asm) takes 22 ticks. Much below that, the handler
  // runs more often than it can finish and the programs starve; 30 leaves them room to run.
  interval: z.number().int().min(1).default(30),
  /** Start counting as soon as the timer is added, without waiting for a "start". */
  running: z.boolean().default(true),
});
type TimerConfig = z.infer<typeof configSchema>;

const inputSchema = z.object({ action: z.enum(["start", "stop"]) });
type TimerInput = z.infer<typeof inputSchema>;

const stateSchema = z.object({
  fsm: z.enum(["STOPPED", "COUNTING"]),
  interval: z.number().int().min(1),
  /** Ticks counted since the last interrupt. */
  elapsed: z.number().int().min(0),
  /** Interrupts raised so far. */
  count: z.number().int().min(0),
});
type TimerState = z.infer<typeof stateSchema>;

export const timer: PeripheralDefinition<TimerState, TimerInput, TimerConfig> = {
  kind: "timer",
  label: "Timer",
  direction: "input",
  // Less urgent than the Button (0): a person notices a late button, nobody notices a late tick.
  defaultPriority: 2,
  configSchema,
  inputSchema,
  stateSchema,
  fsm: timerFsm,

  init: (config) => ({
    fsm: config.running ? "COUNTING" : "STOPPED",
    interval: config.interval,
    elapsed: 0,
    count: 0,
  }),

  onInput(state, input) {
    // @student week=7 part=home id=timer-input "Start or stop the timer; stopping forgets the ticks counted so far"
    // TODO(week 7, timer-input): Start or stop the timer; stopping forgets the ticks counted so far
    // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
    // Until week 7 the timer ignores start and stop.
    return state;
    // @end
  },

  onTick(state) {
    // @student week=7 part=home id=timer-tick "While COUNTING, raise one irq every `interval` ticks"
    // TODO(week 7, timer-tick): While COUNTING, raise one irq every `interval` ticks
    // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
    // Until week 7 the timer never fires.
    return { state, effects: [] };
    // @end
  },

  view: (state) => ({
    state: state.fsm,
    data: { interval: state.interval, count: state.count, elapsed: state.elapsed },
  }),
};
