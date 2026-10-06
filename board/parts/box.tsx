// The sketch look, flat: a colour shape nudged a little off its black outline, optionally over
// a hard black drop shadow. Use Box for any part, Label for text, Glow to point at something.
import type { ReactNode } from "react";
import { screenRect, toScreen, type Rect } from "@/board/parts/geometry";
import { INK } from "@/board/parts/colours";

/** How far the colour sits from its outline, in pixels (the hand-drawn offset). */
const OFFSET = { x: -2.5, y: 2 };

export type BoxProps = {
  rect: Rect;
  fill: string;
  stroke?: string;
  /** Outline width in pixels. */
  width?: number;
  radius?: number;
  /** Drop shadow offset in pixels; 0 for none. */
  shadow?: number;
  opacity?: number;
  /** What this part is, shown in a popover when someone hovers it (the board pauses meanwhile). */
  explain?: string;
};

export function Box({ rect, fill, stroke = INK.outline, width = 1.6, radius = 2, shadow = 0, opacity = 1, explain }: BoxProps) {
  const r = screenRect(rect);
  return (
    <g opacity={opacity} data-explain={explain}>
      {shadow > 0 && <rect {...r} x={r.x + shadow} y={r.y + shadow} rx={radius} fill={INK.outline} />}
      {shadow > 0 && <rect {...r} rx={radius} fill={INK.white} />}
      <rect {...r} rx={radius} fill={fill} transform={`translate(${OFFSET.x} ${OFFSET.y})`} />
      <rect {...r} rx={radius} fill="none" stroke={stroke} strokeWidth={width} />
    </g>
  );
}

/** Text at a board point. */
export function Label({ x, y, children, size = 11, weight = 600, fill = INK.outline, anchor = "middle" }: { x: number; y: number; children: ReactNode; size?: number; weight?: number; fill?: string; anchor?: "start" | "middle" | "end" }) {
  const p = toScreen({ x, y });
  return (
    <text x={p.x} y={p.y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor} dominantBaseline="middle" style={{ pointerEvents: "none" }}>
      {children}
    </text>
  );
}

/** A yellow ring around a rectangle. */
export function Glow({ rect, grow = 1.2 }: { rect: Rect; grow?: number }) {
  const r = screenRect({ x: rect.x - grow, y: rect.y - grow, w: rect.w + 2 * grow, h: rect.h + 2 * grow });
  return <rect {...r} rx={4} fill="none" stroke={INK.yellow} strokeWidth={5} opacity={0.95} style={{ pointerEvents: "none" }} />;
}

/**
 * An invisible area that catches clicks, e.g. so clicking a part's label counts as clicking
 * the part (labels let clicks pass through).
 */
export function HitArea({ rect }: { rect: Rect }) {
  return <rect {...screenRect(rect)} fill="transparent" />;
}
