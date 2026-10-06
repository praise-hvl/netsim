"use client";
// The dashboard's tap, as a list: every message the bus routed, newest at the bottom.
// This is the protocol, live. Clock messages are hidden by default because there are so many.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "@/protocol/messages";
import { useBus } from "@/app/_lib/use-bus";
import { describeMessage } from "@/app/_lib/describe-message";

const CLOCK_TYPES = new Set(["tick", "tick.done"]);

const TYPE_COLORS: Array<[prefix: string, className: string]> = [
  ["mem.", "text-blue-600"],
  ["program.", "text-blue-600"],
  ["irq", "text-red-600"],
  ["fault", "text-red-700 font-semibold"],
  ["error", "text-red-700 font-semibold"],
  ["status", "text-zinc-400"],
  ["tick", "text-zinc-300"],
  ["control", "text-green-700"],
];

function typeColor(type: Message["type"]): string {
  return TYPE_COLORS.find(([prefix]) => type.startsWith(prefix))?.[1] ?? "text-zinc-700";
}

export function MessageLog() {
  const { system } = useBus();
  const [showClock, setShowClock] = useState(false);
  const [showStatus, setShowStatus] = useState(true);
  const [filter, setFilter] = useState("");
  const [paused, setPaused] = useState<typeof system.log | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const log = paused ?? system.log;
  const visible = useMemo(
    () =>
      log.filter(({ message }) => {
        if (!showClock && CLOCK_TYPES.has(message.type)) return false;
        if (!showStatus && message.type === "status") return false;
        if (filter && !`${message.from} ${message.to} ${message.type}`.includes(filter)) return false;
        return true;
      }),
    [log, showClock, showStatus, filter],
  );

  useEffect(() => {
    if (!paused) bottom.current?.scrollIntoView({ block: "end" });
  }, [visible, paused]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-2 py-1.5 text-[11px] text-zinc-600">
        <input
          className="w-28 rounded border border-zinc-200 px-1.5 py-0.5 font-mono"
          placeholder="filter: cpu, irq…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showClock} onChange={(e) => setShowClock(e.target.checked)} /> ticks
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={showStatus} onChange={(e) => setShowStatus(e.target.checked)} /> status
        </label>
        <button className="ml-auto rounded bg-zinc-100 px-2 py-0.5 hover:bg-zinc-200" onClick={() => setPaused(paused ? null : system.log)}>
          {paused ? "▶ follow" : "❚❚ pause"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto font-mono text-[10.5px] leading-[1.35rem]">
        {visible.map(({ seq, message }) => (
          <div key={seq} className="flex gap-1.5 border-b border-zinc-50 px-2 hover:bg-zinc-50" title={JSON.stringify(message, null, 2)}>
            <span className="w-8 shrink-0 text-right text-zinc-300">{message.tick}</span>
            <span className="shrink-0 text-zinc-500">
              {message.from}→{message.to}
            </span>
            <span className={`shrink-0 ${typeColor(message.type)}`}>{message.type}</span>
            <span className="truncate text-zinc-600">{describeMessage(message)}</span>
            {message.replyTo && <span className="ml-auto shrink-0 text-zinc-300">↩ {message.replyTo}</span>}
          </div>
        ))}
        {visible.length === 0 && <div className="p-3 italic text-zinc-400">No messages yet.</div>}
        <div ref={bottom} />
      </div>
    </div>
  );
}
