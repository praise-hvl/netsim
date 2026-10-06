// `npm run component -- memory cpu host`: start one or more components and keep them running.
// Retries until the bus is up, so it can be started at the same time as the bus.
// Set LOG=1 to also print every message on the bus.
import { busUrl } from "@/components/client";
import { startCpu } from "@/components/cpu";
import { startHost } from "@/components/host";
import { startLogger } from "@/components/logger";
import { startMemory } from "@/components/memory";

const STARTERS: Record<string, () => Promise<{ close(): Promise<void> }>> = {
  memory: () => startMemory(),
  // CPU_CORES=4 npm run component -- cpu   (1-8, default 2)
  cpu: () => startCpu({ cores: process.env.CPU_CORES ? Number(process.env.CPU_CORES) : undefined }),
  host: () => startHost(),
  logger: async () => {
    const client = await startLogger();
    return { close: () => client.close() };
  },
};

async function withRetry<T>(name: string, start: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await start();
    } catch (error) {
      if (attempt >= 30) throw error;
      if (attempt === 1) console.log(`[${name}] waiting for the bus at ${busUrl()}…`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

const names = process.argv.slice(2);
if (process.env.LOG === "1" && !names.includes("logger")) names.push("logger");
const unknown = names.filter((name) => !STARTERS[name]);
if (names.length === 0 || unknown.length > 0) {
  console.error(`usage: npm run component -- <${Object.keys(STARTERS).join("|")}> ...`);
  process.exit(1);
}

const running: Array<{ close(): Promise<void> }> = [];
for (const name of names) {
  running.push(await withRetry(name, STARTERS[name]));
  console.log(`[${name}] connected to ${busUrl()}`);
}

async function shutdown() {
  for (const component of running) await component.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
