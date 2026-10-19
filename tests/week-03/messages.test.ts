import { describe, expect, it } from "vitest";
import { parseMessage, type Message } from "@/protocol/messages";

const memRead: Message = {
  type: "mem.read",
  from: "cpu",
  to: "memory",
  id: "cpu-1",
  tick: 3,
  payload: { address: 0x010, length: 4 },
};

describe("parseMessage", () => {
  it("accepts a valid message and keeps its type", () => {
    const result = parseMessage(JSON.stringify(memRead));
    expect(result).toEqual({ ok: true, message: memRead });
  });

  it("rejects text that isn't JSON", () => {
    expect(parseMessage("{nope")).toEqual({ ok: false, error: "not valid JSON" });
  });

  it("rejects an unknown message type", () => {
    const result = parseMessage(JSON.stringify({ ...memRead, type: "mem.explode" }));
    expect(result.ok).toBe(false);
  });

  it("rejects a payload of the wrong shape, and says where", () => {
    const result = parseMessage(JSON.stringify({ ...memRead, payload: { address: "16", length: 4 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("address");
  });

  it("rejects a byte that doesn't fit in 8 bits", () => {
    const bad = { ...memRead, type: "mem.write", payload: { address: 0, bytes: [256] } };
    expect(parseMessage(JSON.stringify(bad)).ok).toBe(false);
  });

  it("rejects a message with no sender", () => {
    const { from, ...rest } = memRead;
    void from;
    expect(parseMessage(JSON.stringify(rest)).ok).toBe(false);
  });
});
