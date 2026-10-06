import { expect, it } from "vitest";
import { parseChoice } from "@/tests/course";

it("accepts no choice, or one of the three optional peripherals", () => {
  expect(parseChoice({})).toBeNull();
  expect(parseChoice({ peripheral: null })).toBeNull();
  expect(parseChoice({ peripheral: "proximity" })).toBe("proximity");
});

it("rejects a misspelled choice instead of skipping every optional test", () => {
  expect(() => parseChoice({ peripheral: "Sensor" })).toThrow("use one of sensor, proximity, potentiometer, or null");
  expect(() => parseChoice({ peripheral: "potentiometre" })).toThrow(/"potentiometre"/);
});
