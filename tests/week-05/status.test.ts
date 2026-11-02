// Every component's view must be a valid `status` payload, or the dashboard can't draw it.
// (Sensor, Proximity and Potentiometer build their views in week 6: tests/week-06/status.test.ts.)
import { describe, expect, it } from "vitest";
import { cpuStatusData, statusPayload, type Json } from "@/protocol/messages";
import { createCpu, cpuView } from "@/core/cpu";
import type { PeripheralDefinition } from "@/components/peripherals/peripheral";
import { firstStatus } from "@/tests/helpers";
import { button } from "@/components/peripherals/button";
import { led } from "@/components/peripherals/led";
import { timer } from "@/components/peripherals/timer";
import { sevenSegment } from "@/components/peripherals/seven-segment";
import { screen } from "@/components/peripherals/screen";

describe("status payloads", () => {
  it.each([
    ["button", button],
    ["led", led],
    ["timer", timer],
    ["seven-segment", sevenSegment],
    ["screen", screen],
  ] as const)("%s's view is a valid status payload", (_kind, definition) => {
    const result = statusPayload.safeParse(firstStatus(definition as PeripheralDefinition<Json, unknown, unknown>));
    expect(result.success, result.success ? "" : result.error.message).toBe(true);
  });

  it("the CPU's view matches what the dashboard's CPU node reads", () => {
    const result = cpuStatusData.safeParse(cpuView(createCpu()));
    expect(result.success, result.success ? "" : result.error.message).toBe(true);
  });
});
