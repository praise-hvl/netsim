"use client";
// The data feed as a React hook: frames from a recorded trace, a live bus, or a whole machine
// running in this page. This and the pure files next to it (trace.ts, frames.ts, stream.ts) are
// the whole feed; nothing here knows how the board is drawn, and nothing needs Node.
import { useEffect, useRef, useState } from "react";
import type { BusClient } from "@/components/client";
import type { Machine } from "@/components/machine";
import { envelope, type Message, type PayloadOf } from "@/protocol/messages";
import { BUS_URL, connectDashboard, welcomeMessage } from "@/app/_lib/bus-connection";
import { buildFrames, type Frame } from "@/board/feed/frames";
import { appendMessages, createStream, withOpenTick } from "@/board/feed/stream";
import { parseTrace } from "@/board/feed/trace";
import { extraProgramsFor } from "@/board/feed/tally-programs";

export type Source =
  | { kind: "trace"; name: TraceName }
  /** A bus somewhere else, e.g. the class bus: ws://... */
  | { kind: "live"; url: string }
  /**
   * A whole machine (bus, memory, CPU, devices) started in this page: works with no server at
   * all. It runs your own code, so until that's finished it can't start; then the board shows
   * the `fallback` recording instead (if there is one) and says why.
   */
  | { kind: "machine"; cores: number; fallback?: TraceName };

/** Core counts offered for the in-page machine. Any count 1-8 works through ?source=machine&cores=N. */
export const MACHINE_CORES = [2, 8] as const;

/** The recordings that come with the board (scripts/board/record-trace.ts makes them). */
export const TRACES = {
  "2-cores": { label: "Recording · 2 cores", load: () => import("@/board/recordings/trace-2-cores.json") },
  "8-cores": { label: "Recording · 8 cores", load: () => import("@/board/recordings/trace-8-cores.json") },
} as const;
export type TraceName = keyof typeof TRACES;

/** What a live bus (or the in-page machine) lets the board do. */
export type LiveControls = {
  press(id: string): void;
  control(action: "start" | "stop" | "step"): void;
};

export type Feed = {
  frames: Frame[];
  state: "loading" | "ready" | "connecting" | "live" | "closed";
  about: string;
  error: string | null;
  live: LiveControls | null;
  /** Why the in-page machine couldn't start (e.g. "TODO(week 5: encode) ..."), or null. */
  machineError?: string | null;
};

const RETRY_MS = 2000;

export function useFeed(source: Source): Feed {
  const bus = useBusFeed(source.kind === "live" ? source.url : null, source.kind === "machine" ? source.cores : null);
  // A machine that can't start yet shows its fallback recording instead, if it has one.
  const fallback = source.kind === "machine" && bus.machineError ? (source.fallback ?? null) : null;
  const trace = useTraceFeed(source.kind === "trace" ? source.name : fallback);
  if (source.kind === "trace") return trace;
  if (fallback && bus.machineError) {
    const about = `Your machine can't run in the page yet (${bus.machineError}), so this is a recorded run instead. Once that part is built, your own machine runs here.`;
    return { ...trace, about };
  }
  return bus;
}

const LOADING: Feed = { frames: [], state: "loading", about: "", error: null, live: null };

function useTraceFeed(name: TraceName | null): Feed {
  // Remember which recording a feed came from, so switching shows "loading" until the new one is in.
  const [loaded, setLoaded] = useState<{ name: TraceName; feed: Feed } | null>(null);
  useEffect(() => {
    if (name === null) return;
    let stopped = false;
    TRACES[name]
      .load()
      .then((module) => {
        if (stopped) return;
        const trace = parseTrace(module.default);
        setLoaded({ name, feed: { frames: buildFrames(trace.components, trace.messages), state: "ready", about: trace.about, error: null, live: null } });
      })
      .catch((error: unknown) => {
        if (!stopped) setLoaded({ name, feed: { ...LOADING, state: "closed", error: error instanceof Error ? error.message : String(error) } });
      });
    return () => {
      stopped = true;
    };
  }, [name]);
  return loaded !== null && loaded.name === name ? loaded.feed : LOADING;
}

