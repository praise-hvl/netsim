// The dashboard is a bus client like any other: it says hello with role "dashboard" and from
// then on the bus sends it a copy of every message (the tap). It never polls anyone.
// This file holds the plain-TypeScript side; use-bus.tsx wires it into React.
import { connect, DEFAULT_BUS_URL, type BusClient } from "@/components/client";
import { envelope, type Json, type Message, type MessageType, type PayloadOf } from "@/protocol/messages";

export const BUS_URL = process.env.NEXT_PUBLIC_BUS_URL ?? DEFAULT_BUS_URL;

/** How long to wait for a reply before giving up (the host or bus may not be running). */
const REPLY_TIMEOUT_MS = 5_000;

export type ControlAction = PayloadOf<"control">["action"];

/** Register handlers right after awaiting this: the bus's status replay arrives in the next task. */
export function connectDashboard(url: string = BUS_URL): Promise<BusClient> {
  const suffix = Math.random().toString(36).slice(2, 8);
  return connect({ id: `dashboard-${suffix}`, role: "dashboard", label: "Dashboard", url });
}

/** The `welcome` the handshake consumed, as a message, so the log and state can start from it. */
export function welcomeMessage(client: BusClient): Message {
  return envelope("welcome", "bus", client.id, client.welcome, { id: "bus-welcome", tick: client.tick });
}

/**
 * Everything the dashboard is allowed to say. `onSent` sees each outgoing message so the log
 * shows the dashboard's own traffic too.
 */
export function dashboardActions(client: BusClient, onSent: (message: Message) => void) {
  function send<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): string {
    const id = client.send(type, to, payload);
    onSent(envelope(type, client.id, to, payload, { id, tick: client.tick }));
    return id;
  }

  /** Send, then wait for the message whose `replyTo` is our id. `fault`/`error` replies reject. */
  function request<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): Promise<Message> {
    const id = send(type, to, payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`no reply to ${type} from ${to} after ${REPLY_TIMEOUT_MS / 1000} s`));
      }, REPLY_TIMEOUT_MS);
      // Replies arrive in a later event, so subscribing after sending can't miss one.
      const unsubscribe = client.onAny((reply) => {
        if (reply.replyTo !== id) return;
        clearTimeout(timer);
        unsubscribe();
        if (reply.type === "fault" || reply.type === "error") reject(new Error(`${reply.from}: ${reply.payload.message}`));
        else resolve(reply);
      });
    });
  }

  return {
    async control(action: ControlAction, ms?: number): Promise<void> {
      await request("control", "bus", { action, ...(ms !== undefined && { ms }) });
    },

    input(componentId: string, payload: Record<string, Json>): void {
      send("input", componentId, payload);
    },

    async loadProgram(name: string, address: number, bytes: number[]): Promise<void> {
      await request("program.load", "memory", { address, bytes });
      await request("process.add", "cpu", { name, start: address });
    },

    async addPeripheral(host: string, spawn: PayloadOf<"host.spawn">): Promise<void> {
      await request("host.spawn", host, spawn);
    },

    async removePeripheral(host: string, id: string): Promise<void> {
      await request("host.remove", host, { id });
    },

    async save(name: string): Promise<void> {
      await request("save", "bus", { name });
    },

    async restore(name: string): Promise<void> {
      await request("restore", "bus", { name });
    },
  };
}

export type DashboardActions = ReturnType<typeof dashboardActions>;
