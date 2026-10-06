// The frame every node on the canvas shares: a title row with the FSM state, then the body.
import type { ReactNode } from "react";

const STATE_COLORS: Record<string, string> = {
  IDLE: "bg-zinc-100 text-zinc-600",
  READY: "bg-zinc-100 text-zinc-600",
  FETCH: "bg-blue-100 text-blue-700",
  WAIT_FETCH: "bg-sky-100 text-sky-700",
  DECODE: "bg-yellow-100 text-yellow-800",
  EXECUTE: "bg-green-100 text-green-700",
  WAIT_DATA: "bg-sky-100 text-sky-700",
  READING: "bg-blue-100 text-blue-700",
  WRITING: "bg-red-100 text-red-700",
  HALTED: "bg-zinc-200 text-zinc-700",
  FAULT: "bg-red-600 text-white",
  STALLED: "bg-orange-500 text-white",
  PRESSED: "bg-indigo-100 text-indigo-700",
  ON: "bg-amber-100 text-amber-800",
  NEAR: "bg-red-100 text-red-700",
  ABOVE: "bg-red-100 text-red-700",
  COUNTING: "bg-green-100 text-green-700",
};

export function StateBadge({ state }: { state: string }) {
  const color = STATE_COLORS[state] ?? "bg-zinc-100 text-zinc-600";
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${color}`}>{state}</span>;
}

type NodeCardProps = {
  title: string;
  subtitle?: string;
  state: string | null;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
};

export function NodeCard({ title, subtitle, state, onRemove, className = "", children }: NodeCardProps) {
  return (
    <div className={`rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-xs text-zinc-700 shadow-md ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-bold text-zinc-800">{title}</div>
          {subtitle && <div className="truncate text-[10px] text-zinc-400">{subtitle}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state ? <StateBadge state={state} /> : <span className="text-[10px] italic text-zinc-400">no status yet</span>}
          {onRemove && (
            <button
              onClick={onRemove}
              className="nodrag rounded px-1 text-[10px] font-bold text-red-400 hover:bg-red-50 hover:text-red-600"
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
