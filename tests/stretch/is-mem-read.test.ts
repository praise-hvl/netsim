// Stretch: a hand-written validator for one message type (protocol/messages.ts, isMemRead), to
// feel what the zod schema in parseMessage does for you.
import { describe, expect, it } from "vitest";
import { isMemRead, type Message } from "@/protocol/messages";

const memRead: Message = {
  type: "mem.read",
  from: "cpu",
  to: "memory",
  id: "cpu-1",
  tick: 3,
  payload: { address: 0x010, length: 4 },
};

describe("isMemRead (hand-written guard)", () => {
  it("agrees with the schema on a valid mem.read", () => {
    expect(isMemRead(memRead)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "mem.read"],
    ["another type", { ...memRead, type: "mem.write" }],
    ["a missing payload", { ...memRead, payload: undefined }],
    ["a fractional address", { ...memRead, payload: { address: 1.5, length: 1 } }],
    ["a zero length", { ...memRead, payload: { address: 0, length: 0 } }],
    ["a string tick", { ...memRead, tick: "3" }],
  ])("rejects %s", (_name, value) => {
    expect(isMemRead(value)).toBe(false);
  });
});
