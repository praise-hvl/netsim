// startMachine: the whole computer inside one page (no server), as the deployed board runs it.
import { describe, expect, it } from "vitest";
import { startMachine } from "@/components/machine";
import { cpuStatusData, memoryStatusData, type Message } from "@/protocol/messages";
import { onCleanup, recorder } from "@/tests/helpers";

/** The last status a component sent, parsed. */
function lastStatus(messages: Message[], from: string) {
  return messages.findLast((m) => m.type === "status" && m.from === from);
}

describe.each([2, 8])("startMachine with %i cores", (cores) => {
  it("runs the demo programs to the end, in the page", async () => {
    const machine = await startMachine({ name: `machine-test-${cores}`, cores });
    onCleanup(() => machine.close());
    expect(machine.url).toBe(`inpage://machine-test-${cores}`);

    const rec = await recorder(machine.bus);
    await rec.steps(320);

    const cpu = lastStatus(rec.messages, "cpu");
    const memory = lastStatus(rec.messages, "memory");
    const cpuData = cpuStatusData.parse(cpu?.type === "status" ? cpu.payload.data : null);
    expect(cpuData.cores).toHaveLength(cores);
    expect(Object.fromEntries(cpuData.processes.map((p) => [p.name, p.state]))).toEqual({ countdown: "DONE", blink: "DONE" });
    const bytes = memoryStatusData.parse(memory?.type === "status" ? memory.payload.data : null).bytes;
    expect(bytes[0x3f2]).toBe(0); // the display ends at 0
  });
});

it("can start empty, and refuses a second machine with the same name", async () => {
  const machine = await startMachine({ name: "machine-empty", programs: [], peripherals: [] });
  onCleanup(() => machine.close());
  await expect(startMachine({ name: "machine-empty" })).rejects.toThrow(/already running/);
});
