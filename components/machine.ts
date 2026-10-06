// The whole computer in one call, with no server: a bus inside the page plus Memory, the CPU and
// the peripheral host, all connected to it. The deployed board (GitHub Pages) runs this, then
// connects to `machine.url` exactly as it would to a live bus. Safe in the browser: nothing here
// reads files or opens network sockets.
import { startInPageBus } from "@/bus/in-page";
import type { Bus } from "@/bus/server";
import { connect } from "@/components/client";
import { startCpu } from "@/components/cpu";
import { startHost } from "@/components/host";
import { startMemory } from "@/components/memory";
import { loadProgram } from "@/programs/load";
import type { Json } from "@/protocol/messages";

export type MachinePeripheral = { kind: string; id: string; slot?: number; config?: Record<string, Json> };

export type MachineOptions = {
  /** The in-page bus's name: the machine is at inpage://<name>. Default "board". */
  name?: string;
  /** 1 to 8 cores. Default 2. */
  cores?: number;
  /** Milliseconds per tick while the clock runs. Default 500. */
  speedMs?: number;
  /** The devices to start. Default: the same as `npm run demo` (button, LED, display, timer). */
  peripherals?: readonly MachinePeripheral[];
  /** Programs to load and run, by name (programs/index.ts). Default countdown and blink; [] = none. */
  programs?: readonly string[];
  /** Start the clock right away. Default false: the board's controls start it. */
  start?: boolean;
};

export type Machine = {
  /** inpage://<name>: pass it to connect() (or the dashboard's connection) like a ws:// address. */
  url: string;
  bus: Bus;
  /** Stop everything and free the name. */
  close(): Promise<void>;
};

/** Slots match the .equ addresses in programs/countdown.asm and blink.asm. */
export const DEMO_PERIPHERALS: readonly MachinePeripheral[] = [
  { kind: "button", id: "button-1", slot: 0 },
  { kind: "led", id: "led-1", slot: 1 },
  { kind: "seven-segment", id: "seven-segment-1", slot: 2 },
  { kind: "timer", id: "timer-1", slot: 3 },
];

export async function startMachine(options: MachineOptions = {}): Promise<Machine> {
  const bus = startInPageBus({ name: options.name ?? "board", speedMs: options.speedMs });
  const url = bus.url;
  const parts: Array<{ close(): Promise<void> }> = [];
  try {
    parts.push(await startMemory({ url }));
    parts.push(await startCpu({ url, cores: options.cores }));
    parts.push(await startHost({ url }));

    // Set the machine up the way a dashboard would: devices, programs, then (maybe) the clock.
    const loader = await connect({ id: "machine", role: "dashboard", label: "Machine setup", url });
    parts.push(loader);
    for (const p of options.peripherals ?? DEMO_PERIPHERALS) {
      await loader.request("host.spawn", "host", { kind: p.kind, id: p.id, config: p.config ?? {}, slot: p.slot });
    }
    for (const name of options.programs ?? ["countdown", "blink"]) {
      const program = loadProgram(name);
      if (program.address === null) throw new Error(`${name} is an interrupt handler, not a program to run`);
      await loader.request("program.load", "memory", { address: program.address, bytes: program.bytes });
      await loader.request("process.add", "cpu", { name, start: program.address });
    }
    if (options.start) await loader.request("control", "bus", { action: "start" });
  } catch (error) {
    for (const part of parts.reverse()) await part.close();
    await bus.close();
    throw error;
  }

  return {
    url,
    bus,
    async close() {
      for (const part of parts.reverse()) await part.close();
      await bus.close();
    },
  };
}
