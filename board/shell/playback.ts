// Playback: which frame is on screen, how far through its tick the packets are, and whether
// time is moving. A pure reducer; use-playback.ts drives it from animation frames.

export const SPEEDS = [0.5, 1, 2, 4, 8] as const;

export type Playback = {
  /** The frame on screen. */
  index: number;
  /** 0..1 through that frame's tick. */
  progress: number;
  playing: boolean;
  /** Play one tick, then stop. */
  stepping: boolean;
  /** Ticks per second. */
  speed: number;
  /** Live only: keep up with the newest tick. */
  follow: boolean;
};

export type PlaybackAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "step"; by: 1 | -1 }
  | { type: "seek"; index: number; progress?: number }
  | { type: "speed"; speed: number }
  | { type: "follow"; follow: boolean }
  | { type: "advance"; ms: number; frames: number };

export const initialPlayback: Playback = { index: 0, progress: 1, playing: false, stepping: false, speed: 2, follow: false };

/** When live and following, fall back to the newest tick if we're further behind than this. */
const MAX_LAG = 3;

export function playbackReducer(state: Playback, action: PlaybackAction): Playback {
  switch (action.type) {
    case "play":
      return { ...state, playing: true, stepping: false };
    case "pause":
      return { ...state, playing: false, stepping: false, follow: false };
    case "step": {
      if (action.by === -1) return { ...state, playing: false, stepping: false, follow: false, index: Math.max(0, state.index - 1), progress: 1 };
      return { ...state, playing: false, stepping: true, follow: false, index: state.index + 1, progress: 0 };
    }
    case "seek":
      return { ...state, playing: false, stepping: false, follow: false, index: Math.max(0, action.index), progress: action.progress ?? 1 };
    case "speed":
      return { ...state, speed: action.speed };
    case "follow":
      return { ...state, follow: action.follow, playing: action.follow || state.playing };
    case "advance":
      return advance(state, action.ms, action.frames);
  }
}

function advance(state: Playback, ms: number, frames: number): Playback {
  const last = Math.max(0, frames - 1);
  let { index, progress } = state;
  if (index > last) return { ...state, index: last, progress: 1, stepping: false };
  if (!state.playing && !state.stepping) return state;
  progress += (ms / 1000) * state.speed;
  if (state.stepping && progress >= 1) return { ...state, index, progress: 1, stepping: false };
  while (progress >= 1) {
    if (index >= last) {
      // At the newest tick: a recording stops; live waits for the next tick.
      return state.follow ? { ...state, index: last, progress: 1 } : { ...state, index: last, progress: 1, playing: false };
    }
    index += 1;
    progress -= 1;
  }
  if (state.follow && last - index > MAX_LAG) return { ...state, index: last - 1, progress: 0 };
  return { ...state, index, progress };
}
