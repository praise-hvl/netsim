// A wire between parts (a path of straight pieces), and a packet travelling on it.
import { pointAlong, toScreen, type Point } from "@/board/parts/geometry";
import { INK } from "@/board/parts/colours";
import { explainMessage } from "@/board/parts/explain";

export function Wire({ path, busy = false }: { path: readonly Point[]; /** Draw it lit, e.g. while a packet is on it. */ busy?: boolean }) {
  const points = path.map(toScreen).map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <g>
      <polyline points={points} fill="none" stroke={INK.outline} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={points} fill="none" stroke={busy ? INK.yellow : INK.darkGrey} strokeWidth={busy ? 3.2 : 2.4} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

/**
 * A tag with a word on it, `t` (0..1) of the way along `path`. Hovering it explains the message
 * (from the word, or the message type: "read", "mem.read", …); pass `explain` to say it your way.
 */
export function PacketOnWire({ path, t, word, colour, explain }: { path: readonly Point[]; t: number; word: string; colour: string; explain?: string }) {
  const at = toScreen(pointAlong(path, t));
  const w = word.length * 6.4 + 10;
  return (
    <g transform={`translate(${at.x} ${at.y})`} data-explain={explain ?? explainMessage(word)} style={{ cursor: "help" }}>
      <rect x={-w / 2 - 2} y={-7} width={w} height={15} rx={4} fill={colour} />
      <rect x={-w / 2} y={-9} width={w} height={15} rx={4} fill="none" stroke={INK.outline} strokeWidth={1.4} />
      <text y={-1.5} fontSize={10} fontWeight={700} textAnchor="middle" dominantBaseline="middle" fill={INK.outline}>
        {word}
      </text>
    </g>
  );
}
