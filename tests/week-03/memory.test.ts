import { describe, expect, it } from "vitest";
import { createMemory, read, write } from "@/core/memory";
import { MEMORY_SIZE } from "@/protocol/memory-map";

describe("memory", () => {
  it("starts as 1024 zero bytes", () => {
    const memory = createMemory();
    expect(memory.bytes).toHaveLength(MEMORY_SIZE);
    expect(read(memory, 0, 4)).toEqual({ ok: true, value: [0, 0, 0, 0] });
  });

  it("reads back what was written", () => {
    const result = write(createMemory(), 0x010, [1, 2, 3]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(read(result.value, 0x010, 3)).toEqual({ ok: true, value: [1, 2, 3] });
    expect(read(result.value, 0x00f, 1)).toEqual({ ok: true, value: [0] });
  });

  it("does not change the memory it was given", () => {
    const before = createMemory();
    write(before, 0, [9]);
    expect(before.bytes[0]).toBe(0);
  });

  it("can use the very last byte", () => {
    const result = write(createMemory(), MEMORY_SIZE - 1, [7]);
    expect(result.ok && read(result.value, MEMORY_SIZE - 1, 1)).toEqual({ ok: true, value: [7] });
  });

  it.each([
    ["past the end", MEMORY_SIZE, 1],
    ["running off the end", MEMORY_SIZE - 2, 4],
    ["below zero", -1, 1],
  ])("faults on a read %s", (_name, address, length) => {
    const result = read(createMemory(), address, length);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fault).toMatch(/outside memory/);
  });

  it("faults on a write outside memory or of a non-byte", () => {
    expect(write(createMemory(), 0x400, [1]).ok).toBe(false);
    expect(write(createMemory(), 0, [256]).ok).toBe(false);
  });
});

