// `npm run bus`: start the bus from the command line.
//   BUS_HOST  where to listen (default 127.0.0.1; 0.0.0.0 to accept the classroom LAN)
//   BUS_PORT  default 3006
//   BUS_SPEED ms per tick while running (default 500)
import { startBus } from "@/bus/ws-server";

const bus = await startBus({ speedMs: Number(process.env.BUS_SPEED ?? 500), log: true });

function shutdown() {
  void bus.close().then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
