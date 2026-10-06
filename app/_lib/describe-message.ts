// One short line per message for the log, so the protocol reads like a conversation.
import type { Message } from "@/protocol/messages";
import { hex } from "@/protocol/memory-map";
import { hex2 } from "@/app/_lib/format";

const bytes = (list: number[]) => (list.length > 8 ? `${list.slice(0, 8).map(hex2).join(" ")} …` : list.map(hex2).join(" "));

export function describeMessage(message: Message): string {
  switch (message.type) {
    case "mem.read":
      return `${hex(message.payload.address)} ×${message.payload.length}`;
    case "mem.data":
      return `${hex(message.payload.address)} [${bytes(message.payload.bytes)}]`;
    case "mem.write":
    case "program.load":
      return `${hex(message.payload.address)} ← [${bytes(message.payload.bytes)}]`;
    case "mem.ack":
      return `${hex(message.payload.address)} ×${message.payload.length}`;
    case "irq":
      return `vector ${hex(message.payload.vector)} priority ${message.payload.priority}`;
    case "status":
      return `${message.payload.state}`;
    case "control":
      return message.payload.ms === undefined ? message.payload.action : `${message.payload.action} ${message.payload.ms} ms`;
    case "hello":
    case "joined":
      return `${message.payload.role}${message.payload.kind ? ` (${message.payload.kind})` : ""} "${message.payload.label}"`;
    case "welcome":
      return `${message.payload.components.length} others connected`;
    case "left":
      return message.payload.id;
    case "process.add":
      return `${message.payload.name} at ${hex(message.payload.start)}`;
    case "host.spawn":
      return `${message.payload.kind} as ${message.payload.id}`;
    case "host.remove":
      return message.payload.id;
    case "save":
    case "restore":
      return message.payload.name;
    case "fault":
      return `${message.payload.code}: ${message.payload.message}`;
    case "error":
      return message.payload.message;
    case "input":
      return JSON.stringify(message.payload);
    default:
      return "";
  }
}
