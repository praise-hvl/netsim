// The screen: a scrolling trace of its register byte. Each column is one sample (oldest on the
// left); the lit pixel's height is the value. Reads { columns, height?, width? }; sends { action: "clear" }.
import { z } from "zod";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

const screenData = z.object({
  columns: z.array(z.number().int().min(0).max(255)),
  height: z.number().int().min(1).max(32).optional(),
  width: z.number().int().min(1).max(64).optional(),
});

/** Used when the screen doesn't report its width. */
const DEFAULT_WIDTH = 32;
const PIXEL = 6;

export function ScreenView({ status, sendInput }: PeripheralViewProps) {
  const parsed = screenData.safeParse(status.data);
  if (!parsed.success) return <div className="italic text-zinc-400">no picture yet</div>;
  const height = parsed.data.height ?? 8;
  const width = parsed.data.width ?? DEFAULT_WIDTH;
  const columns = parsed.data.columns.slice(-width);
  const padded = [...Array<number | null>(width - columns.length).fill(null), ...columns];
  return (
    <div className="space-y-1">
      <div
        className="grid rounded border border-zinc-700 bg-slate-950"
        style={{ gridTemplateColumns: `repeat(${width}, ${PIXEL}px)`, gridTemplateRows: `repeat(${height}, ${PIXEL}px)` }}
      >
        {Array.from({ length: height }, (_, row) =>
          padded.map((value, col) => {
            // Row 0 is the top, so the highest values light the top row.
            const litRow = value === null ? -1 : height - 1 - Math.floor((value * height) / 256);
            return <div key={`${row}-${col}`} className={row === litRow ? "bg-emerald-400" : ""} />;
          }),
        )}
      </div>
      <button
        className="nodrag rounded bg-zinc-100 px-2 py-0.5 text-[10px] hover:bg-zinc-200"
        onClick={() => sendInput({ action: "clear" })}
      >
        Clear
      </button>
    </div>
  );
}
