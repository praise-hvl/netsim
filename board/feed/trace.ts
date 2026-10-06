// A recorded run, for replaying the board without a bus. It is just what a dashboard saw on
// the tap, in order, so a replay goes through exactly the same code as a live connection.
// scripts/board/record-trace.ts makes one.
import { z } from "zod";
import { componentInfo, messageSchema, type ComponentInfo, type Message } from "@/protocol/messages";

export type VizTrace = {
  version: 1;
  about: string;
  cores: number;
  /** Everyone connected when the recording started (the bus's welcome list, plus later joins). */
  components: ComponentInfo[];
  messages: Message[];
};

const traceSchema = z.object({
  version: z.literal(1),
  about: z.string(),
  cores: z.number().int().min(1),
  components: z.array(componentInfo),
  messages: z.array(messageSchema),
});

/** Check a trace loaded from a file. Throws with the reason when it isn't one. */
export function parseTrace(value: unknown): VizTrace {
  return traceSchema.parse(value);
}
