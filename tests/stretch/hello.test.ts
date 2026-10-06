import { expect, it } from "vitest";
import { hello } from "@/scripts/hello";
import { nextMessage, onCleanup, recorder, testBus, testClient } from "@/tests/helpers";

it("the hello script reports who is here, who comes and goes, and every 10th tick", async () => {
  const bus = await testBus();
  const rec = await recorder(bus);
  const lines: string[] = [];
  const client = await hello({ id: "ada", url: bus.url, print: (line) => lines.push(line) });
  onCleanup(() => client.close());

  expect(lines[0]).toBe("connected as ada at tick 0");
  expect(lines[1]).toBe("already here: dash (dashboard)");

  const grace = await testClient(bus, { id: "grace", role: "peripheral", label: "Grace" });
  await rec.steps(10);
  const left = nextMessage(client, (m) => m.type === "left");
  await grace.close();
  await left;

  expect(lines).toContain("+ grace joined as peripheral");
  expect(lines).toContain("- grace left");
  expect(lines).toContain("tick 10");
  expect(lines).not.toContain("tick 9");
});
