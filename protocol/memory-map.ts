// The address conventions every program and peripheral agrees on.
// See "Memory map" in docs/ARCHITECTURE.md.

export const MEMORY_SIZE = 1024;

export const PROGRAM_BASE = 0x000;
export const ISR_BASE = 0x200;
export const ISR_SLOT_SIZE = 0x20;
export const COUNTER_BASE = 0x3e0;
export const REGISTER_BASE = 0x3f0;

/** 16 peripheral slots: one handler, one counter and one register byte each. */
export const SLOT_COUNT = 16;

/** Where a peripheral in a given slot is wired up. */
export type Wiring = {
  slot: number;
  /** Handler address the CPU jumps to on this peripheral's interrupt. */
  vector: number;
  /** Byte the default handler increments on every interrupt. */
  counter: number;
  /** This peripheral's memory-mapped device register. */
  register: number;
  /** Interrupt priority: lower number = more urgent. */
  priority: number;
};

export function wiringForSlot(slot: number, priority: number): Wiring {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOT_COUNT) {
    throw new RangeError(`Slot ${slot} is out of range (0-${SLOT_COUNT - 1})`);
  }
  return {
    slot,
    vector: ISR_BASE + slot * ISR_SLOT_SIZE,
    counter: COUNTER_BASE + slot,
    register: REGISTER_BASE + slot,
    priority,
  };
}

/** 0x3F0-style text. Addresses use 3 digits; pass 2 for a byte. */
export function hex(value: number, digits = 3): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}
