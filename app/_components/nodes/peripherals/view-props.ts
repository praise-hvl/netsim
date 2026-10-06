import type { Json, StatusPayload } from "@/protocol/messages";

/** What every per-kind peripheral view gets: the latest status, and a way to send it `input`. */
export type PeripheralViewProps = {
  status: StatusPayload;
  sendInput: (input: Record<string, Json>) => void;
};
