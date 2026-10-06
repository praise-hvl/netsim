"use client";
// One node for every peripheral. It draws the status every peripheral shares (label, FSM
// state, register, vector), then the kind's own view if it has one, or its data as a table.
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { Json, StatusPayload } from "@/protocol/messages";
import type { ComponentEntry } from "@/app/_lib/system-state";
import { NodeCard } from "@/app/_components/nodes/node-card";
import { PERIPHERAL_VIEWS } from "@/app/_components/nodes/peripherals";

export type PeripheralNode = Node<
  {
    entry: ComponentEntry;
    stalled: boolean;
    sendInput: (input: Record<string, Json>) => void;
    remove: () => void;
  },
  "peripheral"
>;

/** Added to every peripheral's data by the shell; shown in the footer, not the table. */
const WIRING_KEYS = ["register", "vector"];

export function PeripheralNodeView({ data }: NodeProps<PeripheralNode>) {
  const { info, status } = data.entry;
  const kind = info.kind ?? "peripheral";
  const View = PERIPHERAL_VIEWS[kind];

  return (
    <NodeCard
      title={status?.label ?? info.label}
      subtitle={`${info.id} · ${kind}`}
      state={data.stalled ? "STALLED" : (status?.state ?? null)}
      onRemove={data.remove}
      className="min-w-48"
    >
      {status && (View ? <View status={status} sendInput={data.sendInput} /> : <DataTable data={status.data} />)}
      {status && <Wiring status={status} />}
      <Handle id="to-cpu" type="source" position={Position.Bottom} className="bg-red-400!" />
      <Handle id="to-memory" type="source" position={Position.Left} className="bg-emerald-400!" />
    </NodeCard>
  );
}

function DataTable({ data }: { data: StatusPayload["data"] }) {
  const rows = Object.entries(data).filter(([key]) => !WIRING_KEYS.includes(key));
  if (rows.length === 0) return null;
  return (
    <table className="w-full font-mono text-[10px]">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td className="pr-3 text-zinc-400">{key}</td>
            <td className="text-right text-zinc-800">{JSON.stringify(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Wiring({ status }: { status: StatusPayload }) {
  const { register, vector } = status.data;
  return (
    <div className="mt-1.5 flex gap-3 border-t border-zinc-100 pt-1 font-mono text-[10px] text-zinc-400">
      {typeof register === "string" && <span>reg {register}</span>}
      {typeof vector === "string" && <span>irq → {vector}</span>}
    </div>
  );
}
