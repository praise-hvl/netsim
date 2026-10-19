import { describe as group, expect, it } from "vitest";
import { createLineFormatter, describe } from "@/components/logger";
import { envelope } from "@/protocol/messages";

const request = envelope("mem.read", "cpu", "memory", { address: 0x010, length: 4 }, { id: "cpu-88", tick: 12 });
const reply = envelope("mem.data", "memory", "cpu", { address: 0x010, bytes: [6, 0, 0, 9] }, { id: "memory-5", tick: 12, replyTo: "cpu-88" });

group("logger", () => {
  it("describes a request and its reply in a few words", () => {
    expect(describe(request)).toBe("0x010 ×4");
    expect(describe(reply)).toBe("4 bytes");
    expect(describe(envelope("mem.write", "cpu", "memory", { address: 0x3f1, bytes: [255] }, { id: "cpu-9", tick: 1 }))).toBe("0x3F1 ← [255]");
    expect(describe(envelope("fault", "memory", "cpu", { code: "OUT_OF_RANGE", message: "0x400 is outside memory" }, { id: "m-1", tick: 1 }))).toBe("0x400 is outside memory");
  });

  it("pairs a reply with its request and shows how long it took", () => {
    let clock = 1000;
    const format = createLineFormatter(() => clock);
    const first = format(request);
    clock = 1003;
    const second = format(reply);

    expect(first).toContain("cpu → memory");
    expect(first).toContain("mem.read 0x010 ×4");
    expect(first).not.toContain("ms");
    expect(second).toContain("memory → cpu");
    expect(second).toContain("↩ cpu-88");
    expect(second).toMatch(/3 ms$/);
  });
});
