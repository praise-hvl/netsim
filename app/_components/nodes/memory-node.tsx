"use client";
// Memory as a hex grid, one 256-byte page at a time, with the last read and write highlighted.
import { useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memoryStatusData, type MemoryStatusData } from "@/protocol/messages";
import { hex } from "@/protocol/memory-map";
import type { ComponentEntry } from "@/app/_lib/system-state";
import { hex2 } from "@/app/_lib/format";
import { NodeCard } from "@/app/_components/nodes/node-card";
import { accessAt, type Access } from "@/app/_components/nodes/memory-access";

export type MemoryNode = Node<{ entry: ComponentEntry; stalled: boolean }, "memory">;

const PAGE_SIZE = 256;
const ROW_SIZE = 16;

/** One tab per page, named after what the memory map keeps there. */
const PAGES = [
  { start: 0x000, name: "programs" },
  { start: 0x100, name: "programs" },
  { start: 0x200, name: "handlers" },
  { start: 0x300, name: "data · devices" },
];

const ACCESS_CLASSES: Record<Exclude<Access, null>, string> = {
  read: "bg-blue-200 text-blue-900",
  write: "bg-red-200 text-red-900",
};

export function MemoryNodeView({ data }: NodeProps<MemoryNode>) {
  const { info, status } = data.entry;
  const [page, setPage] = useState(0);
  const parsed = memoryStatusData.safeParse(status?.data);

  return (
    <NodeCard title={status?.label ?? info.label} subtitle={`${info.id} · 1 KB`} state={data.stalled ? "STALLED" : (status?.state ?? null)}>
      <Handle id="from-cpu" type="target" position={Position.Top} className="bg-blue-400!" />
      <Handle id="from-peripheral" type="target" position={Position.Right} className="bg-emerald-400!" />
      <div className="nodrag mb-1.5 flex gap-1">
        {PAGES.map((p, i) => (
          <button
            key={p.start}
            onClick={() => setPage(i)}
            className={`rounded px-1.5 py-0.5 text-[10px] ${i === page ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
          >
            {hex(p.start)} {p.name}
          </button>
        ))}
      </div>
      {parsed.success ? (
        <>
          <HexGrid memory={parsed.data} start={PAGES[page].start} />
          <LastAccess memory={parsed.data} onJump={(address) => setPage(Math.floor(address / PAGE_SIZE))} />
        </>
      ) : (
        <div className="py-2 italic text-zinc-400">{status ? "status data isn't in Memory's shape" : "waiting for Memory's first status"}</div>
      )}
    </NodeCard>
  );
}

function HexGrid({ memory, start }: { memory: MemoryStatusData; start: number }) {
  const rows = Array.from({ length: PAGE_SIZE / ROW_SIZE }, (_, r) => start + r * ROW_SIZE);
  return (
    <div className="font-mono text-[10px] leading-4">
      <div className="flex">
        <span className="w-10 shrink-0" />
        {Array.from({ length: ROW_SIZE }, (_, c) => (
          <span key={c} className="w-5 text-center font-semibold text-zinc-400">
            {c.toString(16).toUpperCase()}
          </span>
        ))}
      </div>
      {rows.map((rowStart) => (
        <div key={rowStart} className="flex">
          <span className="w-10 shrink-0 text-zinc-400">{hex(rowStart)}</span>
          {Array.from({ length: ROW_SIZE }, (_, c) => {
            const address = rowStart + c;
            const value = memory.bytes[address] ?? 0;
            const access = accessAt(address, memory);
            const color = access ? ACCESS_CLASSES[access] : value === 0 ? "text-zinc-300" : "font-semibold text-zinc-800";
            return (
              <span key={address} className={`w-5 rounded-sm text-center ${color}`} title={`${hex(address)} = ${value}`}>
                {hex2(value)}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function LastAccess({ memory, onJump }: { memory: MemoryStatusData; onJump: (address: number) => void }) {
  const item = (label: string, range: MemoryStatusData["lastRead"], color: string) =>
    range ? (
      <button className={`nodrag ${color} hover:underline`} onClick={() => onJump(range.address)}>
        {label} {hex(range.address)} ×{range.length}
      </button>
    ) : (
      <span className="text-zinc-300">{label} —</span>
    );
  return (
    <div className="mt-1.5 flex gap-3 border-t border-zinc-100 pt-1 font-mono text-[10px]">
      {item("last read", memory.lastRead, "text-blue-600")}
      {item("last write", memory.lastWrite, "text-red-600")}
    </div>
  );
}
