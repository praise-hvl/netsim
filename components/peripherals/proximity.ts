// A proximity sensor. The dashboard reports how far the mouse is from the sensor's node; the
// sensor writes that distance to its register (capped at 255) and raises an interrupt when
// something comes inside its radius. Staying inside doesn't interrupt again; leaving re-arms it.
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { Json } from "@/protocol/messages";
import type { PeripheralDefinition, PeripheralEffect } from "@/components/peripherals/peripheral";
import { todo } from "@/core/todo";

type ProximityFsmState = "FAR" | "NEAR";

export const proximityFsm = defineFsm<ProximityFsmState>("Proximity", ["FAR", "NEAR"], "FAR", [
  { from: "FAR", to: "NEAR", on: "tick, distance < radius / irq" },
  { from: "NEAR", to: "FAR", on: "tick, distance >= radius" },
]);

/** A register is one byte, so every distance from 255 up reads as 255 ("far away"). */
export const MAX_DISTANCE = 255;

const configSchema = z.object({ radius: z.number().int().min(1).max(MAX_DISTANCE).default(100) });
type ProximityConfig = z.infer<typeof configSchema>;

const inputSchema = z.object({ distance: z.number().min(0) });
type ProximityInput = z.infer<typeof inputSchema>;

const savedSchema = z.object({
  fsm: z.enum(["FAR", "NEAR"]),
  radius: z.number().int().min(1).max(MAX_DISTANCE),
  distance: z.number().int().min(0).max(MAX_DISTANCE),
  approaches: z.number().int().min(0),
});

const stateSchema = savedSchema.extend({
  /** The distance changed and the register doesn't show it yet. */
  pendingWrite: z.boolean(),
});
type ProximityState = z.infer<typeof stateSchema>;

export const proximity: PeripheralDefinition<ProximityState, ProximityInput, ProximityConfig> = {
  kind: "proximity",
  label: "Proximity sensor",
  direction: "input",
  defaultPriority: 1,
  configSchema,
  inputSchema,
  stateSchema,
  fsm: proximityFsm,

  // Nothing is near at power-on, and the register should say so from tick 1.
  init: (config) => ({ fsm: "FAR", radius: config.radius, distance: MAX_DISTANCE, approaches: 0, pendingWrite: true }),

  onInput(state, input) {
    // @student week=stretch part=home id=proximity-input "Store the new distance as a whole number from 0 to 255"
    // TODO(stretch, proximity-input): Store the new distance as a whole number from 0 to 255
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: proximity-input", state, input);
    // @end
  },

  onTick(state) {
    // @student week=stretch part=home id=proximity-tick "Write a changed distance to the register; irq when something comes inside the radius"
    // TODO(stretch, proximity-tick): Write a changed distance to the register; irq when something comes inside the radius
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: proximity-tick", state);
    // @end
  },

  view(state) {
    // @student week=stretch part=home id=proximity-view "Show the distance, the radius and how many times something came near"
    // TODO(stretch, proximity-view): Show the distance, the radius and how many times something came near
    // Tests: tests/stretch/   Guide: docs/stretch/
    return todo("stretch: proximity-view", state);
    // @end
  },

  snapshot,
  restore,
};

export function snapshot(state: ProximityState): Json {
  // @student week=stretch part=home id=proximity-snapshot "Keep what the sensor needs to carry on; leave out what it doesn't"
  // TODO(stretch, proximity-snapshot): Keep what the sensor needs to carry on; leave out what it doesn't
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: proximity-snapshot", state);
  // @end
}

export function restore(data: unknown): ProximityState {
  // @student week=stretch part=home id=proximity-restore "Validate a saved proximity sensor (it is untrusted input) and rebuild its state"
  // TODO(stretch, proximity-restore): Validate a saved proximity sensor (it is untrusted input) and rebuild its state
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: proximity-restore", data);
  // @end
}
