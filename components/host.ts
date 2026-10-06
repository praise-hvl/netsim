// The peripheral host: starts and stops peripherals when the dashboard asks (host.spawn /
// host.remove). Each peripheral still gets its own bus connection; the host just runs them.
import { connect, type BusClient } from "@/components/client";
import { findPeripheral } from "@/components/peripherals/index";
import type { RunningPeripheral } from "@/components/peripherals/peripheral";
import { findProgram } from "@/programs/index";
import { loadProgram } from "@/programs/load";
import { SLOT_COUNT, wiringForSlot, type Wiring } from "@/protocol/memory-map";
import type { MessageOf } from "@/protocol/messages";

export type RunningHost = { client: BusClient; running(): string[]; close(): Promise<void> };

/** A slot is claimed (peripheral: null) before its peripheral has finished starting. */
type Slot = { id: string; peripheral: RunningPeripheral | null };

export async function startHost(options: { url?: string; id?: string } = {}): Promise<RunningHost> {
  const client = await connect({ id: options.id ?? "host", role: "host", label: "Peripheral host", url: options.url });
  const url = options.url;
  const slots = new Map<number, Slot>();

  function freeSlot(): number {
    for (let slot = 0; slot < SLOT_COUNT; slot++) if (!slots.has(slot)) return slot;
    throw new Error(`all ${SLOT_COUNT} peripheral slots are in use`);
  }

  /** Load the peripheral's interrupt handler at its vector: isr-<kind>.asm if there is one, else isr-counter.asm. */
  async function loadHandler(kind: string, wiring: Wiring): Promise<void> {
    const name = findProgram(`isr-${kind}`) ? `isr-${kind}` : "isr-counter";
    const { vector, counter, register } = wiring;
    const { bytes } = loadProgram(name, { VECTOR: vector, COUNTER: counter, REGISTER: register }, vector);
    for (let offset = 0; offset < bytes.length; offset += 64) {
      await client.request("mem.write", "memory", { address: vector + offset, bytes: bytes.slice(offset, offset + 64) });
    }
  }

  async function spawn(message: MessageOf<"host.spawn">): Promise<void> {
    const { kind, id, label, config, slot: wanted } = message.payload;
    const entry = findPeripheral(kind);
    if (!entry) throw new Error(`no peripheral kind "${kind}"`);
    const slot = wanted ?? freeSlot();
    if (slots.has(slot)) throw new Error(`slot ${slot} is already used by ${slots.get(slot)!.id}`);
    const wiring = wiringForSlot(slot, entry.defaultPriority);

    // Claim the slot now, before the first await, so a spawn arriving meanwhile can't take it too.
    const claim: Slot = { id, peripheral: null };
    slots.set(slot, claim);
    try {
      if (entry.direction === "input") await loadHandler(kind, wiring);
      claim.peripheral = await entry.start({ id, label, wiring, config, url });
    } catch (error) {
      slots.delete(slot);
      throw error;
    }
  }

  async function remove(id: string): Promise<void> {
    const found = [...slots.entries()].find(([, s]) => s.id === id);
    if (!found) throw new Error(`the host isn't running "${id}"`);
    if (!found[1].peripheral) throw new Error(`"${id}" is still starting`);
    slots.delete(found[0]);
    await found[1].peripheral.close();
  }

  client.on("host.spawn", (message) => {
    spawn(message).then(
      () => client.reply(message, "ok", {}),
      (error: Error) => client.reply(message, "error", { message: error.message }),
    );
  });
  client.on("host.remove", (message) => {
    remove(message.payload.id).then(
      () => client.reply(message, "ok", {}),
      (error: Error) => client.reply(message, "error", { message: error.message }),
    );
  });

  return {
    client,
    running: () => [...slots.values()].map((s) => s.id),
    async close() {
      for (const { peripheral } of slots.values()) await peripheral?.close();
      slots.clear();
      await client.close();
    },
  };
}
