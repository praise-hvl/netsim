// The bus inside a web page (or one Node process): no server, no network. Components connect
// to `inpage://<name>` exactly as they would to `ws://…`, and connect() in components/client.ts
// picks this transport by the URL. Each connection is a MessageChannel, so messages are strings
// delivered asynchronously, like a WebSocket's (and a Web Worker transport could drop in later).
import { createBus, type Bus, type BusCore, type BusCoreOptions } from "@/bus/server";

const SCHEME = "inpage://";
/** Sent through a port to say "this side has closed". Real messages are JSON, so it can't clash. */
const CLOSE = "\u0000close";

const buses = new Map<string, BusCore>();

export function isInPageUrl(url: string): boolean {
  return url.startsWith(SCHEME);
}

/** Start a bus that components in this page reach at `inpage://<name>`. */
export function startInPageBus(options: BusCoreOptions & { name?: string } = {}): Bus {
  const name = options.name ?? "bus";
  if (buses.has(name)) throw new Error(`an in-page bus called "${name}" is already running`);
  const bus = createBus(options);
  buses.set(name, bus);
  return {
    url: `${SCHEME}${name}`,
    port: 0,
    tick: () => bus.tick(),
    step: () => bus.step(),
    waitForComponents: (count) => bus.waitForComponents(count),
    async close() {
      bus.shutdown();
      buses.delete(name);
    },
  };
}

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/**
 * The part of a WebSocket that connect() uses, over a MessageChannel to an in-page bus.
 * It opens, delivers and closes asynchronously, as a real WebSocket does.
 */
export class InPageSocket {
  readyState = CONNECTING;
  readonly url: string;
  private readonly port: MessagePort;
  private readonly events = new EventTarget();

  constructor(url: string) {
    this.url = url;
    const channel = new MessageChannel();
    this.port = channel.port1;
    const bus = buses.get(url.slice(SCHEME.length));

    if (!bus) {
      channel.port1.close();
      channel.port2.close();
      setTimeout(() => {
        this.readyState = CLOSED;
        this.events.dispatchEvent(new Event("error"));
        this.events.dispatchEvent(new Event("close"));
      }, 0);
      return;
    }

    // The bus's end of the channel.
    const busSide = channel.port2;
    const attached = bus.attach({
      send: (text) => busSide.postMessage(text),
      close: () => {
        busSide.postMessage(CLOSE);
        busSide.close();
        attached.closed();
      },
    });
    busSide.onmessage = (event: MessageEvent<string>) => {
      if (event.data === CLOSE) {
        busSide.close();
        attached.closed();
      } else attached.receive(event.data);
    };

    // Our end.
    this.port.onmessage = (event: MessageEvent<string>) => {
      if (event.data === CLOSE) this.finishClose();
      else if (this.readyState === OPEN) this.events.dispatchEvent(new MessageEvent("message", { data: event.data }));
    };
    setTimeout(() => {
      if (this.readyState !== CONNECTING) return;
      this.readyState = OPEN;
      this.events.dispatchEvent(new Event("open"));
    }, 0);
  }

  addEventListener(type: "open" | "close" | "error", listener: () => void, options?: { once?: boolean }): void;
  addEventListener(type: "message", listener: (event: MessageEvent) => void, options?: { once?: boolean }): void;
  addEventListener(type: string, listener: ((event: MessageEvent) => void) | (() => void), options?: { once?: boolean }): void {
    this.events.addEventListener(type, listener as EventListener, options);
  }

  removeEventListener(type: "message", listener: (event: MessageEvent) => void): void {
    this.events.removeEventListener(type, listener as EventListener);
  }

  send(text: string): void {
    if (this.readyState === OPEN) this.port.postMessage(text);
  }

  close(): void {
    if (this.readyState === CLOSED) return;
    this.port.postMessage(CLOSE);
    this.finishClose();
  }

  private finishClose(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.port.close();
    // A WebSocket reports close asynchronously too.
    setTimeout(() => this.events.dispatchEvent(new Event("close")), 0);
  }
}
