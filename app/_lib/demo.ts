// "Load demo": wire up the devices the demo programs expect, then load the programs and hand
// them to the scheduler. Pressing Start is left to the person, so they can Step through it.
// The slots match the .equ addresses in programs/*.asm (LED at 0x3F1, display at 0x3F2).
import { PERIPHERALS } from "@/components/peripherals";
import { cpuStatusData } from "@/protocol/messages";
import type { DashboardActions } from "@/app/_lib/bus-connection";
import type { SystemState } from "@/app/_lib/system-state";
import { fetchPrograms } from "@/app/_lib/programs";

const DEMO_DEVICES = [
  { kind: "button", id: "button-1", slot: 0 },
  { kind: "led", id: "led-1", slot: 1 },
  { kind: "seven-segment", id: "display-1", slot: 2 },
];

/** Returns a list of problems (a device the host doesn't know yet, say); empty means all went well. */
export async function loadDemo(actions: DashboardActions, system: SystemState): Promise<string[]> {
  const problems: string[] = [];
  const components = Object.values(system.components);
  const host = components.find((c) => c.info.role === "host");

  for (const device of DEMO_DEVICES) {
    const entry = PERIPHERALS.find((p) => p.kind === device.kind);
    if (components.some((c) => c.info.kind === device.kind)) continue; // already there
    if (!entry) {
      problems.push(`no "${device.kind}" peripheral yet`);
      continue;
    }
    if (!host) {
      problems.push("the peripheral host isn't connected");
      break;
    }
    try {
      await actions.addPeripheral(host.info.id, { kind: device.kind, id: device.id, label: entry.label, config: {}, slot: device.slot });
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  // A second press shouldn't queue the same programs again while they are still waiting or running.
  const cpu = cpuStatusData.safeParse(components.find((c) => c.info.role === "cpu")?.status?.data);
  const active = cpu.success ? cpu.data.processes.filter((p) => p.state === "READY" || p.state === "RUNNING") : [];
  for (const program of await fetchPrograms()) {
    if (active.some((p) => p.name === program.name && p.start === program.address)) continue;
    await actions.loadProgram(program.name, program.address, program.bytes);
  }
  return problems;
}
