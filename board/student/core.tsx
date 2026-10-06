// Week 5: draw a CPU core and which step of its cycle it is on: fetch, decode or execute.
// `frame.cores` has every core's phase, PC, instruction and registers each tick. The week-5
// tests only check the two functions at the top; how the core looks is up to you.
import type { CoreFrame, Frame } from "@/board/feed/frames";
import { Box, Label } from "@/board/parts/box";
import { INK, coreColour } from "@/board/parts/colours";
import type { Rect } from "@/board/parts/geometry";
import { explainCore, explainPhase } from "@/board/parts/explain";
import { hex } from "@/protocol/memory-map";
import { todo } from "@/core/todo";
import { notBuilt } from "@/board/shell/layer";

export type CycleStep = "fetch" | "decode" | "execute" | "idle";

/**
 * The step of fetch -> decode -> execute a core in `phase` is on. Waiting for memory belongs
 * to the step that asked: WAIT_FETCH is still fetching, WAIT_DATA is still executing.
 */
export function cycleStep(phase: string): CycleStep {
  // @student week=5 part=class id=board-cycle-step "Map each core phase (FETCH, WAIT_FETCH, DECODE, ...) to fetch, decode, execute or idle"
  // TODO(week 5, board-cycle-step): Map each core phase (FETCH, WAIT_FETCH, DECODE, ...) to fetch, decode, execute or idle
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: board-cycle-step", phase);
  // @end
}

/** The address `core` asked for its next instruction from this tick, or null if it didn't fetch. */
export function fetchAddress(frame: Pick<Frame, "packets">, core: number): number | null {
  // @student week=5 part=home id=board-fetch-address "Find this core's instruction fetch (a 4-byte read) among the tick's packets"
  // TODO(week 5, board-fetch-address): Find this core's instruction fetch (a 4-byte read) among the tick's packets
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return todo("week 5: board-fetch-address", frame, core);
  // @end
}

export type CoreProps = { frame: Frame; core: CoreFrame; rect: Rect; colour?: string };

/** One core: its three steps with the current one lit, and what it is running. */
export function CoreView({ frame, core, rect, colour = coreColour(core.id) }: CoreProps) {
  // @student week=5 part=class id=board-draw-core "Draw one core: fetch, decode and execute with the current step lit, plus its program and PC"
  // TODO(week 5, board-draw-core): Draw one core: fetch, decode and execute with the current step lit, plus its program and PC
  // Tests: tests/week-05/   Guide: docs/weeks/week-05.md
  return notBuilt("week 5: board-draw-core", frame, core, rect, colour);
  // @end
}
