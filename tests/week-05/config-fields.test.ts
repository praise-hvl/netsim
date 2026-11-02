import { z } from "zod";
import { describe, expect, it } from "vitest";
import { configFields, initialValues } from "@/app/_lib/config-fields";

describe("Add peripheral form fields", () => {
  it("builds a field per config property, with defaults", () => {
    const schema = z.object({
      interval: z.number().int().min(1).max(100).default(10).describe("ticks between interrupts"),
      color: z.enum(["red", "green"]).default("red"),
      blink: z.boolean().default(false),
    });
    const fields = configFields(schema);
    expect(fields).toEqual([
      { name: "interval", kind: "number", integer: true, min: 1, max: 100, default: 10, description: "ticks between interrupts" },
      { name: "color", kind: "choice", options: ["red", "green"], default: "red", description: undefined },
      { name: "blink", kind: "boolean", default: false, description: undefined },
    ]);
    expect(initialValues(fields)).toEqual({ interval: 10, color: "red", blink: false });
  });

  it("gives no fields for a peripheral without config", () => {
    expect(configFields(z.object({}).strict())).toEqual([]);
  });
});
