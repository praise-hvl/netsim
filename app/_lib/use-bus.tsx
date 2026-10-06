"use client";
// Connects the dashboard to the bus once, and shares what it sees with every component below.
// Messages are batched per animation frame: at a fast clock the bus sends hundreds per second,
// and the screen only needs to redraw 60 times a second.
import { createContext, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { Message } from "@/protocol/messages";
import { connectDashboard, dashboardActions, welcomeMessage, type DashboardActions } from "@/app/_lib/bus-connection";
import { initialSystem, reduce, type SystemState } from "@/app/_lib/system-state";

export type Connection =
  | { phase: "connecting" }
  | { phase: "open"; id: string; actions: DashboardActions }
  | { phase: "closed"; error: string };

type BusContextValue = { connection: Connection; system: SystemState };

const BusContext = createContext<BusContextValue | null>(null);

const RETRY_MS = 2_000;

function reduceAll(state: SystemState, batch: Message[]): SystemState {
  return batch.reduce(reduce, state);
}

export function BusProvider({ children }: { children: ReactNode }) {
  const [system, apply] = useReducer(reduceAll, initialSystem);
  const [connection, setConnection] = useState<Connection>({ phase: "connecting" });
  const queue = useRef<Message[]>([]);

  useEffect(() => {
    let stopped = false;
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closeClient: (() => void) | undefined;

    function enqueue(message: Message): void {
      queue.current.push(message);
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply(queue.current.splice(0));
        });
      }
    }

    async function open(): Promise<void> {
      setConnection({ phase: "connecting" });
      try {
        const client = await connectDashboard();
        if (stopped) return void client.close();
        enqueue(welcomeMessage(client));
        client.onAny(enqueue);
        client.onClose(() => {
          if (stopped) return;
          setConnection({ phase: "closed", error: "lost the connection to the bus" });
          retry = setTimeout(open, RETRY_MS);
        });
        closeClient = () => void client.close();
        setConnection({ phase: "open", id: client.id, actions: dashboardActions(client, enqueue) });
      } catch (error) {
        if (stopped) return;
        setConnection({ phase: "closed", error: error instanceof Error ? error.message : String(error) });
        retry = setTimeout(open, RETRY_MS);
      }
    }

    void open();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      closeClient?.();
    };
  }, []);

  return <BusContext.Provider value={{ connection, system }}>{children}</BusContext.Provider>;
}

export function useBus(): BusContextValue {
  const value = useContext(BusContext);
  if (!value) throw new Error("useBus() must be used inside <BusProvider>");
  return value;
}

/** The dashboard's actions, or null while it isn't connected. */
export function useActions(): DashboardActions | null {
  const { connection } = useBus();
  return connection.phase === "open" ? connection.actions : null;
}
