"use client";
// The assembly programs in programs/, with their source. "Load" puts one in memory
// (program.load) and hands it to the scheduler (process.add).
import { useEffect, useState } from "react";
import { hex } from "@/protocol/memory-map";
import { fetchPrograms, type ProgramListing } from "@/app/_lib/programs";
import { useActions } from "@/app/_lib/use-bus";
import { useToast } from "@/app/_components/toast";

export function ProgramsPanel() {
  const actions = useActions();
  const toast = useToast();
  const [programs, setPrograms] = useState<ProgramListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPrograms().then(setPrograms, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="p-3 text-xs text-red-700">{error}</p>;
  if (!programs) return <p className="p-3 text-xs italic text-zinc-400">Loading programs…</p>;

  return (
    <div className="space-y-3 p-3 text-xs">
      {programs.map((program) => (
        <section key={program.name} className="rounded-lg border border-zinc-200">
          <header className="flex items-center gap-2 border-b border-zinc-100 px-2 py-1.5">
            <span className="font-semibold">{program.file}</span>
            <span className="font-mono text-zinc-400">at {hex(program.address)} · {program.bytes.length} bytes</span>
            <button
              className="ml-auto rounded bg-blue-600 px-2 py-0.5 text-white hover:bg-blue-700 disabled:opacity-40"
              disabled={!actions}
              onClick={() => actions?.loadProgram(program.name, program.address, program.bytes).catch((e: Error) => toast(e.message))}
            >
              Load
            </button>
          </header>
          <p className="px-2 pt-1.5 text-zinc-500">{program.description}</p>
          <pre className="overflow-x-auto px-2 py-1.5 font-mono text-[10.5px] leading-4 text-zinc-700">{program.source}</pre>
        </section>
      ))}
    </div>
  );
}
