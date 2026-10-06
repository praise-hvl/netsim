// Every program in this folder. Safe to import anywhere (browser too); to read a program's
// source and bytes on the server, use readProgram from programs/read.ts.
export type ProgramInfo = {
  name: string;
  file: string;
  /** Where it is loaded. null for interrupt handlers: they go at their peripheral's VECTOR. */
  address: number | null;
  description: string;
};

export const PROGRAMS: readonly ProgramInfo[] = [
  { name: "countdown", file: "countdown.asm", address: 0x000, description: "Counts 9 to 0 on the seven-segment display (slot 2)" },
  { name: "blink", file: "blink.asm", address: 0x080, description: "Blinks the LED (slot 1) four times" },
  { name: "isr-counter", file: "isr-counter.asm", address: null, description: "Default interrupt handler: adds 1 to the peripheral's COUNTER" },
  { name: "isr-sensor", file: "isr-sensor.asm", address: null, description: "Temperature sensor handler: counts over-temperature alarms" },
  { name: "isr-proximity", file: "isr-proximity.asm", address: null, description: "Proximity handler: counts how often something came near" },
  { name: "isr-potentiometer", file: "isr-potentiometer.asm", address: null, description: "Potentiometer handler: counts how often the knob settled" },
];

export function findProgram(name: string): ProgramInfo | undefined {
  return PROGRAMS.find((p) => p.name === name);
}
