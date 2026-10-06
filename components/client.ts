// The shell every component uses to talk to the bus: say hello, send messages, answer ticks.
// Uses the standard WebSocket (built into Node 22+ and every browser), so the dashboard can
// use it too.
import {
  envelope,
  parseMessage,
  type ComponentInfo,
  type Message,
  type MessageOf,
  type MessageType,
  type PayloadOf,
} from "@/protocol/messages";
import { InPageSocket, isInPageUrl } from "@/bus/in-page";
import { todo } from "@/core/todo";

/**
 * The part of a WebSocket that connect() uses. A real WebSocket has it; so does InPageSocket,
 * which reaches a bus running in the same page (an `inpage://` address).
 */
export type BusSocket = {
  readonly readyState: number;
  readonly url: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "close" | "error", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void, options?: { once?: boolean }): void;
  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};

/** ws:// (a bus server) or inpage:// (a bus in this page): the rest of connect() can't tell. */
function openSocket(url: string): BusSocket {
  return isInPageUrl(url) ? new InPageSocket(url) : new WebSocket(url);
}

export const DEFAULT_BUS_URL = "ws://localhost:3006";

export function busUrl(): string {
  return globalThis.process?.env?.BUS_URL ?? DEFAULT_BUS_URL;
}

export type ClientOptions = Omit<ComponentInfo, "id"> & {
  id: string;
  /** Defaults to $BUS_URL, then ws://localhost:3006. */
  url?: string;
};

export type Welcome = PayloadOf<"welcome">;

type Handler<T extends MessageType> = (message: MessageOf<T>) => void;

export type BusClient = {
  readonly id: string;
  /** The last tick this client saw. Stamped on every message it sends. */
  readonly tick: number;
  readonly welcome: Welcome;
  send<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>, replyTo?: string): string;
  reply<T extends MessageType>(request: Message, type: T, payload: PayloadOf<T>): string;
  /** Send and wait for the reply. Rejects if the reply is `fault` or `error`. */
  request<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): Promise<Message>;
  on<T extends MessageType>(type: T, handler: Handler<T>): () => void;
  onAny(handler: (message: Message) => void): () => void;
  /** Runs on every tick. `tick.done` is sent automatically after all tick handlers return. */
  onTick(handler: (tick: number) => void): () => void;
  onClose(handler: () => void): () => void;
  close(): Promise<void>;
};

type Pending = { resolve: (reply: Message) => void; reject: (error: Error) => void };

export async function connect(options: ClientOptions): Promise<BusClient> {
  const socket = openSocket(options.url ?? busUrl());
  let tick = 0;
  let nextId = 1;
  const handlers = new Map<MessageType, Set<(message: Message) => void>>();
  const anyHandlers = new Set<(message: Message) => void>();
  const tickHandlers = new Set<(tick: number) => void>();
  const closeHandlers = new Set<() => void>();
  const pending = new Map<string, Pending>();

  function sendRaw(message: Message): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function send<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>, replyTo?: string): string {
    const id = `${options.id}-${nextId++}`;
    sendRaw(envelope(type, options.id, to, payload, { id, tick, replyTo }));
    return id;
  }

  function request<T extends MessageType>(type: T, to: string, payload: PayloadOf<T>): Promise<Message> {
    // @student week=3 part=class id=client-request "Send with a fresh id and resolve when the matching reply arrives"
    // TODO(week 3, client-request): Send with a fresh id and resolve when the matching reply arrives
    // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
    return todo("week 3: client-request", type, to, payload);
    // @end
  }

  function settle(reply: Message): void {
    const waiting = reply.replyTo === undefined ? undefined : pending.get(reply.replyTo);
    if (!waiting || reply.replyTo === undefined) return;
    pending.delete(reply.replyTo);
    if (reply.type === "fault" || reply.type === "error") {
      waiting.reject(new Error(`${reply.type} from ${reply.from}: ${reply.payload.message}`));
    } else {
      waiting.resolve(reply);
    }
  }

  function handleTick(message: MessageOf<"tick">): void {
    // @student week=3 part=home id=handle-tick "Remember the tick, run the tick handlers, then send tick.done to the bus"
    // TODO(week 3, handle-tick): Remember the tick, run the tick handlers, then send tick.done to the bus
    // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
    return todo("week 3: handle-tick", message);
    // @end
  }

  /**
   * Run one handler. If it throws (often a part that isn't built yet: a `todo(...)` stub), say
   * so and carry on: one broken handler mustn't take the whole component down.
   */
  function safely(what: string, run: () => void): boolean {
    try {
      run();
      return true;
    } catch (error) {
      console.error(`[${options.id}] ${what} failed: ${(error as Error).message}`);
      return false;
    }
  }

  function dispatch(message: Message): void {
    // Acknowledge a reset first, so the bus accepts what the reset handlers send next.
    if (message.type === "reset") send("ok", "bus", {}, message.id);
    if (message.type === "tick" && !safely(`tick ${message.tick}`, () => handleTick(message))) {
      // Still finish the tick, so the rest of the machine keeps running.
      send("tick.done", "bus", {});
    }
    settle(message);
    for (const handler of handlers.get(message.type) ?? []) safely(message.type, () => handler(message));
    for (const handler of anyHandlers) safely(message.type, () => handler(message));
  }

  // Listen from the very start. The bus sends `welcome` and then, in the same burst, things
  // like the latest statuses; those are held back until the caller has had a chance to
  // register its handlers (right after `await connect()`), then delivered in order.
  const early: Message[] = [];
  let delivering = false;
  socket.addEventListener("message", (event: MessageEvent) => {
    const parsed = parseMessage(String(event.data));
    if (!parsed.ok) return console.warn(`[${options.id}] ignored a bad message: ${parsed.error}`);
    if (parsed.message.type === "welcome" && !delivering) return; // the handshake's job
    if (delivering) dispatch(parsed.message);
    else early.push(parsed.message);
  });

  const welcome = await handshake(socket, options);
  tick = welcome.tick;
  setTimeout(() => {
    for (const message of early.splice(0)) dispatch(message);
    delivering = true;
  }, 0);
  socket.addEventListener("close", () => {
    for (const waiting of pending.values()) waiting.reject(new Error("connection closed"));
    pending.clear();
    for (const handler of closeHandlers) handler();
  });

  function subscribe<V>(set: Set<V>, value: V): () => void {
    set.add(value);
    return () => set.delete(value);
  }

  return {
    id: options.id,
    get tick() {
      return tick;
    },
    welcome: welcome.payload,
    send,
    reply: (req, type, payload) => send(type, req.from, payload, req.id),
    request,
    on(type, handler) {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      return subscribe(set, handler as (message: Message) => void);
    },
    onAny: (handler) => subscribe(anyHandlers, handler),
    onTick: (handler) => subscribe(tickHandlers, handler),
    onClose: (handler) => subscribe(closeHandlers, handler),
    close() {
      if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
      return new Promise((resolve) => {
        socket.addEventListener("close", () => resolve(), { once: true });
        socket.close();
      });
    },
  };
}

/** Open the socket, send `hello`, and wait for the bus to answer with `welcome`. */
function handshake(socket: BusSocket, options: ClientOptions): Promise<MessageOf<"welcome">> {
  // @student week=3 part=class id=handshake "Wait for the socket to open, send hello, resolve on welcome, reject on error"
  // TODO(week 3, handshake): Wait for the socket to open, send hello, resolve on welcome, reject on error
  // Tests: tests/week-03/   Guide: docs/weeks/week-03.md
  return todo("week 3: handshake", socket, options);
  // @end
}
