// Where nodes go the first time they appear, and which edges to draw. Pure functions of the
// system state; the canvas only adds "keep the position the user dragged it to".
import type { Edge, XYPosition } from "@xyflow/react";
import type { ComponentEntry, Link } from "@/app/_lib/system-state";
import { isHot } from "@/app/_lib/system-state";

const CPU_AT: XYPosition = { x: 0, y: 0 };
const MEMORY_AT: XYPosition = { x: 0, y: 360 };
const INPUT_ROW_Y = -260;
const OUTPUT_COLUMN_X = 520;
const GAP_X = 240;
const GAP_Y = 190;

/** Which line a peripheral is drawn on: inputs above the CPU, outputs right of Memory. */
export type Lane = "input" | "output";

/**
 * Inputs (they interrupt the CPU) go in a row above the CPU, left to right; outputs (they read
 * memory) in a column to the right of Memory, top to bottom. `place` is the peripheral's spot
 * in its lane. A component's own `status.position` wins.
 */
export function defaultPosition(entry: ComponentEntry, lane: Lane, place: number): XYPosition {
  if (entry.status?.position) return entry.status.position;
  if (entry.info.role === "cpu") return CPU_AT;
  if (entry.info.role === "memory") return MEMORY_AT;
  if (lane === "output") return { x: OUTPUT_COLUMN_X, y: MEMORY_AT.y - 120 + place * GAP_Y };
  return { x: CPU_AT.x + place * GAP_X, y: INPUT_ROW_Y };
}

/** The first spot in a lane nobody holds, so a newcomer never lands on a node already drawn. */
export function freePlace(taken: Iterable<number>): number {
  const used = new Set(taken);
  let place = 0;
  while (used.has(place)) place++;
  return place;
}

const EDGE_COLORS = { mem: "#3b82f6", irq: "#ef4444", other: "#a1a1aa" };

type Endpoint = { node: string; handle: string };

/**
 * One edge per pair of components, whichever way the messages went. Peripherals always sit
 * at the source end, and the CPU at the source end of the CPU-Memory edge.
 */
export function edgesFor(links: Record<string, Link>, roles: Record<string, string>, tick: number): Edge[] {
  const pairs = new Map<string, { source: Endpoint; target: Endpoint; links: Link[] }>();
  for (const link of Object.values(links)) {
    const ends = orient(link.from, link.to, roles);
    if (!ends) continue;
    const key = `${ends.source.node}>${ends.target.node}`;
    const pair = pairs.get(key) ?? { ...ends, links: [] };
    pair.links.push(link);
    pairs.set(key, pair);
  }

  return [...pairs.entries()].map(([key, { source, target, links: pairLinks }]) => {
    const latest = pairLinks.reduce((a, b) => (b.lastSeq > a.lastSeq ? b : a));
    const hot = pairLinks.some((link) => isHot(link, tick));
    const family = latest.lastType.startsWith("mem.") ? "mem" : latest.lastType === "irq" ? "irq" : "other";
    return {
      id: key,
      source: source.node,
      sourceHandle: source.handle,
      target: target.node,
      targetHandle: target.handle,
      type: "smoothstep",
      label: latest.lastType,
      animated: hot,
      style: { stroke: EDGE_COLORS[family], strokeWidth: hot ? 3 : 1.5, opacity: hot ? 1 : 0.45 },
      labelStyle: { fontSize: 10, fontFamily: "var(--font-mono)", fill: EDGE_COLORS[family] },
    };
  });
}

function orient(a: string, b: string, roles: Record<string, string>): { source: Endpoint; target: Endpoint } | null {
  const pair = (from: string, to: string) => {
    const fromRole = roles[from];
    const toRole = roles[to];
    if (fromRole === "cpu" && toRole === "memory") return { source: { node: from, handle: "to-memory" }, target: { node: to, handle: "from-cpu" } };
    if (fromRole === "peripheral" && toRole === "cpu") return { source: { node: from, handle: "to-cpu" }, target: { node: to, handle: "from-peripheral" } };
    if (fromRole === "peripheral" && toRole === "memory") return { source: { node: from, handle: "to-memory" }, target: { node: to, handle: "from-peripheral" } };
    return null;
  };
  return pair(a, b) ?? pair(b, a);
}
