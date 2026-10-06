// A bus logger: connects like a dashboard (so it sees every message) and prints one line per
// message, pairing each reply with its request to show how long it took.
//   12  cpu → memory   mem.read 0x010 ×4                 cpu-88
//   12  memory → cpu   mem.data 4 bytes      ↩ cpu-88     2 ms
import { connect, type BusClient } from "@/components/client";
import { hex } from "@/protocol/memory-map";
import type { Message } from "@/protocol/messages";

/** A short human description of a message's payload. */
export function describe(message: Message): string {
  switch (message.type) {
    case "mem.read":
      return `${hex(message.payload.address)} ×${message.payload.length}`;
    case "mem.data":
      return `${message.payload.bytes.length} bytes`;
    case "mem.write":
      return `${hex(message.payload.address)} ← [${message.payload.bytes.join(", ")}]`;
    case "program.load":
      return `${message.payload.bytes.length} bytes at ${hex(message.payload.address)}`;
    case "irq":
      return `vector ${hex(message.payload.vector)} priority ${message.payload.priority}`;
    case "fault":
    case "error":
      return message.payload.message;
    case "status":
      return message.payload.state;
    default:
      return "";
  }
}

/** Formats messages one per line, timing each reply against its request. */
export function createLineFormatter(now: () => number = () => Date.now()): (message: Message) => string {
  const sentAt = new Map<string, number>();
  return (message) => {
    sentAt.set(message.id, now());
    const started = message.replyTo === undefined ? undefined : sentAt.get(message.replyTo);
    const latency = started === undefined ? "" : `  ${now() - started} ms`;
    const reply = message.replyTo === undefined ? "" : `  ↩ ${message.replyTo}`;
    const route = `${message.from} → ${message.to}`.padEnd(22);
    return `${String(message.tick).padStart(5)}  ${route} ${message.type} ${describe(message)}`.padEnd(70) + `${message.id}${reply}${latency}`;
  };
}

export type LoggerOptions = {
  url?: string;
  /** Skip the per-tick chatter (tick, tick.done, status). Default true. */
  quiet?: boolean;
  print?: (line: string) => void;
};

export async function startLogger(options: LoggerOptions = {}): Promise<BusClient> {
  const client = await connect({ id: "logger", role: "dashboard", label: "Logger", url: options.url });
  const format = createLineFormatter();
  const print = options.print ?? console.log;
  const skip = new Set<string>(options.quiet === false ? [] : ["tick", "tick.done", "status"]);
  client.onAny((message) => {
    if (!skip.has(message.type)) print(format(message));
  });
  return client;
}
