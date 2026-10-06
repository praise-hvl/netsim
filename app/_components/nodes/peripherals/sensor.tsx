// The temperature sensor: drag the reading; it interrupts when it rises above the threshold.
// Reads { value, threshold }; sends { value }.
import { useState } from "react";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

export function SensorView({ status, sendInput }: PeripheralViewProps) {
  const reported = typeof status.data.value === "number" ? status.data.value : 0;
  const [dragging, setDragging] = useState<number | null>(null);
  const threshold = typeof status.data.threshold === "number" ? status.data.threshold : null;
  return (
    <div className="nodrag nowheel w-44 space-y-1">
      <div className="relative">
        <input
          type="range"
          min={0}
          max={255}
          value={dragging ?? reported}
          onChange={(e) => {
            const value = Number(e.target.value);
            setDragging(value);
            sendInput({ value });
          }}
          onPointerUp={() => setDragging(null)}
          onKeyUp={() => setDragging(null)}
          onBlur={() => setDragging(null)}
          className="w-full accent-rose-500"
        />
        {threshold !== null && (
          <div className="pointer-events-none absolute top-0 h-full w-0.5 bg-rose-300" style={{ left: `${(threshold / 255) * 100}%` }} title="threshold" />
        )}
      </div>
      <div className="flex justify-between font-mono text-[10px] text-zinc-500">
        <span>value {reported}</span>
        {threshold !== null && <span>threshold {threshold}</span>}
      </div>
    </div>
  );
}
