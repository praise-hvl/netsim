// Memory as a grid of cells, `columns` bytes to a row (16 makes it read like a hex dump).
// You decide each cell's colour; `gridCell` tells you where any byte is drawn.
import { memo } from "react";
import { screenRect, type Rect } from "@/board/parts/geometry";
import { INK } from "@/board/parts/colours";
import { explainCell } from "@/board/parts/explain";

export type MemoryGridProps = {
  rect: Rect;
  /** How many bytes to draw, from address 0. */
  size: number;
  columns: number;
  /** A cell's colour, or null for an unlit cell. */
  colourOf: (address: number) => string | null;
  /** Hover text for a cell (shown in the board's popover); by default its address. */
  titleOf?: (address: number) => string;
};

/** The rectangle of byte `address` in a grid of `size` bytes, `columns` to a row, filling `rect`. */
export function gridCell(rect: Rect, size: number, columns: number, address: number): Rect {
  const rows = Math.ceil(size / columns);
  const w = rect.w / columns;
  const h = rect.h / rows;
  return { x: rect.x + (address % columns) * w, y: rect.y + Math.floor(address / columns) * h, w, h };
}

export const MemoryGrid = memo(function MemoryGrid({ rect, size, columns, colourOf, titleOf }: MemoryGridProps) {
  return (
    <g>
      <rect {...screenRect(rect)} fill={INK.darkGreen} stroke={INK.outline} strokeWidth={1.4} />
      {Array.from({ length: size }, (_, address) => {
        const cell = screenRect(gridCell(rect, size, columns, address));
        const colour = colourOf(address);
        return (
          <rect
            key={address}
            x={cell.x + 0.5}
            y={cell.y + 0.5}
            width={cell.width - 1}
            height={cell.height - 1}
            fill={colour ?? "#24493a"}
            stroke={colour ? INK.white : "none"}
            strokeWidth={0.8}
            data-explain={titleOf ? titleOf(address) : explainCell(address, undefined)}
          />
        );
      })}
    </g>
  );
});
