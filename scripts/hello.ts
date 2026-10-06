// `npm run hello`: say hello to the bus and watch who comes and goes.
//   BUS_URL=ws://<Praise's bus address, on the board>:3006 HELLO_ID=<your-github-username> npm run hello
// Ids are lowercase letters, digits and dashes, so HELLO_ID is lowercased (Ada-L -> ada-l).
import { pathToFileURL } from "node:url";
import { busUrl, connect, type BusClient } from "@/components/client";
import { todo } from "@/core/todo";

export type HelloOptions = { id: string; url?: string; print?: (line: string) => void };

/** Connect, say who is already here, then report every join, leave and 10th tick. */
export async function hello(options: HelloOptions): Promise<BusClient> {
  // @student week=stretch part=home id=hello-script "Connect with your id, print who is already here, then print joined/left and every 10th tick"
  // TODO(stretch, hello-script): Connect with your id, print who is already here, then print joined/left and every 10th tick
  // Tests: tests/stretch/   Guide: docs/stretch/
  return todo("stretch: hello-script", options);
  // @end
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = (process.env.HELLO_ID ?? `student-${Math.floor(Math.random() * 1000)}`).toLowerCase();
  console.log(`bus: ${busUrl()}`);
  const client = await hello({ id });
  client.onClose(() => {
    console.log("the bus closed the connection");
    process.exit(0);
  });
}
