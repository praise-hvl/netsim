// The proximity sensor: move the mouse near the circle. The distance from the pointer to the
// circle's centre (in screen pixels) is sent as { distance }; it reports { distance, radius }.
import { useEffect, useRef } from "react";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

/** Send at most this often while the mouse moves, so we don't flood the bus. */
const SEND_EVERY_MS = 100;
const FAR = 255;

export function ProximityView({ status, sendInput }: PeripheralViewProps) {
  const circle = useRef<HTMLDivElement>(null);
  const distance = typeof status.data.distance === "number" ? status.data.distance : FAR;
  const radius = typeof status.data.radius === "number" ? status.data.radius : 60;
  const near = status.state === "NEAR";

  // Keep the latest sendInput in a ref so the mouse listener is attached once, not every render.
  const send = useRef(sendInput);
  useEffect(() => {
    send.current = sendInput;
  }, [sendInput]);

  useEffect(() => {
    let lastSent = 0;
    let lastDistance = FAR;
    let trailing: ReturnType<typeof setTimeout> | undefined;

    function sendDistance(distance: number): void {
      lastSent = Date.now();
      if (distance === lastDistance) return; // still far away: nothing new to say
      lastDistance = distance;
      send.current({ distance });
    }

    function onMove(event: MouseEvent): void {
      if (!circle.current) return;
      const box = circle.current.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const distance = Math.min(FAR, Math.round(Math.hypot(dx, dy)));
      // Throttled: send now if we may, otherwise once the window ends, so the last position
      // (where the pointer stopped) is never dropped.
      clearTimeout(trailing);
      const wait = lastSent + SEND_EVERY_MS - Date.now();
      if (wait <= 0) sendDistance(distance);
      else trailing = setTimeout(() => sendDistance(distance), wait);
    }

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      clearTimeout(trailing);
    };
  }, []);

  const closeness = Math.max(0, Math.min(1, 1 - distance / (radius * 2)));
  return (
    <div className="flex items-center gap-3">
      <div
        ref={circle}
        className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border-[3px] transition-transform ${
          near ? "border-red-400 bg-red-50" : "border-emerald-400 bg-emerald-50"
        }`}
        style={{ transform: `scale(${1 + closeness * 0.15})` }}
      >
        <span className="text-[8px] uppercase tracking-wider text-zinc-500">prox</span>
        <span className="font-mono text-sm font-bold tabular-nums">{distance >= FAR ? "far" : distance}</span>
      </div>
      <div className="font-mono text-[10px] text-zinc-500">r = {radius}</div>
    </div>
  );
}
