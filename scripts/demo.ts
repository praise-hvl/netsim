// `npm run demo`: set up the demo on a running system (bus + memory + cpu + host) without the
// dashboard. Spawns the demo peripherals that exist, loads countdown and blink, and runs.
//   npm run demo               start the clock and leave it running
//   npm run demo -- --ticks 300  run 300 ticks as fast as possible, print a summary, and exit
//   npm run demo -- --cores 4    give the CPU 4 cores first (1-8)
import { connect } from "@/components/client";
import { PERIPHERALS } from "@/components/peripherals/index";
import { readProgram } from "@/programs/read";
import { COUNTER_BASE, hex } from "@/protocol/memory-map";
import { cpuStatusData, memoryStatusData, type CpuStatusData, type MemoryStatusData } from "@/protocol/messages";

// Slot numbers match the .equ addresses in programs/countdown.asm and programs/blink.asm.
const DEMO_PERIPHERALS = [
  { kind: "button", id: "button-1", slot: 0 },
  { kind: "led", id: "led-1", slot: 1 },
  { kind: "seven-segment", id: "seven-segment-1", slot: 2 },
  { kind: "timer", id: "timer-1", slot: 3 },
];

const ticksArg = process.argv.indexOf("--ticks");
const ticks = ticksArg === -1 ? null : Number(process.argv[ticksArg + 1]);

const demo = await connect({ id: "demo", role: "dashboard", label: "Demo loader" });
const present = new Set(demo.welcome.components.map((c) => c.id));

for (const p of DEMO_PERIPHERALS) {
  if (!PERIPHERALS.some((entry) => entry.kind === p.kind) || present.has(p.id)) continue;
  await demo.request("host.spawn", "host", { kind: p.kind, id: p.id, config: {}, slot: p.slot });
  console.log(`started ${p.id} in slot ${p.slot}`);
}

const coresArg = process.argv.indexOf("--cores");
if (coresArg !== -1) {
  const count = Number(process.argv[coresArg + 1]);
  await demo.request("cpu.cores", "cpu", { count });
  console.log(`the CPU has ${count} cores`);
}

for (const name of ["countdown", "blink"]) {
  const program = readProgram(name);
  await demo.request("program.load", "memory", { address: program.address ?? 0, bytes: program.bytes });
  await demo.request("process.add", "cpu", { name, start: program.address ?? 0 });
  console.log(`loaded ${name} at ${hex(program.address ?? 0)}`);
}

if (ticks === null) {
  await demo.request("control", "bus", { action: "start" });
  console.log("clock started; open the dashboard to watch");
  await demo.close();
} else {
  let cpu: CpuStatusData | null = null;
  let memory: MemoryStatusData | null = null;
  demo.on("status", (message) => {
    if (message.from === "cpu") cpu = cpuStatusData.parse(message.payload.data);
    if (message.from === "memory") memory = memoryStatusData.parse(message.payload.data);
  });
  await demo.request("control", "bus", { action: "speed", ms: 10 });
  await demo.request("control", "bus", { action: "start" });
  await new Promise<void>((resolve) => {
    const stop = demo.on("status", (message) => {
      if (message.from === "bus" && Number(message.payload.data.tick) >= ticks) {
        stop();
        resolve();
      }
    });
  });
  await demo.request("control", "bus", { action: "stop" });
  const summary: { cpu: CpuStatusData | null; memory: MemoryStatusData | null } = { cpu, memory };
  for (const p of summary.cpu?.processes ?? []) console.log(`${p.name}: ${p.state} after ${p.instructions} instructions`);
  const bytes = summary.memory?.bytes ?? [];
  console.log(`LED register ${hex(0x3f1)} = ${bytes[0x3f1]}, display ${hex(0x3f2)} = ${bytes[0x3f2]}, button presses counted = ${bytes[COUNTER_BASE]}`);
  await demo.close();
}
