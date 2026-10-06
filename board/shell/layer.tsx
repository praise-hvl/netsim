"use client";
// One layer of your board. A layer you haven't built yet returns `notBuilt(...)`, which draws a
// note saying which week builds it (or the layer's `fallback`) without any error. A real error
// in a layer is caught here and shown in its place, so one broken layer never blanks the board.
import { Component, createContext, useContext, type ReactElement, type ReactNode } from "react";
import { screenRect, type Rect } from "@/board/parts/geometry";
import { INK } from "@/board/parts/colours";

type LayerInfo = {
  /** Where the note goes. */
  rect: Rect;
  /** What this layer shows, e.g. "Memory". */
  name: string;
  /** Drawn instead of the note while the layer isn't built (e.g. an earlier week's layer). */
  fallback?: ReactNode;
};

const LayerContext = createContext<LayerInfo | null>(null);

export function Layer({ rect, name, fallback, children }: LayerInfo & { children?: ReactNode }) {
  return (
    <LayerContext.Provider value={{ rect, name, fallback }}>
      <LayerErrors rect={rect} name={name}>
        {children}
      </LayerErrors>
    </LayerContext.Provider>
  );
}

/**
 * What an unbuilt drawing returns: `return notBuilt("week 3: board-draw-memory", frame)`.
 * The extra arguments only keep the props "used" until you write the real drawing.
 */
export function notBuilt(label: string, ...args: unknown[]): ReactElement {
  void args;
  return <NotYetBuilt label={label} />;
}

function NotYetBuilt({ label }: { label: string }) {
  const layer = useContext(LayerContext);
  if (!layer) return null;
  if (layer.fallback) return <>{layer.fallback}</>;
  const week = /^week \d+/.exec(label)?.[0] ?? "a later week";
  return <Note rect={layer.rect} title={layer.name} text={`You build this in ${week}.`} />;
}

function Note({ rect, title, text, error = false }: { rect: Rect; title: string; text: string; error?: boolean }) {
  const r = screenRect(rect);
  return (
    <g>
      <rect {...r} rx={6} fill={INK.white} stroke={INK.darkGrey} strokeWidth={1.5} strokeDasharray="6 5" />
      <text x={r.x + r.width / 2} y={r.y + r.height / 2 - 9} textAnchor="middle" fontSize={13} fontWeight={700}>
        {title}
      </text>
      <text x={r.x + r.width / 2} y={r.y + r.height / 2 + 10} textAnchor="middle" fontSize={11} fill={error ? INK.red : INK.darkGrey}>
        {text}
      </text>
    </g>
  );
}

type ErrorState = { error: Error | null };

/** Catches a real error in a layer (a bug, or a function still at todo()) and shows it in place. */
class LayerErrors extends Component<{ rect: Rect; name: string; children: ReactNode }, ErrorState> {
  state: ErrorState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const todo = /^TODO\((week \d+): ([a-z0-9-]+)\)/.exec(error.message);
    const text = todo ? `Waiting on ${todo[2]} (${todo[1]}).` : `Error: ${error.message.slice(0, 80)}`;
    return <Note rect={this.props.rect} title={this.props.name} text={text} error />;
  }
}
