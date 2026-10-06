// The bus served over WebSockets, for `npm run bus` and the tests. The bus itself is in
// bus/server.ts; this file only connects WebSocket clients to it, and keeps saves in files.
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";
import { createBus, type Bus, type BusCoreOptions } from "@/bus/server";
import { restoreSave, writeSave } from "@/bus/saves";

export type BusOptions = Omit<BusCoreOptions, "saves"> & {
  /** Default 127.0.0.1 (this machine only). Use 0.0.0.0 to let a classroom LAN connect. */
  host?: string;
  /** Default 3006. Use 0 in tests to get a free port. */
  port?: number;
  /** Where save files go. Default: saves/ */
  savesDir?: string;
};

export async function startBus(options: BusOptions = {}): Promise<Bus> {
  const host = options.host ?? process.env.BUS_HOST ?? "127.0.0.1";
  const requestedPort = options.port ?? Number(process.env.BUS_PORT ?? 3006);
  const savesDir = options.savesDir ?? "saves";
  const bus = createBus({
    ...options,
    saves: {
      write: (name, io) => writeSave(savesDir, name, io),
      restore: (name, io) => restoreSave(savesDir, name, io),
    },
  });

  const server = new WebSocketServer({ host, port: requestedPort });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const port = (server.address() as AddressInfo).port;

  server.on("connection", (socket) => {
    const attached = bus.attach({
      send: (text) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(text);
      },
      close: () => socket.close(),
    });
    socket.on("message", (data) => attached.receive(data.toString()));
    socket.on("close", () => attached.closed());
  });

  if (options.log) console.log(`[bus] listening on ws://${host}:${port}`);

  return {
    url: `ws://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`,
    port,
    tick: () => bus.tick(),
    step: () => bus.step(),
    waitForComponents: (count) => bus.waitForComponents(count),
    async close() {
      bus.shutdown();
      for (const socket of server.clients) socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
