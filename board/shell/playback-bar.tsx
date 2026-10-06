// Pause, step one tick, speed, and a scrubber over every recorded tick.
import type { Frame } from "@/board/feed/frames";
import type { LiveControls } from "@/board/feed/use-feed";
import { SPEEDS, type Playback, type PlaybackAction } from "@/board/shell/playback";
import { SketchButton } from "@/board/shell/ui";

export function PlaybackBar({ playback, dispatch, frames, live }: { playback: Playback; dispatch: (a: PlaybackAction) => void; frames: readonly Frame[]; live: LiveControls | null }) {
  const last = Math.max(0, frames.length - 1);
  const tick = frames[playback.index]?.tick ?? 0;
  return (
    // pl-16 keeps the first button clear of Next's dev-mode badge in the bottom-left corner.
    <div className="flex flex-wrap items-center gap-2 border-t-2 border-black bg-white py-2 pl-16 pr-4">
      <SketchButton onClick={() => dispatch({ type: "step", by: -1 })} disabled={playback.index === 0} title="Back one tick">
        ◀︎ tick
      </SketchButton>
      <SketchButton
        className="w-20"
        active={playback.playing}
        onClick={() => dispatch({ type: playback.playing ? "pause" : "play" })}
        title={playback.playing ? "Pause" : "Play"}
      >
        {playback.playing ? "❚❚ pause" : "▶ play"}
      </SketchButton>
      <SketchButton onClick={() => dispatch({ type: "step", by: 1 })} disabled={playback.index >= last} title="Play the next tick, then stop">
        tick ▶︎
      </SketchButton>
      <div className="ml-1 flex items-center gap-1 text-xs font-semibold">
        speed
        {SPEEDS.map((s) => (
          <SketchButton key={s} className="px-1.5 py-0 text-xs" active={playback.speed === s} onClick={() => dispatch({ type: "speed", speed: s })}>
            {s}×
          </SketchButton>
        ))}
      </div>
      <input
        aria-label="Scrub through the ticks"
        className="mx-2 min-w-40 flex-1 accent-[#f4061e]"
        type="range"
        min={0}
        max={last}
        value={Math.min(playback.index, last)}
        onChange={(e) => dispatch({ type: "seek", index: Number(e.target.value) })}
      />
      <span className="w-32 whitespace-nowrap text-right font-mono text-sm">
        tick {tick}
        <span className="text-zinc-500">/{frames[last]?.tick ?? 0}</span>
      </span>
      {live && (
        <div className="flex items-center gap-1 border-l-2 border-black pl-2 text-xs font-semibold">
          <SketchButton className="py-0 text-xs" active={playback.follow} onClick={() => dispatch({ type: "follow", follow: !playback.follow })} title="Keep up with the newest tick">
            ● follow live
          </SketchButton>
          bus clock
          <SketchButton className="py-0 text-xs" onClick={() => live.control("start")}>start</SketchButton>
          <SketchButton className="py-0 text-xs" onClick={() => live.control("stop")}>stop</SketchButton>
          <SketchButton className="py-0 text-xs" onClick={() => live.control("step")}>step</SketchButton>
        </div>
      )}
    </div>
  );
}
