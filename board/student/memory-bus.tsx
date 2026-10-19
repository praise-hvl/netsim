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
  const cells = new Map<number, CellActivity>();
  for (const access of frame.accesses) {
    for (let address = access.address; address < access.address + access.length && address < MEMORY_SIZE; address++) {
      if (cells.get(address)?.kind === "write") continue;
      cells.set(address, { kind: access.kind, core: access.core, by: access.by });
    }
  }
  return cells;
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
  const activity = cellActivity(frame);
  return (
    <g>
      <Label x={MEMORY_AREA.x + MEMORY_AREA.w / 2} y={MEMORY_AREA.y - 3} size={12} weight={700}>
        Memory · 1024 bytes
      </Label>
      <MemoryGrid
        rect={MEMORY_AREA}
        size={MEMORY_SIZE}
        columns={MEMORY_COLUMNS}
        colourOf={(address) => {
          const cell = activity.get(address);
          if (cell) return cell.core !== null ? coreColour(cell.core) : INK.yellow;
          return frame.memory[address] !== 0 ? "#8fb5a3" : null;
        }}
        titleOf={(address) => {
          const cell = activity.get(address);
          return explainCell(address, frame.memory[address], { read: cell?.kind === "read", written: cell?.kind === "write", by: cell?.by });
        }}
      />
    </g>
  );
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
