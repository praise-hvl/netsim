// Board geometry. A board is flat and seen from straight above: positions are in board units
// (x to the right, y down) and `toScreen` scales them to SVG pixels. Pure math, no React.

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** SVG pixels per board unit. Text sizes are in pixels, so this sets how big parts are next to their labels. */
export const SCALE = 4.6;

export function toScreen(p: Point): Point {
  return { x: p.x * SCALE, y: p.y * SCALE };
}

/** A board rectangle as SVG <rect> attributes. */
export function screenRect(r: Rect): { x: number; y: number; width: number; height: number } {
  return { x: r.x * SCALE, y: r.y * SCALE, width: r.w * SCALE, height: r.h * SCALE };
}

export function centreOf(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** The point `t` (0..1) of the way along a path of straight pieces, measured by distance. */
export function pointAlong(path: readonly Point[], t: number): Point {
  const lengths = path.slice(1).map((p, i) => Math.hypot(p.x - path[i].x, p.y - path[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return path[0];
  let left = Math.min(1, Math.max(0, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] === 0 ? 0 : Math.min(1, left / lengths[i]);
      return { x: path[i].x + (path[i + 1].x - path[i].x) * f, y: path[i].y + (path[i + 1].y - path[i].y) * f };
    }
    left -= lengths[i];
  }
  return path[path.length - 1];
}
