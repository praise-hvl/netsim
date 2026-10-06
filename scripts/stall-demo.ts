// `npm run stall-demo [-- <id>]`: a peripheral that joins the bus and then never answers a tick.
// Week 6 uses it to watch the bus's watchdog: within tickTimeoutMs (2 s) the bus marks it
// `stalled` and carries on without it. (Stopping a real component with Ctrl-C is different: its
// connection closes and the bus reports `left`.)
import { pathToFileURL } from "node:url";
import { busUrl } from "@/components/client";
import { envelope } from "@/protocol/messages";

/** Connect, say hello, and then stay silent. Resolves once connected; call close() to leave. */
export async function startSilentPeripheral(url: string, id = "silent"): Promise<{ close(): void }> {
  const socket = new WebSocket(url);
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error(`could not reach the bus at ${url}`)), { once: true });
  });
  const hello = envelope("hello", id, "bus", { role: "peripheral", kind: "silent", label: "Silent peripheral" }, { id: `${id}-hello`, tick: 0 });
  socket.send(JSON.stringify(hello));
  // Deliberately no message handler: ticks arrive and are never answered with tick.done.
  return { close: () => socket.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2] ?? "silent";
  const url = busUrl();
  await startSilentPeripheral(url, id);
  console.log(`'${id}' joined ${url} and will never answer a tick.`);
  console.log("Start the clock: within about 2 s the bus marks it stalled and keeps going. Ctrl-C to leave.");
  process.on("SIGINT", () => process.exit(0));
}
