// The timer: interrupts every `interval` ticks while COUNTING. Reads { interval, count, elapsed };
// sends { action: "start" | "stop" }.
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

export function TimerView({ status, sendInput }: PeripheralViewProps) {
  const { interval, count, elapsed } = status.data;
  const counting = status.state === "COUNTING";
  const progress = typeof interval === "number" && typeof elapsed === "number" && interval > 0 ? elapsed / interval : 0;
  return (
    <div className="w-44 space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full bg-green-500" style={{ width: `${Math.min(1, progress) * 100}%` }} />
      </div>
      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <span>every {String(interval ?? "?")} ticks · {String(count ?? 0)} irqs</span>
        <button
          className="nodrag rounded bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200"
          onClick={() => sendInput({ action: counting ? "stop" : "start" })}
        >
          {counting ? "Stop" : "Start"}
        </button>
      </div>
    </div>
  );
}
