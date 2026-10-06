// Week 3: draw memory and the bus, with packets travelling between the parts.
// The feed (board/feed) gives you one Frame per tick: `frame.packets` are the messages that
// tick carried and `frame.accesses` the memory reads and writes. Draw them your way; the
// week-3 tests only check the two functions at the top.
import type { Frame, Packet } from "@/board/feed/frames";
import { Box, Label } from "@/board/parts/box";
import { INK, coreColour } from "@/board/parts/colours";
import { MemoryGrid } from "@/board/parts/memory-grid";
import { explainCell } from "@/board/parts/explain";
import { PacketOnWire, Wire } from "@/board/parts/wire";
import { BUS_LINE, MEMORY_AREA, MEMORY_COLUMNS, partRects, pinOf, wireBetween } from "@/board/student/places";
import { MEMORY_SIZE } from "@/protocol/memory-map";
import { todo } from "@/core/todo";
import { notBuilt } from "@/board/shell/layer";

export type CellActivity = { kind: "read" | "write"; core: number | null; by: string };

/** Which memory cells were read or written this tick, by whom. A cell both read and written counts as written. */
export function cellActivity(frame: Pick<Frame, "accesses">): Map<number, CellActivity> {
  // @student week=3 part=class id=board-cell-activity "Turn this tick's memory accesses into one entry per cell touched"
  // TODO(week 3, board-cell-activity): Turn this tick's memory accesses into one entry per cell touched
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: board-cell-activity", frame);
  // @end
}

/**
 * How far along its wire `packet` is when the tick is `progress` (0..1) through: 0 just sent,
 * 1 arrived, null when it isn't on the wire. Answers can't set off before their question.
 */
export function packetProgress(packet: Packet, packets: readonly Packet[], progress: number): number | null {
  // @student week=3 part=home id=board-packet-progress "Decide when each packet of the tick travels: questions first, then answers"
  // TODO(week 3, board-packet-progress): Decide when each packet of the tick travels: questions first, then answers
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: board-packet-progress", packet, packets, progress);
  // @end
}

export type LayerProps = { frame: Frame; progress: number };

/** Memory: one cell per byte, lit by whoever reads or writes it. */
export function MemoryLayer({ frame }: LayerProps) {
  // @student week=3 part=class id=board-draw-memory "Draw memory as cells and light the ones read or written this tick"
  // TODO(week 3, board-draw-memory): Draw memory as cells and light the ones read or written this tick
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return notBuilt("week 3: board-draw-memory", frame);
  // @end
}

/** The bus and every part on it, with this tick's packets on their way. */
export function BusLayer({ frame, progress }: LayerProps) {
  // @student week=3 part=home id=board-draw-bus "Draw the bus and the parts on it, and move each packet along its wire"
  // TODO(week 3, board-draw-bus): Draw the bus and the parts on it, and move each packet along its wire
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return notBuilt("week 3: board-draw-bus", frame, progress);
  // @end
}
