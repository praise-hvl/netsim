// Week 7: draw every core as its own lane, the scheduler moving programs between cores, and
// interrupts arriving. The week-7 tests only check the three functions at the top; the look is
// yours. Until this week is built, the board falls back to week 5's single core.
import type { Frame } from "@/board/feed/frames";
import { Label } from "@/board/parts/box";
import { coreColour, INK } from "@/board/parts/colours";
import type { Rect } from "@/board/parts/geometry";
import { ISR_BASE, ISR_SLOT_SIZE, hex } from "@/protocol/memory-map";
import { CoreView } from "@/board/student/core";
import { todo } from "@/core/todo";
import { notBuilt } from "@/board/shell/layer";

/** `count` lanes that share `area` top to bottom, with a small gap, never overlapping. */
export function laneRects(count: number, area: Rect): Rect[] {
  // @student week=7 part=class id=board-lane-rects "Split the CPU area into one lane per core"
  // TODO(week 7, board-lane-rects): Split the CPU area into one lane per core
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-lane-rects", count, area);
  // @end
}

/** A program moving: onto a core (from null), off one (to null), or straight across. */
export type Move = { program: string; from: number | null; to: number | null };

/** What the scheduler changed between two ticks: every program whose core is different. */
export function schedulerMoves(previous: Pick<Frame, "processes">, frame: Pick<Frame, "processes">): Move[] {
  // @student week=7 part=home id=board-scheduler-moves "Compare the programs' cores between two ticks and list each move"
  // TODO(week 7, board-scheduler-moves): Compare the programs' cores between two ticks and list each move
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-scheduler-moves", previous, frame);
  // @end
}

/**
 * An interrupt, as one tick of the board can see it. A device's irq is "raised" on the bus in one
 * tick; a core "takes" it (starts running its handler) a tick or more later, as soon as a core is
 * between instructions. Never in the same tick. In between, `frame.pendingIrqs` counts the
 * interrupts waiting for a core.
 */
export type InterruptMarker =
  | { kind: "raised"; from: string; vector: number }
  | { kind: "taken"; core: number; vector: number };

/** The handler a core is running: the start of its handler slot (0x200, 0x220, ...). */
function handlerOf(pc: number): number {
  return ISR_BASE + Math.floor((pc - ISR_BASE) / ISR_SLOT_SIZE) * ISR_SLOT_SIZE;
}

export function interruptMarkers(previous: Pick<Frame, "cores"> | null, frame: Pick<Frame, "packets" | "cores">): InterruptMarker[] {
  // @student week=7 part=class id=board-interrupt-markers "A marker for each irq raised on the bus this tick, and one for each core that started a handler this tick"
  // TODO(week 7, board-interrupt-markers): A marker for each irq raised on the bus this tick, and one for each core that started a handler this tick
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return todo("week 7: board-interrupt-markers", previous, frame);
  // @end
}

export type CoresProps = { frame: Frame; previous: Frame | null; rect: Rect };

/** Every core in its own lane, the latest scheduler moves, and any interrupt arriving. */
export function CoresView({ frame, previous, rect }: CoresProps) {
  // @student week=7 part=home id=board-draw-cores "Draw one lane per core, and show the scheduler's moves and arriving interrupts"
  // TODO(week 7, board-draw-cores): Draw one lane per core, and show the scheduler's moves and arriving interrupts
  // Tests: tests/week-07/   Guide: docs/weeks/week-07.md
  return notBuilt("week 7: board-draw-cores", frame, previous, rect);
  // @end
}
