// The whole machine gives exactly the same message trace over WebSockets and inside a page.
import { expect, it } from "vitest";
import { testSystem, TRANSPORTS, type Transport } from "@/tests/helpers";

const COUNTER = `
        LOADI R1, 1
        LOADI R2, 6
loop:   LOAD  R0, 0x300
        ADD   R0, R1
        STORE R0, 0x300
        SUB   R2, R1
        JNZ   loop
        HALT`;

async function trace(transport: Transport): Promise<{ lines: string[]; byte: number }> {
  const system = await testSystem({ busOptions: { transport } });
  await system.run("a", 0x000, COUNTER);
  await system.run("b", 0x040, "LOADI R0, 9\nSTORE R0, 0x301\nHALT");
  await system.rec.steps(160);
  const lines = system.rec.messages.filter((m) => m.type.startsWith("mem.")).map((m) => `${m.tick} ${m.from}>${m.to} ${m.type} ${JSON.stringify(m.payload)}`);
  return { lines, byte: system.memoryByte(0x300) };
}

it("runs two programs to the same answer, with the same trace, on both transports", async () => {
  const [ws, inpage] = [await trace(TRANSPORTS[0]), await trace(TRANSPORTS[1])];
  expect(ws.byte).toBe(6);
  expect(inpage.byte).toBe(6);
  expect(inpage.lines).toEqual(ws.lines);
});
