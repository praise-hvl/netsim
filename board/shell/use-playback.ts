"use client";
// Drives the playback reducer from the browser's animation frames.
import { useEffect, useReducer, useRef } from "react";
import { initialPlayback, playbackReducer, type Playback, type PlaybackAction } from "@/board/shell/playback";

export function usePlayback(frameCount: number, start: Partial<Playback> = {}): [Playback, (action: PlaybackAction) => void] {
  const [state, dispatch] = useReducer(playbackReducer, { ...initialPlayback, ...start });
  const frames = useRef(frameCount);
  useEffect(() => {
    frames.current = frameCount;
  }, [frameCount]);
  const moving = state.playing || state.stepping;

  useEffect(() => {
    if (!moving) return;
    let last = performance.now();
    let handle = requestAnimationFrame(function loop(now) {
      dispatch({ type: "advance", ms: Math.min(100, now - last), frames: frames.current });
      last = now;
      handle = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(handle);
  }, [moving]);

  return [state, dispatch];
}
