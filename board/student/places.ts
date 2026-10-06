// Where things sit on YOUR board, in board units (x to the right, y down). This is a plain
// starting layout: move things, resize them, add parts. Your design note decides; the tests
// never look at positions.
import type { Frame } from "@/board/feed/frames";
import { OUTSIDE } from "@/board/feed/frames";
import type { Point, Rect } from "@/board/parts/geometry";

export const BOARD_SIZE = { w: 200, h: 124 };

export const CPU_AREA: Rect = { x: 6, y: 6, w: 84, h: 70 };
export const MEMORY_AREA: Rect = { x: 104, y: 10, w: 90, h: 62 };
/** Memory drawn 32 bytes to a row: 32 rows for 1024 bytes. */
export const MEMORY_COLUMNS = 32;

/** The bus: one long wire every message travels along. */
export const BUS_Y = 88;
const BUS_FROM = 6;
const BUS_TO = 194;
const ROW_Y = 98;
const PART = { w: 22, h: 16 };

/** The parts on the bus: CPU, memory, every peripheral, and "you" (the dashboard and host). */
export function partRects(frame: Pick<Frame, "parts">): Map<string, Rect> {
  const rects = new Map<string, Rect>([
    ["cpu", CPU_AREA],
    ["memory", MEMORY_AREA],
  ]);
  const row = [OUTSIDE, ...Object.values(frame.parts).filter((p) => p.role === "peripheral").map((p) => p.id).sort()];
  const step = (BUS_TO - BUS_FROM) / row.length;
  row.forEach((id, i) => rects.set(id, { x: BUS_FROM + i * step + (step - PART.w) / 2, y: ROW_Y, w: PART.w, h: PART.h }));
  return rects;
}

/** Where a part's wire meets it: the middle of its edge that faces the bus. */
export function pinOf(rect: Rect): Point {
  const above = rect.y + rect.h <= BUS_Y;
  return { x: rect.x + rect.w / 2, y: above ? rect.y + rect.h : rect.y };
}

/** A message's path: from the sender down to the bus, along it, and up to the receiver. */
export function wireBetween(from: Rect, to: Rect): Point[] {
  const a = pinOf(from);
  const b = pinOf(to);
  return [a, { x: a.x, y: BUS_Y }, { x: b.x, y: BUS_Y }, b];
}

export const BUS_LINE: Point[] = [{ x: BUS_FROM, y: BUS_Y }, { x: BUS_TO, y: BUS_Y }];
