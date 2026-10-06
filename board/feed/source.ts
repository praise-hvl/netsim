// Which feed a board starts on, from the page's query. Pure, so it can be tested and used in
// any page (the static GitHub Pages build reads the query in the browser).
//   (none)                      the default: see defaultSource
//   ?source=8-cores             the 8-core recording (any recording, by name)
//   ?source=machine[&cores=N]   a machine running in the page, N cores (1-8, default 2)
//   ?source=live                the bus at `busUrl` (e.g. the class bus)
import { MACHINE_CORES, TRACES, type Source, type TraceName } from "@/board/feed/use-feed";

/** Anything with URLSearchParams' get(), e.g. useSearchParams() or new URLSearchParams(location.search). */
export type Query = { get(name: string): string | null };

/**
 * Where /board starts without a ?source. On the GitHub Pages build (your live link): your machine,
 * running in the page, so a demo shows your own code and the Button works. While your machine
 * can't run yet (its code isn't finished), that falls back to the 2-core recording. In
 * development: the 2-core recording, which works whatever state your code is in.
 */
export function defaultSource(pagesBuild: boolean): Source {
  return pagesBuild ? { kind: "machine", cores: 2, fallback: "2-cores" } : { kind: "trace", name: "2-cores" };
}

export function sourceFromQuery(query: Query, busUrl: string, fallback: Source = defaultSource(false)): Source {
  const value = query.get("source");
  if (value === "live") return { kind: "live", url: busUrl };
  if (value === "machine") return { kind: "machine", cores: coresFrom(query.get("cores")) };
  if (value !== null && Object.hasOwn(TRACES, value)) return { kind: "trace", name: value as TraceName };
  return fallback;
}

function coresFrom(value: string | null): number {
  const cores = Number(value);
  return Number.isInteger(cores) && cores >= 1 && cores <= 8 ? cores : 2;
}

// ── The source picker on the board's page ──────────────────────────────────

export type SourceOption = { key: string; label: string };

/** The picker's key for a source: "2-cores", "machine-8", "live". */
export function sourceKey(source: Source): string {
  if (source.kind === "trace") return source.name;
  if (source.kind === "machine") return `machine-${source.cores}`;
  return "live";
}

/** Back from a picker key to a source. Unknown keys fall back to the 2-core recording. */
export function sourceFromKey(key: string, busUrl: string): Source {
  if (key === "live") return { kind: "live", url: busUrl };
  const machine = /^machine-(\d)$/.exec(key);
  if (machine) return { kind: "machine", cores: coresFrom(machine[1]) };
  return Object.hasOwn(TRACES, key) ? { kind: "trace", name: key as TraceName } : { kind: "trace", name: "2-cores" };
}

/** Everything the picker offers: the recordings, the in-page machine, the live bus (plus the current source if it isn't one of them, e.g. ?cores=4). */
export function sourceOptions(current: Source): SourceOption[] {
  const cores = new Set<number>(MACHINE_CORES);
  if (current.kind === "machine") cores.add(current.cores);
  return [
    ...(Object.keys(TRACES) as TraceName[]).map((name) => ({ key: name, label: TRACES[name].label })),
    ...[...cores].sort((a, b) => a - b).map((n) => ({ key: `machine-${n}`, label: `In-browser machine · ${n} ${n === 1 ? "core" : "cores"}` })),
    { key: "live", label: "Live bus" },
  ];
}
