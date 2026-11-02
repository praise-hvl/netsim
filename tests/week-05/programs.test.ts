import { expect, it } from "vitest";
import { PROGRAMS } from "@/programs/index";
import { readProgram } from "@/programs/read";
import { wiringForSlot } from "@/protocol/memory-map";

it("every program in the catalogue assembles", () => {
  const { vector, counter, register } = wiringForSlot(3, 0);
  for (const info of PROGRAMS) {
    const program = readProgram(info.name, { VECTOR: vector, COUNTER: counter, REGISTER: register });
    expect(program.source.length).toBeGreaterThan(0);
    expect(program.bytes.length % 4).toBe(0);
  }
});

it("assembles handlers at their vector by default", () => {
  const isr = readProgram("isr-counter", { VECTOR: 0x260, COUNTER: 0x3e3 });
  expect(isr.bytes.slice(0, 4)).toEqual([0x01, 0, 0x03, 0xe3]); // LOAD R0, COUNTER
  expect(() => readProgram("missing")).toThrow(/no program called/);
});
