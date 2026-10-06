"use client";
// The CPU: its cores (1-8) plus the scheduler's process list, from the CPU's `status`.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { cpuStatusData, type CpuStatusData } from "@/protocol/messages";
import { hex } from "@/protocol/memory-map";
import type { ComponentEntry } from "@/app/_lib/system-state";
import { NodeCard } from "@/app/_components/nodes/node-card";
import { CoreCard } from "@/app/_components/nodes/core-card";

export type CpuNode = Node<{ entry: ComponentEntry; stalled: boolean }, "cpu">;

const PROCESS_COLORS: Record<CpuStatusData["processes"][number]["state"], string> = {
  READY: "text-zinc-500",
  RUNNING: "text-green-700 font-semibold",
  DONE: "text-zinc-400 line-through",
  FAILED: "text-red-600",
};

export function CpuNodeView({ data }: NodeProps<CpuNode>) {
  const { info, status } = data.entry;
  // Validate what came off the wire before drawing it.
  const parsed = cpuStatusData.safeParse(status?.data);

  return (
    <NodeCard title={status?.label ?? info.label} subtitle={info.id} state={data.stalled ? "STALLED" : (status?.state ?? null)} className="min-w-80">
      <Handle id="from-peripheral" type="target" position={Position.Top} className="bg-red-400!" />
      {parsed.success ? (
        <>
          {/* Up to four cores per row, so 8 cores stay readable. */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(parsed.data.cores.length, 4)}, minmax(0, 1fr))` }}>
            {parsed.data.cores.map((core) => (
              <CoreCard key={core.id} core={core} />
            ))}
          </div>
          <ProcessList cpu={parsed.data} />
        </>
      ) : (
        <div className="py-2 italic text-zinc-400">{status ? "status data isn't in the CPU's shape" : "waiting for the CPU's first status"}</div>
      )}
      <Handle id="to-memory" type="source" position={Position.Bottom} className="bg-blue-400!" />
    </NodeCard>
  );
}

function ProcessList({ cpu }: { cpu: CpuStatusData }) {
  return (
    <div className="mt-2 border-t border-zinc-100 pt-1.5">
      <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        <span>Processes</span>
        {cpu.pendingIrqs > 0 && <span className="text-red-500">⚡ {cpu.pendingIrqs} irq pending</span>}
      </div>
      {cpu.processes.length === 0 && <div className="italic text-zinc-400">none: press Load demo</div>}
      {cpu.processes.map((p) => (
        <div key={p.pid} className="flex justify-between font-mono text-[10px]">
          <span className={PROCESS_COLORS[p.state]}>
            {p.pid} {p.name}
          </span>
          <span className="text-zinc-400">
            {hex(p.start)} · {p.instructions} instr · {p.state}
          </span>
        </div>
      ))}
    </div>
  );
}
