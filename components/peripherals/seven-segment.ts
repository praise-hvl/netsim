// A three-digit seven-segment display (stretch). Every tick it reads its register byte and shows
// it in decimal, 0 to 255. Each digit is lit by turning on some of its seven segments:
//
//    aaa
//   f   b
//    ggg
//   e   c
//    ddd
import { z } from "zod";
import { defineFsm } from "@/core/fsm";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";

export const sevenSegmentFsm = defineFsm<"SHOWING">("SevenSegment", ["SHOWING"], "SHOWING", []);

/**
 * Which segments light up for each digit, one bit per segment: bit 0 = a ... bit 6 = g.
 * This table is what the decoder chip next to a real display holds.
 */
export const SEGMENTS: readonly number[] = [
  0b0111111, // 0: a b c d e f
  0b0000110, // 1: b c
  0b1011011, // 2: a b d e g
  0b1001111, // 3: a b c d g
  0b1100110, // 4: b c f g
  0b1101101, // 5: a c d f g
  0b1111101, // 6: a c d e f g
  0b0000111, // 7: a b c
  0b1111111, // 8: all
  0b1101111, // 9: a b c d f g
];

/** A byte is at most 255, so three digits always fit. */
export const DIGITS = 3;

const stateSchema = z.object({
  fsm: z.literal("SHOWING"),
  value: z.number().int().min(0).max(255),
});
type SevenSegmentState = z.infer<typeof stateSchema>;

/** 42 -> [0b0111111, 0b1100110, 0b1011011]: segment patterns for "042", left to right. */
export function toSegments(value: number): number[] {
  return String(value)
    .padStart(DIGITS, "0")
    .split("")
    .map((digit) => SEGMENTS[Number(digit)] ?? 0);
}

export const sevenSegment: PeripheralDefinition<SevenSegmentState, never, Record<string, never>> = {
  kind: "seven-segment",
  label: "Seven-segment display",
  direction: "output",
  defaultPriority: 0,
  configSchema: z.object({}).strict(),
  inputSchema: z.never(),
  stateSchema,
  fsm: sevenSegmentFsm,

  init: () => ({ fsm: "SHOWING", value: 0 }),

  onInput: (state) => state,

  onTick(state, { register }) {
    const effects = [{ kind: "read" as const }];
    if (register === null) return { state, effects };
    return { state: { ...state, value: register }, effects };
  },

  view: (state) => ({ state: state.fsm, data: { value: state.value, segments: toSegments(state.value) } }),
};
