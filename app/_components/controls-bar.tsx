"use client";
// The clock controls, Load demo, and save/restore. Every button is one message to the bus.
import { useState } from "react";
import { useActions, useBus } from "@/app/_lib/use-bus";
import { loadDemo } from "@/app/_lib/demo";
import type { DashboardActions } from "@/app/_lib/bus-connection";
import { useToast } from "@/app/_components/toast";

const SPEEDS_MS = [1000, 500, 250, 100, 50, 20];

const BUTTON = "rounded-md px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40";

export function ControlsBar() {
  const { connection, system } = useBus();
  const actions = useActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [saveName, setSaveName] = useState("my-save");

  /** Run an action, showing any failure as a toast. */
  async function run(task: (a: DashboardActions) => Promise<unknown>): Promise<void> {
    if (!actions) return;
    setBusy(true);
    try {
      await task(actions);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !actions || busy;

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2">
      <span className="mr-2 text-sm font-bold text-zinc-800">NetSim</span>
      <ConnectionDot phase={connection.phase} />
      <span className="font-mono text-xs text-zinc-500">tick {system.tick}</span>
      <span className="mx-1 h-5 w-px bg-zinc-200" />

      {system.running ? (
        <button className={`${BUTTON} bg-red-600 text-white hover:bg-red-700`} disabled={disabled} onClick={() => run((a) => a.control("stop"))}>
          ■ Stop
        </button>
      ) : (
        <button className={`${BUTTON} bg-green-600 text-white hover:bg-green-700`} disabled={disabled} onClick={() => run((a) => a.control("start"))}>
          ▶ Start
        </button>
      )}
      <button className={`${BUTTON} bg-zinc-100 hover:bg-zinc-200`} disabled={disabled || system.running} onClick={() => run((a) => a.control("step"))}>
        Step
      </button>
      <button className={`${BUTTON} bg-zinc-100 hover:bg-zinc-200`} disabled={disabled} onClick={() => run((a) => a.control("reset"))}>
        Reset
      </button>
      <label className="flex items-center gap-1 text-xs text-zinc-500">
        speed
        <select
          className="rounded border border-zinc-200 bg-white px-1 py-0.5 text-xs"
          value={system.speedMs}
          disabled={disabled}
          onChange={(e) => run((a) => a.control("speed", Number(e.target.value)))}
        >
          {[...new Set([...SPEEDS_MS, system.speedMs])].sort((a, b) => b - a).map((ms) => (
            <option key={ms} value={ms}>
              {ms} ms/tick
            </option>
          ))}
        </select>
      </label>
      <span className="mx-1 h-5 w-px bg-zinc-200" />

      <button
        className={`${BUTTON} bg-blue-600 text-white hover:bg-blue-700`}
        disabled={disabled}
        onClick={() =>
          run(async (a) => {
            for (const problem of await loadDemo(a, system)) toast(`Load demo: ${problem}`);
          })
        }
      >
        Load demo
      </button>

      <span className="ml-auto flex items-center gap-1">
        <input
          className="w-28 rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-xs"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          aria-label="save name"
        />
        <button
          className={`${BUTTON} bg-zinc-100 hover:bg-zinc-200`}
          disabled={disabled || system.running}
          title={system.running ? "Stop the clock first" : "Save the whole system"}
          onClick={() => run((a) => a.save(saveName))}
        >
          Save
        </button>
        <button
          className={`${BUTTON} bg-zinc-100 hover:bg-zinc-200`}
          disabled={disabled || system.running}
          title={system.running ? "Stop the clock first" : "Restore a saved system"}
          onClick={() => run((a) => a.restore(saveName))}
        >
          Restore
        </button>
      </span>
    </header>
  );
}

function ConnectionDot({ phase }: { phase: "connecting" | "open" | "closed" }) {
  const color = { connecting: "bg-amber-400 animate-pulse", open: "bg-green-500", closed: "bg-red-500" }[phase];
  const text = { connecting: "connecting…", open: "connected", closed: "no bus" }[phase];
  return (
    <span className="flex items-center gap-1 text-xs text-zinc-500">
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {text}
    </span>
  );
}
