// The contract every peripheral follows, and the one shell that runs any of them on the bus.
// A peripheral is a pure FSM (init / onInput / onTick / view); the shell does the talking.
// See "Peripherals" in docs/ARCHITECTURE.md, and button.ts for the reference example.
import type { z } from "zod";
import type { Fsm } from "@/core/fsm";
import type { Json, StatusPayload } from "@/protocol/messages";
import { hex, type Wiring } from "@/protocol/memory-map";
import { connect, type BusClient } from "@/components/client";

/** What a peripheral asks the shell to do at the end of its tick. */
export type PeripheralEffect =
  | { kind: "irq" } //                  interrupt the CPU (input peripherals)
  | { kind: "write"; value: number } // write my register byte
  | { kind: "read" }; //                read my register byte; the value arrives next tick

export type TickContext = {
  tick: number;
  /** The last value read from my register, or null before the first read reply. */
  register: number | null;
};

export type PeripheralView = {
  state: string;
  data: Record<string, Json>;
};

export type PeripheralDefinition<State extends Json, Input, Config> = {
  kind: string;
  label: string;
  /** input: raises IRQs and/or writes its register. output: reads its register. */
  direction: "input" | "output";
  defaultPriority: number;
  /** Fields for the dashboard's "Add peripheral" form. Missing fields get their defaults. */
  configSchema: z.ZodType<Config>;
  /** What the dashboard may send in an `input` message. */
  inputSchema: z.ZodType<Input>;
  /** Used to check a saved snapshot before restoring it. */
  stateSchema: z.ZodType<State>;
  /** The transition table. `onInput`/`onTick` must only move along it. */
  fsm: Fsm<string>;
  init(config: Config): State;
  onInput(state: State, input: Input): State;
  onTick(state: State, context: TickContext): { state: State; effects: PeripheralEffect[] };
  view(state: State): PeripheralView;
  /** Optional: what to save. Without it the whole state is saved as-is. */
  snapshot?(state: State): Json;
  /** Optional: rebuild state from a save (throw if the data is bad). Without it, stateSchema checks the saved state. */
  restore?(data: unknown): State;
};

/**
 * A definition with its type parameters hidden, so one list can hold every kind of peripheral
 * (see index.ts). The dashboard builds its "Add peripheral" form from `configSchema`
 * (`z.toJSONSchema(entry.configSchema)` gives the fields and defaults).
 */
export type PeripheralEntry = {
  kind: string;
  label: string;
  direction: "input" | "output";
  defaultPriority: number;
  configSchema: z.ZodType<unknown>;
  fsm: Fsm<string>;
  start(options: PeripheralOptions): Promise<RunningPeripheral>;
};

export function entry<State extends Json, Input, Config>(
  definition: PeripheralDefinition<State, Input, Config>,
): PeripheralEntry {
  const { kind, label, direction, defaultPriority, configSchema, fsm } = definition;
  return { kind, label, direction, defaultPriority, configSchema, fsm, start: (options) => startPeripheral(definition, options) };
}

export type PeripheralOptions = {
  id: string;
  label?: string;
  wiring: Wiring;
  config?: Record<string, Json>;
  url?: string;
};

export type RunningPeripheral = {
  client: BusClient;
  /** Current state, for tests. */
  state(): Json;
  close(): Promise<void>;
};

