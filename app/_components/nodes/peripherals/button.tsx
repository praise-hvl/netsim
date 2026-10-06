// The Button: a real button that sends { action: "press" }. Its node flashes the irq edge.
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

export function ButtonView({ status, sendInput }: PeripheralViewProps) {
  const presses = typeof status.data.presses === "number" ? status.data.presses : 0;
  const pressed = status.state === "PRESSED";
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => sendInput({ action: "press" })}
        className={`nodrag h-10 w-10 rounded-full border-2 font-bold shadow transition-all ${
          pressed ? "translate-y-0.5 border-indigo-700 bg-indigo-600 text-white shadow-none" : "border-indigo-300 bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
        }`}
        title="Press"
      >
        ●
      </button>
      <div className="font-mono text-[10px] text-zinc-500">{presses} presses</div>
    </div>
  );
}
