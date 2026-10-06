"use client";
// The frame around your board: pick a recording, a machine running in this page, or the live
// bus; play, pause, step a tick and scrub. You draw the board itself: `children` gets the frame to draw and how far through its
// tick the playback is (0..1, for things in motion).
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import type { Frame } from "@/board/feed/frames";
import { useFeed, type Source } from "@/board/feed/use-feed";
import { sourceFromKey, sourceKey, sourceOptions } from "@/board/feed/source";
import { BUS_URL } from "@/app/_lib/bus-connection";
import { usePlayback } from "@/board/shell/use-playback";
import { PlaybackBar } from "@/board/shell/playback-bar";
import { SCALE } from "@/board/parts/geometry";
import { SketchButton } from "@/board/shell/ui";
import { INK } from "@/board/parts/colours";

export type BoardView = { frame: Frame; frames: readonly Frame[]; index: number; progress: number };

export type BoardShellProps = {
  title: string;
  source: Source;
  onSource: (source: Source) => void;
  /** The board's size in board units. */
  size: { w: number; h: number };
  children: (view: BoardView) => ReactNode;
};

export function BoardShell({ title, source, onSource, size, children }: BoardShellProps) {
  const feed = useFeed(source);
  // A bus (live or in the page) keeps running, so follow its newest tick; a recording starts paused.
  const [playback, dispatch] = usePlayback(feed.frames.length, source.kind === "trace" ? {} : { follow: true, playing: true });
  // Following only makes sense on a running bus. A recording (e.g. what a machine that can't run
  // yet falls back to) starts at its first tick, paused.
  if (playback.follow && !feed.live && feed.state === "ready") dispatch({ type: "seek", index: 0 });
  const index = Math.min(playback.index, Math.max(0, feed.frames.length - 1));
  const frame = feed.frames[index];
  const margin = 4;

  // Hover anything on the board that says what it is (data-explain: the parts fill it in) and the
  // board pauses while a popover explains it; move away and it carries on if it was playing.
  const [tip, setTip] = useState<{ text: string; left: number; top: number; held: boolean } | null>(null);
  const hovered = useRef<Element | null>(null);
  const heldByHover = useRef(false);
  const leave = () => {
    hovered.current = null;
    setTip(null);
    if (heldByHover.current) {
      heldByHover.current = false;
      dispatch({ type: "play" });
    }
  };
  const onHover = (e: PointerEvent<HTMLElement>) => {
    const target = e.target instanceof Element ? e.target.closest("[data-explain]") : null;
    const text = target?.getAttribute("data-explain");
    if (!target || !text) return leave();
    if (target === hovered.current) return;
    hovered.current = target;
    const area = e.currentTarget.getBoundingClientRect();
    const it = target.getBoundingClientRect();
    const width = 300;
    if (playback.playing && !heldByHover.current) {
      heldByHover.current = true;
      dispatch({ type: "pause" });
    }
    setTip({ text, left: Math.max(8, Math.min(it.left - area.left, area.width - width - 8)), top: Math.min(it.bottom - area.top + 8, area.height - 120), held: heldByHover.current });
  };

  return (
    <div className="flex h-screen flex-col text-black" style={{ background: INK.paper }}>
      <header className="flex items-center gap-3 border-b-2 border-black bg-white px-4 py-2">
        <h1 className="whitespace-nowrap text-lg font-extrabold tracking-tight">{title}</h1>
        <select
          aria-label="What to show"
          className="rounded-md border-2 border-black bg-white px-2 py-1 text-sm font-semibold"
          value={sourceKey(source)}
          onChange={(e) => {
            const next = sourceFromKey(e.target.value, BUS_URL);
            onSource(next);
            dispatch(next.kind === "trace" ? { type: "seek", index: 0 } : { type: "follow", follow: true });
          }}
        >
          {sourceOptions(source).map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="min-w-0 truncate text-sm text-zinc-600" title={feed.about}>
          {feed.about}
        </span>
        {/* On a running bus, press its buttons from here: no need to build a press into your board first. */}
        {feed.live && frame && (
          <div className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold">
            {Object.values(frame.parts)
              .filter((part) => part.kind === "button")
              .map((part) => (
                <SketchButton key={part.id} className="py-0" onClick={() => feed.live?.press(part.id)} title={`Press ${part.label}: it interrupts the CPU on its next tick`}>
                  press {part.label}
                </SketchButton>
              ))}
          </div>
        )}
      </header>
      <main className="relative min-h-0 flex-1 p-3" onPointerMove={onHover} onPointerLeave={leave}>
        {frame ? (
          <svg
            className="h-full w-full select-none"
            viewBox={`${-margin * SCALE} ${-margin * SCALE} ${(size.w + 2 * margin) * SCALE} ${(size.h + 2 * margin) * SCALE}`}
            role="img"
            aria-label={title}
          >
            {children({ frame, frames: feed.frames, index, progress: playback.progress })}
          </svg>
        ) : (
          <p className="p-6 text-lg">{feed.error ? `Couldn't load: ${feed.error}` : feed.state === "connecting" ? (source.kind === "machine" ? "Starting the machine…" : `Connecting to the bus at ${BUS_URL}…`) : "Loading…"}</p>
        )}
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 w-[300px] whitespace-pre-line rounded-md border-2 border-black bg-white px-3 py-2 text-sm leading-snug shadow-[3px_3px_0_#000]"
            style={{ left: tip.left, top: tip.top }}
          >
            {tip.text}
            {tip.held && <span className="mt-1 block text-xs text-zinc-500">Paused while you look. Move away to carry on.</span>}
          </div>
        )}
      </main>
      <PlaybackBar playback={playback} dispatch={dispatch} frames={feed.frames} live={feed.live} />
    </div>
  );
}