/** Connect a peripheral to the bus and run it until closed. */
export async function startPeripheral<State extends Json, Input, Config>(
  definition: PeripheralDefinition<State, Input, Config>,
  options: PeripheralOptions,
): Promise<RunningPeripheral> {
  const config = definition.configSchema.parse(options.config ?? {});
  const label = options.label ?? definition.label;
  const { wiring } = options;

  let state = definition.init(config);
  let register: number | null = null;
  /**
   * Inputs that arrived since the last tick, applied on the next one. `raw` is the payload as
   * sent, kept so a save made between ticks (say, a button pressed while the clock is stopped)
   * doesn't lose it.
   */
  const latchedInputs: Array<{ raw: Record<string, Json>; input: Input }> = [];

  const client = await connect({ id: options.id, role: "peripheral", kind: definition.kind, label, url: options.url });

  let lastStatus = "";
  function publishStatus(): void {
    const view = definition.view(state);
    const status: StatusPayload = {
      state: view.state,
      label,
      data: { ...view.data, register: hex(wiring.register), ...(definition.direction === "input" && { vector: hex(wiring.vector) }) },
    };
    const text = JSON.stringify(status);
    if (text === lastStatus) return;
    lastStatus = text;
    client.send("status", "*", status);
  }

  client.on("input", (message) => {
    const input = definition.inputSchema.safeParse(message.payload);
    if (input.success) latchedInputs.push({ raw: message.payload, input: input.data });
    else client.reply(message, "error", { message: `bad input for ${definition.kind}` });
  });

  client.on("mem.data", (message) => {
    if (message.payload.address === wiring.register) register = message.payload.bytes[0] ?? null;
  });

  client.onTick((tick) => {
    for (const { input } of latchedInputs.splice(0)) state = definition.onInput(state, input);
    const result = definition.onTick(state, { tick, register });
    state = result.state;
    for (const effect of result.effects) {
      if (effect.kind === "irq") client.send("irq", "cpu", { vector: wiring.vector, priority: wiring.priority });
      if (effect.kind === "write") client.send("mem.write", "memory", { address: wiring.register, bytes: [effect.value & 0xff] });
      if (effect.kind === "read") client.send("mem.read", "memory", { address: wiring.register, length: 1 });
    }
    publishStatus();
  });

  client.on("reset", () => {
    state = definition.init(config);
    register = null;
    latchedInputs.length = 0;
    publishStatus();
  });

  client.on("snapshot.get", (message) => {
    let saved: Json;
    try {
      saved = definition.snapshot ? definition.snapshot(state) : state;
    } catch (error) {
      client.reply(message, "error", { message: `${options.id} can't be saved yet (a stretch module): ${(error as Error).message}` });
      return;
    }
    const inputs = latchedInputs.map((l) => l.raw);
    client.reply(message, "snapshot", { data: { kind: definition.kind, slot: wiring.slot, config: options.config ?? {}, state: saved, inputs } });
  });

  /** Read a saved snapshot back, or explain why it can't be used. Changes nothing. */
  function readSnapshot(data: Json): { state: State; inputs: Array<{ raw: Record<string, Json>; input: Input }> } | string {
    const saved = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};
    const restored = restoreState(definition, saved.state);
    if (restored === null) return `snapshot for ${options.id} is not a valid ${definition.kind} state`;
    const inputs: Array<{ raw: Record<string, Json>; input: Input }> = [];
    // Older saves have no `inputs`; that just means nothing was waiting.
    for (const raw of Array.isArray(saved.inputs) ? saved.inputs : []) {
      const input = definition.inputSchema.safeParse(raw);
      if (!input.success || typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return `snapshot for ${options.id} has an input that isn't valid for ${definition.kind}`;
      }
      inputs.push({ raw, input: input.data });
    }
    return { state: restored, inputs };
  }

  client.on("snapshot.check", (message) => {
    const read = readSnapshot(message.payload.data);
    if (typeof read === "string") client.reply(message, "error", { message: read });
    else client.reply(message, "ok", {});
  });

  client.on("snapshot.set", (message) => {
    const read = readSnapshot(message.payload.data);
    if (typeof read === "string") {
      client.reply(message, "error", { message: read });
      return;
    }
    state = read.state;
    latchedInputs.splice(0, latchedInputs.length, ...read.inputs);
    publishStatus();
    client.reply(message, "ok", {});
  });

  publishStatus();

  return { client, state: () => state, close: () => client.close() };
}

function restoreState<State extends Json, Input, Config>(
  definition: PeripheralDefinition<State, Input, Config>,
  saved: unknown,
): State | null {
  if (definition.restore) {
    try {
      return definition.restore(saved);
    } catch {
      return null;
    }
  }
  const parsed = definition.stateSchema.safeParse(saved);
  return parsed.success ? parsed.data : null;
}
