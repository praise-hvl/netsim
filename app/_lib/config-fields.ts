// Turn a peripheral's zod configSchema into form fields, via JSON Schema. Adding a config field
// to a peripheral adds it to the "Add peripheral" form with no dashboard change.
import { z } from "zod";
import type { Json } from "@/protocol/messages";

export type ConfigField = {
  name: string;
  description?: string;
  default?: Json;
} & (
  | { kind: "number"; integer: boolean; min?: number; max?: number }
  | { kind: "boolean" }
  | { kind: "text" }
  | { kind: "choice"; options: (string | number)[] }
);

const property = z.object({
  type: z.string().optional(),
  enum: z.array(z.union([z.string(), z.number()])).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  description: z.string().optional(),
  default: z.unknown().optional(),
});

const objectSchema = z.object({ properties: z.record(z.string(), property).default({}) });

export function configFields(configSchema: z.ZodType<unknown>): ConfigField[] {
  let jsonSchema: unknown;
  try {
    jsonSchema = z.toJSONSchema(configSchema, { io: "input" });
  } catch {
    return []; // a schema JSON Schema can't express: the peripheral gets its defaults
  }
  const parsed = objectSchema.safeParse(jsonSchema);
  if (!parsed.success) return [];

  return Object.entries(parsed.data.properties).map(([name, p]): ConfigField => {
    const common = { name, description: p.description, default: asJson(p.default) };
    if (p.enum) return { ...common, kind: "choice", options: p.enum };
    if (p.type === "integer" || p.type === "number") {
      return { ...common, kind: "number", integer: p.type === "integer", min: p.minimum, max: p.maximum };
    }
    if (p.type === "boolean") return { ...common, kind: "boolean" };
    return { ...common, kind: "text" };
  });
}

/** Starting values for the form: each field's default, if it has one. */
export function initialValues(fields: ConfigField[]): Record<string, Json> {
  const values: Record<string, Json> = {};
  for (const field of fields) if (field.default !== undefined) values[field.name] = field.default;
  return values;
}

function asJson(value: unknown): Json | undefined {
  const parsed = z.union([z.string(), z.number(), z.boolean(), z.null()]).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
