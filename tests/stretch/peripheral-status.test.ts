// The week-6 peripherals' views must be valid `status` payloads too. Only the one you chose in
// course.json is tested (see tests/course.ts).
import { describe, expect, it } from "vitest";
import { statusPayload, type Json } from "@/protocol/messages";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";
import { sensor } from "@/components/peripherals/sensor";
import { proximity } from "@/components/peripherals/proximity";
import { potentiometer } from "@/components/peripherals/potentiometer";
import { notChosen } from "@/tests/course";
import { firstStatus } from "@/tests/helpers";

describe("status payloads (week 6 peripherals)", () => {
  for (const [kind, definition] of [
    ["sensor", sensor],
    ["proximity", proximity],
    ["potentiometer", potentiometer],
  ] as const) {
    it.skipIf(notChosen(kind))(`${kind}'s view is a valid status payload`, () => {
      const result = statusPayload.safeParse(firstStatus(definition as PeripheralDefinition<Json, unknown, unknown>));
      expect(result.success, result.success ? "" : result.error.message).toBe(true);
    });
  }
});