/** Frames from a bus: the one at `url`, or (with `machineCores`) a machine started in this page. */
function useBusFeed(url: string | null, machineCores: number | null): Feed {
  const [feed, setFeed] = useState<Feed>({ frames: [], state: "connecting", about: "", error: null, live: null });
  const stream = useRef(createStream());

  useEffect(() => {
    if (url === null && machineCores === null) return;
    let stopped = false;
    let client: BusClient | null = null;
    let machine: Machine | null = null;
    /** The extra programs are loaded once per machine, not again on a reconnect. */
    let machineReady = false;
    let frame = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const queue: Message[] = [];

    // At a fast clock the bus sends hundreds of messages a second; draw once per screen frame.
    function enqueue(message: Message): void {
      queue.push(message);
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        stream.current = appendMessages(stream.current, queue.splice(0));
        setFeed((f) => ({ ...f, frames: withOpenTick(stream.current) }));
      });
    }

    let seq = 0;
    /** Send a request and wait for its answer; the board shows it too, since the bus doesn't echo our own messages. */
    async function requestShown<T extends "program.load" | "process.add">(c: BusClient, type: T, to: string, payload: PayloadOf<T>): Promise<void> {
      enqueue(envelope(type, c.id, to, payload, { id: `${c.id}-${type}-${seq++}`, tick: c.tick }));
      await c.request(type, to, payload);
    }

    async function open(): Promise<void> {
      setFeed((f) => ({ ...f, state: "connecting", error: null, machineError: null }));
      try {
        let target = url ?? BUS_URL;
        if (machineCores !== null) {
          if (!machine) {
            const { startMachine } = await import("@/components/machine");
            // A fresh bus name every time: React runs effects twice in development, and a name
            // is only free again once the machine that had it has closed.
            // Paused: the board loads any extra programs first, then starts the clock (below).
            const started = await startMachine({ name: `board-${Math.random().toString(36).slice(2, 8)}`, cores: machineCores, start: false });
            if (stopped) return void started.close();
            machine = started;
          }
          target = machine.url;
        }
        client = await connectDashboard(target);
        if (stopped) return void client.close();
        const c = client;
        enqueue(welcomeMessage(c));
        c.onAny(enqueue);
        c.onClose(() => {
          if (stopped) return;
          setFeed((f) => ({ ...f, state: "closed", error: "lost the connection to the bus", live: null }));
          retry = setTimeout(open, RETRY_MS);
        });
        if (machineCores !== null && !machineReady) {
          machineReady = true;
          // The machine comes with countdown and blink; with more than 2 cores the board adds a
          // tally per core, so every lane has work (see tally-programs.ts). Then the clock starts.
          for (const program of extraProgramsFor(machineCores)) {
            await requestShown(c, "program.load", "memory", { address: program.address, bytes: program.bytes });
            await requestShown(c, "process.add", "cpu", { name: program.name, start: program.address });
            if (stopped) return;
          }
          c.send("control", "bus", { action: "start" });
        }
        const live: LiveControls = {
          press(id) {
            const sentId = c.send("input", id, { action: "press" });
            // The bus doesn't echo our own messages, so put the press on the board ourselves.
            enqueue({ type: "input", from: c.id, to: id, id: sentId, tick: c.tick, payload: { action: "press" } });
          },
          control(action) {
            c.send("control", "bus", { action });
          },
        };
        const about = machineCores !== null ? `An in-browser machine with ${machineCores} ${machineCores === 1 ? "core" : "cores"}, running in this page.` : `Live: the bus at ${url}.`;
        setFeed((f) => ({ ...f, state: "live", about, live }));
      } catch (error) {
        if (stopped) return;
        const message = error instanceof Error ? error.message : String(error);
        // A machine that can't start (its code isn't finished yet) won't start on a retry either;
        // only a connection to a bus somewhere else is worth retrying.
        if (machineCores !== null && machine === null) {
          const reason = message.replace(/^error from \w+: /, "");
          const about = `Your machine can't run in the page yet (${reason}). Pick a recording above to watch one meanwhile.`;
          setFeed((f) => ({ ...f, state: "closed", error: reason, about, machineError: reason }));
          return;
        }
        setFeed((f) => ({ ...f, state: "closed", error: message }));
        retry = setTimeout(open, RETRY_MS);
      }
    }

    stream.current = createStream();
    void open();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(retry);
      void client?.close();
      void machine?.close();
    };
  }, [url, machineCores]);
  return feed;
}
