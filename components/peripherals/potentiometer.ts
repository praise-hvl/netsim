// A potentiometer (a knob) that reads 0-255. While someone is turning it the value jumps around,
// so it waits until the value has stopped changing for `settleTicks` ticks, then writes it to its
// register and raises one interrupt. Waiting for an input to go quiet is called debouncing.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { Json } from "@/protocol/messages";
import type { PeripheralDefinition, PeripheralEffect } from "@/components/peripherals/peripheral";
import { todo } from "@/core/todo";

type PotentiometerFsmState = "STABLE" | "SETTLING";

export const potentiometerFsm = defineFsm<PotentiometerFsmState>(
  "Potentiometer",
  ["STABLE", "SETTLING"],
  "STABLE",
  [
    { from: ["STABLE", "SETTLING"], to: "SETTLING", on: "input new value" },
    { from: "SETTLING", to: "STABLE", on: "tick, quiet for settleTicks / write + irq" },
  ],
);

const byte = z.number().int().min(0).max(255);

const configSchema = z.object({ settleTicks: z.number().int().min(1).default(3) });
type PotentiometerConfig = z.infer<typeof configSchema>;

const inputSchema = z.object({ value: byte });
type PotentiometerInput = z.infer<typeof inputSchema>;

/** What a save file holds. */
const savedSchema = z.object({
  fsm: z.enum(["STABLE", "SETTLING"]),
  settleTicks: z.number().int().min(1),
  value: byte,
  /** Ticks since the value last changed. Only counts while SETTLING. */
  quietTicks: z.number().int().min(0),
  settles: z.number().int().min(0),
});

const stateSchema = savedSchema.extend({
  /** The register doesn't hold the starting value yet (only true before the first tick). */
  pendingWrite: z.boolean(),
});
type PotentiometerState = z.infer<typeof stateSchema>;

export const potentiometer: PeripheralDefinition<PotentiometerState, PotentiometerInput, PotentiometerConfig> = {
  kind: "potentiometer",
  label: "Potentiometer",
  direction: "input",
  defaultPriority: 2,
  configSchema,
  inputSchema,
  stateSchema,
  fsm: potentiometerFsm,

  // pendingWrite: the slot may have held another device, so don't trust the register to be 0.
  init: (config) => ({ fsm: "STABLE", settleTicks: config.settleTicks, value: 0, quietTicks: 0, settles: 0, pendingWrite: true }),

  onInput(state, input) {
    // @student week=stretch part=home id=potentiometer-input "Store the new value and (re)start settling"
    // TODO(stretch, potentiometer-input): Store the new value and (re)start settling
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: potentiometer-input", state, input);
    // @end
  },

  onTick(state) {
    // @student week=stretch part=home id=potentiometer-tick "Write the starting value at power-on; once the value has been quiet for settleTicks, write it and raise one irq"
    // TODO(stretch, potentiometer-tick): Write the starting value at power-on; once the value has been quiet for settleTicks, write it and raise one irq
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: potentiometer-tick", state);
    // @end
  },

  view(state) {
    // @student week=stretch part=home id=potentiometer-view "Show the value and how many times the knob settled"
    // TODO(stretch, potentiometer-view): Show the value and how many times the knob settled
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: potentiometer-view", state);
    // @end
  },

  snapshot,
  restore,
};

export function snapshot(state: PotentiometerState): Json {
  // @student week=stretch part=home id=potentiometer-snapshot "Save everything the knob needs to finish settling after a restore"
  // TODO(stretch, potentiometer-snapshot): Save everything the knob needs to finish settling after a restore
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: potentiometer-snapshot", state);
  // @end
}

export function restore(data: unknown): PotentiometerState {
  // @student week=stretch part=home id=potentiometer-restore "Validate a saved potentiometer (it is untrusted input) and rebuild its state"
  // TODO(stretch, potentiometer-restore): Validate a saved potentiometer (it is untrusted input) and rebuild its state
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: potentiometer-restore", data);
  // @end
}
