// The recorded runs in board/recordings, as frames, for the board tests (weeks 3, 5 and 7).
import { readFileSync } from "node:fs";
import { buildFrames, type Frame } from "@/board/feed/frames";
import { parseTrace } from "@/board/feed/trace";

const cache = new Map<string, Frame[]>();

export function recordedFrames(name: "2-cores" | "8-cores"): Frame[] {
  let frames = cache.get(name);
  if (!frames) {
    const trace = parseTrace(JSON.parse(readFileSync(`board/recordings/trace-${name}.json`, "utf8")));
    frames = buildFrames(trace.components, trace.messages);
    cache.set(name, frames);
  }
  return frames;
}
