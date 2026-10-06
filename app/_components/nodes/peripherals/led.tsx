// The LED: lit when its register byte is 128 or more. Reads { value, color } from its status.
import { z } from "zod";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

const ledData = z.object({
  value: z.number().int().min(0).max(255),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#ef4444"),
});

export function LedView({ status }: PeripheralViewProps) {
  const on = status.state === "ON";
  const parsed = ledData.safeParse(status.data);
  const color = parsed.success ? parsed.data.color : "#ef4444";
  return (
    <div className="flex items-center gap-3 py-1">
      <div
        aria-label={on ? "LED on" : "LED off"}
        className="h-9 w-9 rounded-full border border-white/40 transition-all duration-150"
        style={{ backgroundColor: color, opacity: on ? 1 : 0.15, boxShadow: on ? `0 0 18px 4px ${color}` : "none" }}
      />
      <div className="font-mono text-[10px] text-zinc-500">
        <div>{on ? "ON" : "OFF"}</div>
        <div>value {parsed.success ? parsed.data.value : "?"}</div>
      </div>
    </div>
  );
}
