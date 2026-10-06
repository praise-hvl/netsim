// The potentiometer: a knob (here a slider) whose value 0-255 the device writes to its register.
// Reads { value }; sends { value }.
import { useState } from "react";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

export function PotentiometerView({ status, sendInput }: PeripheralViewProps) {
  const reported = typeof status.data.value === "number" ? status.data.value : 0;
  // While dragging, show where the knob is; the device's own value catches up on its next tick.
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? reported;
  return (
    <div className="nodrag nowheel w-44 space-y-1">
      <input
        type="range"
        min={0}
        max={255}
        value={shown}
        onChange={(e) => {
          const value = Number(e.target.value);
          setDragging(value);
          sendInput({ value });
        }}
        onPointerUp={() => setDragging(null)}
          onKeyUp={() => setDragging(null)}
          onBlur={() => setDragging(null)}
        className="w-full accent-amber-500"
      />
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full bg-amber-400" style={{ width: `${(reported / 255) * 100}%` }} />
        </div>
        <span className="w-7 text-right font-mono text-[10px] tabular-nums">{reported}</span>
      </div>
    </div>
  );
}
