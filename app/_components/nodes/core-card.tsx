// One CPU core, drawn from the `cores[i]` the CPU sends in its status.
// Everything shown here is read from the status; the card computes nothing it could read.
import type { z } from "zod";
import type { coreView } from "@/protocol/messages";
import { hex } from "@/protocol/memory-map";
import { hex2 } from "@/app/_lib/format";
import { StateBadge } from "@/app/_components/nodes/node-card";

export type CoreView = z.infer<typeof coreView>;

export function CoreCard({ core }: { core: CoreView }) {
  const border = core.state === "FAULT" ? "border-red-400 bg-red-50" : core.inHandler ? "border-orange-300 bg-orange-50" : "border-zinc-200";
  return (
    <div className={`min-w-36 flex-1 rounded-md border p-2 transition-colors ${border}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-500">Core {core.id}</span>
        <span className="flex items-center gap-1">
          {core.inHandler && <span className="rounded bg-orange-100 px-1 text-[9px] font-bold text-orange-700">ISR</span>}
          <StateBadge state={core.state} />
        </span>
      </div>
      <div className="space-y-0.5 font-mono text-[11px]">
        <div>PC {hex(core.pc)}</div>
        <div className="truncate text-zinc-900" title="current instruction">{core.instruction ?? "—"}</div>
        <div>
          {core.registers.map((value, r) => (
            <span key={r} className="mr-2">R{r}:{hex2(value)}</span>
          ))}
        </div>
        <div className="text-zinc-500">
          Z:{core.flags.zero ? 1 : 0} C:{core.flags.carry ? 1 : 0} · PID {core.pid ?? "—"}
        </div>
      </div>
    </div>
  );
}
