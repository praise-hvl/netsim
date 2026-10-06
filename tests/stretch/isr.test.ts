// The handler for the week-6 peripheral you chose, in programs/isr-<kind>.asm.
import { describe, expect, it } from "vitest";
import { readProgram } from "@/programs/read";
import { wiringForSlot } from "@/protocol/memory-map";
import { notChosen } from "@/tests/course";

const IRET = [0xfe, 0, 0, 0];

describe.each(["sensor", "proximity", "potentiometer"])("isr-%s.asm", (kind) => {
  it.skipIf(notChosen(kind))("assembles at its slot's vector, fits the slot and ends with IRET", () => {
    const { vector, counter, register } = wiringForSlot(4, 1);
    const isr = readProgram(`isr-${kind}`, { VECTOR: vector, COUNTER: counter, REGISTER: register });
    expect(isr.address).toBeNull();
    expect(isr.bytes.length).toBeLessThanOrEqual(0x20);
    expect(isr.bytes.slice(-4)).toEqual(IRET);
    expect(isr.bytes.length).toBeGreaterThan(IRET.length); // more than the starter's bare IRET
    // It touches its own slot's counter: LOAD/STORE carry the address in bytes 2-3.
    expect(isr.bytes).toEqual(expect.arrayContaining([counter >> 8, counter & 0xff]));
  });
});
