// Everything the dashboard knows, rebuilt from the messages it sees on the bus tap.
// `reduce` is a pure function: (state, message) -> state. No sockets, no React, easy to test.
import type { ComponentInfo, Message, MessageType, StatusPayload } from "@/protocol/messages";

export type ComponentEntry = {
  info: ComponentInfo;
  /** The last `status` this component sent, or null until it sends one. */
  status: StatusPayload | null;
};

/** One `from -> to` pair the dashboard has seen a message on. Becomes an edge. */
export type Link = {
  from: string;
  to: string;
  lastType: MessageType;
  lastTick: number;
  /** Log sequence number of the last message, to tell which of two links spoke last. */
  lastSeq: number;
  count: number;
};

export type LogEntry = { seq: number; message: Message };

export type SystemState = {
  tick: number;
  running: boolean;
  speedMs: number;
  /** Components the bus's watchdog gave up waiting for. */
  stalled: string[];
  components: Record<string, ComponentEntry>;
  /** Keyed by `from>to`. */
  links: Record<string, Link>;
  /** Newest last. Capped at LOG_LIMIT entries. */
  log: LogEntry[];
  nextSeq: number;
};

export const LOG_LIMIT = 2000;

/** Roles that get a node on the canvas. The host and dashboards are plumbing, not hardware. */
const DRAWN_ROLES: ReadonlySet<ComponentInfo["role"]> = new Set(["cpu", "memory", "peripheral"]);

export const initialSystem: SystemState = {
  tick: 0,
  running: false,
  speedMs: 500,
  stalled: [],
  components: {},
  links: {},
  log: [],
  nextSeq: 1,
};

export function reduce(state: SystemState, message: Message): SystemState {
  const next = { ...state, ...logged(state, message) };

  switch (message.type) {
    case "welcome": {
      // A welcome starts a new session (first connect, or a reconnect after the bus restarted):
      // forget old links and statuses. The bus replays every current status right after it.
      const components: Record<string, ComponentEntry> = {};
      for (const info of message.payload.components) components[info.id] = { info, status: null };
      const { running, speedMs } = message.payload;
      return { ...next, tick: message.tick, running, speedMs, stalled: [], components, links: {} };
    }
    case "joined": {
      const info = message.payload;
      return { ...next, components: { ...state.components, [info.id]: { info, status: null } } };
    }
    case "left":
      return { ...next, components: without(state.components, message.payload.id), links: linksWithout(state.links, message.payload.id) };
    case "tick":
      return { ...next, tick: message.tick };
    case "reset":
      return { ...next, tick: 0, running: false, links: {} };
    case "status":
      return withStatus(next, message.from, message.payload);
    case "control":
      return withControl(next, message.payload);
    default:
      return { ...next, links: withLink(state, message) };
  }
}

/** Components that should be drawn, in a stable order (cpu, memory, then peripherals by id). */
export function drawnComponents(state: SystemState): ComponentEntry[] {
  const order = { cpu: 0, memory: 1, peripheral: 2, host: 3, dashboard: 4 };
  return Object.values(state.components)
    .filter((entry) => DRAWN_ROLES.has(entry.info.role))
    .sort((a, b) => order[a.info.role] - order[b.info.role] || a.info.id.localeCompare(b.info.id));
}

/** A link is "hot" while messages are crossing it: this tick or the one before. */
export function isHot(link: Link, tick: number): boolean {
  return link.lastTick >= tick - 1;
}

function logged(state: SystemState, message: Message): Pick<SystemState, "log" | "nextSeq"> {
  const log = [...state.log, { seq: state.nextSeq, message }];
  return { log: log.length > LOG_LIMIT ? log.slice(log.length - LOG_LIMIT) : log, nextSeq: state.nextSeq + 1 };
}

function withStatus(state: SystemState, from: string, status: StatusPayload): SystemState {
  // The bus reports its own clock as a status from "bus" at the end of every tick.
  if (from === "bus") {
    const { tick, speedMs, running, stalled } = status.data;
    return {
      ...state,
      tick: typeof tick === "number" ? tick : state.tick,
      speedMs: typeof speedMs === "number" ? speedMs : state.speedMs,
      running: typeof running === "boolean" ? running : state.running,
      stalled: Array.isArray(stalled) ? stalled.filter((id): id is string => typeof id === "string") : state.stalled,
    };
  }
  const entry = state.components[from];
  if (!entry) return state; // a status from someone we never saw join: nothing to draw it on
  return { ...state, components: { ...state.components, [from]: { ...entry, status } } };
}

/** Apply a clock control straight away; the bus's next status confirms it. */
function withControl(state: SystemState, control: Extract<Message, { type: "control" }>["payload"]): SystemState {
  switch (control.action) {
    case "start":
      return { ...state, running: true };
    case "stop":
      return { ...state, running: false };
    case "speed":
      return control.ms === undefined ? state : { ...state, speedMs: control.ms };
    default:
      return state;
  }
}

/** Remember that a message went from one drawn component to another. */
function withLink(state: SystemState, message: Message): Record<string, Link> {
  const from = state.components[message.from];
  const to = state.components[message.to];
  if (!from || !to || !DRAWN_ROLES.has(from.info.role) || !DRAWN_ROLES.has(to.info.role)) return state.links;
  const key = `${message.from}>${message.to}`;
  const count = (state.links[key]?.count ?? 0) + 1;
  return { ...state.links, [key]: { from: message.from, to: message.to, lastType: message.type, lastTick: message.tick, lastSeq: state.nextSeq, count } };
}

function without<V>(record: Record<string, V>, id: string): Record<string, V> {
  const copy = { ...record };
  delete copy[id];
  return copy;
}

function linksWithout(links: Record<string, Link>, id: string): Record<string, Link> {
  return Object.fromEntries(Object.entries(links).filter(([, link]) => link.from !== id && link.to !== id));
}
