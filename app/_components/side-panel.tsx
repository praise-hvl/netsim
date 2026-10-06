"use client";
// The right-hand panel: the live message log, the programs, and the Add peripheral form.
import { useState } from "react";
import { MessageLog } from "@/app/_components/message-log";
import { ProgramsPanel } from "@/app/_components/programs-panel";
import { AddPeripheralPanel } from "@/app/_components/add-peripheral-panel";

const TABS = [
  { id: "messages", label: "Messages", Panel: MessageLog },
  { id: "programs", label: "Programs", Panel: ProgramsPanel },
  { id: "add", label: "Add peripheral", Panel: AddPeripheralPanel },
] as const;

export function SidePanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("messages");
  const { Panel } = TABS.find((t) => t.id === tab) ?? TABS[0];
  return (
    <aside className="flex h-full min-h-0 w-[26rem] shrink-0 flex-col border-l border-zinc-200 bg-white">
      <nav className="flex border-b border-zinc-200 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 ${t.id === tab ? "border-b-2 border-zinc-800 font-semibold text-zinc-900" : "text-zinc-500 hover:text-zinc-800"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Panel />
      </div>
    </aside>
  );
}
