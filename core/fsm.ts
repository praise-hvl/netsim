import { todo } from "@/core/todo";
// A finite state machine declared as a table. The table is the spec: `go` refuses any move
// that isn't in it, tests read it, and `toMermaid` draws it for the docs.

export type Transition<S extends string> = {
  from: S | readonly S[];
  to: S;
  /** What causes the move, in words. Shown on the diagram arrow. */
  on: string;
};

export type Fsm<S extends string> = {
  name: string;
  states: readonly S[];
  initial: S;
  transitions: readonly Transition<S>[];
  canGo(from: S, to: S): boolean;
  /** Returns `to` if the table allows `from -> to`, otherwise throws. */
  go(from: S, to: S): S;
  toMermaid(): string;
};

export class IllegalTransitionError extends Error {
  constructor(fsm: string, from: string, to: string) {
    super(`${fsm}: illegal transition ${from} -> ${to}`);
  }
}

function sources<S extends string>(t: Transition<S>): readonly S[] {
  return typeof t.from === "string" ? [t.from as S] : (t.from as readonly S[]);
}

export function defineFsm<S extends string>(
  name: string,
  states: readonly S[],
  initial: S,
  transitions: readonly Transition<S>[],
): Fsm<S> {
  const allowed = new Set(transitions.flatMap((t) => sources(t).map((from) => `${from}>${t.to}`)));

  // Staying in the same state is always allowed; it is "no transition". It only shows up on the
  // exported diagram when the table lists it, so list the ones that mean something (like a
  // core stalling, or taking an interrupt from FETCH to FETCH with a new PC).
  const canGo = (from: S, to: S) => from === to || allowed.has(`${from}>${to}`);

  return {
    name,
    states,
    initial,
    transitions,
    canGo,
    go(from, to) {
      if (!canGo(from, to)) throw new IllegalTransitionError(name, from, to);
      return to;
    },
    toMermaid() {
      // @student week=stretch part=home id=fsm-mermaid "Turn the transition table into a mermaid stateDiagram-v2"
      // TODO(stretch, fsm-mermaid): Turn the transition table into a mermaid stateDiagram-v2
      // Tests: tests/stretch/   Guide: docs/stretch/
      return todo("stretch: fsm-mermaid");
      // @end
    },
  };
}
