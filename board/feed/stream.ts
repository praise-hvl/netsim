// Frames from a live bus, built as the messages arrive. A tick is finished when the first
// message of a later tick shows up; until then `withOpenTick` shows it as it stands.
import type { ComponentInfo, Message } from "@/protocol/messages";
import { emptyFrame, nextFrame, type Frame } from "@/board/feed/frames";

/** Keep this many ticks for scrubbing back; older ones are dropped. */
export const HISTORY_LIMIT = 2000;

export type FrameStream = {
  /** Finished ticks, oldest first. */
  frames: Frame[];
  /** The last finished frame (or an empty one), which the open tick builds on. */
  last: Frame;
  /** Messages of the tick that is still open. */
  pending: Message[];
  pendingTick: number | null;
};

export function createStream(components: readonly ComponentInfo[] = []): FrameStream {
  return { frames: [], last: emptyFrame(components), pending: [], pendingTick: null };
}

/** Add a batch of messages (in arrival order). Returns a new stream; the old one is untouched. */
export function appendMessages(stream: FrameStream, batch: readonly Message[]): FrameStream {
  let { last, pendingTick } = stream;
  const frames = stream.frames.slice();
  let pending = stream.pending.slice();
  const commit = (tick: number) => {
    last = nextFrame(last, tick, pending);
    frames.push(last);
    pending = [];
  };

  for (const message of batch) {
    // A welcome starts a new session: the bus restarted, or we reconnected. Start over.
    if (message.type === "welcome") {
      frames.length = 0;
      last = emptyFrame(message.payload.components);
      pending = [];
      pendingTick = message.tick;
      continue;
    }
    if (pendingTick !== null && message.tick > pendingTick) {
      commit(pendingTick);
      // Ticks nobody spoke in still happened.
      for (let t = pendingTick + 1; t < message.tick; t++) commit(t);
    }
    // A message from an older tick (it was late) joins the open tick rather than rewriting history.
    if (pendingTick === null || message.tick > pendingTick) pendingTick = message.tick;
    pending.push(message);
  }
  const kept = frames.length > HISTORY_LIMIT ? frames.slice(frames.length - HISTORY_LIMIT) : frames;
  return { frames: kept, last, pending, pendingTick };
}

/** The finished frames plus the open tick as it stands, so a stopped clock still shows changes. */
export function withOpenTick(stream: FrameStream): Frame[] {
  if (stream.pendingTick === null) return stream.frames;
  return [...stream.frames, nextFrame(stream.last, stream.pendingTick, stream.pending)];
}
