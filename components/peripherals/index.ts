// Every peripheral kind the host can start. Add one line here when you add a peripheral.
import { entry, type PeripheralEntry } from "@/components/peripherals/peripheral";
import { button } from "@/components/peripherals/button";
import { timer } from "@/components/peripherals/timer";
import { sensor } from "@/components/peripherals/sensor";
import { proximity } from "@/components/peripherals/proximity";
import { potentiometer } from "@/components/peripherals/potentiometer";
import { led } from "@/components/peripherals/led";
import { sevenSegment } from "@/components/peripherals/seven-segment";
import { screen } from "@/components/peripherals/screen";

export const PERIPHERALS: readonly PeripheralEntry[] = [
  // Inputs: raise interrupts and/or write their register.
  entry(button),
  entry(timer),
  entry(sensor),
  entry(proximity),
  entry(potentiometer),
  // Outputs: read their register every tick.
  entry(led),
  entry(sevenSegment),
  entry(screen),
];

export function findPeripheral(kind: string): PeripheralEntry | undefined {
  return PERIPHERALS.find((p) => p.kind === kind);
}
