// The seven-segment display: shows its register byte (0-255) as three decimal digits.
// Reads { value } from the display's status.
import { z } from "zod";
import type { PeripheralViewProps } from "@/app/_components/nodes/peripherals/view-props";

const displayData = z.object({ value: z.number().int().min(0).max(255) });

// Segments in the order a b c d e f g (top, top-right, bottom-right, bottom, bottom-left, top-left, middle).
const DIGITS: Record<number, string> = {
  0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg",
  5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg",
};

export function SevenSegmentView({ status }: PeripheralViewProps) {
  const parsed = displayData.safeParse(status.data);
  const value = parsed.success ? parsed.data.value : null;
  const digits = value === null ? [null, null, null] : String(value).padStart(3, " ").split("").map((d) => (d === " " ? null : Number(d)));
  return (
    <div className="flex gap-1.5 rounded-md bg-zinc-900 p-2">
      {digits.map((digit, i) => (
        <Digit key={i} digit={digit} />
      ))}
    </div>
  );
}

function Digit({ digit }: { digit: number | null }) {
  const lit = digit === null ? "" : DIGITS[digit];
  const seg = (name: string, className: string) => (
    <div className={`absolute rounded-full ${className} ${lit.includes(name) ? "bg-red-500 shadow-[0_0_6px_rgb(239_68_68)]" : "bg-red-500/10"}`} />
  );
  return (
    <div className="relative h-14 w-8">
      {seg("a", "left-1.5 top-0 h-1.5 w-5")}
      {seg("b", "right-0 top-1 h-5.5 w-1.5")}
      {seg("c", "right-0 bottom-1 h-5.5 w-1.5")}
      {seg("d", "left-1.5 bottom-0 h-1.5 w-5")}
      {seg("e", "left-0 bottom-1 h-5.5 w-1.5")}
      {seg("f", "left-0 top-1 h-5.5 w-1.5")}
      {seg("g", "left-1.5 top-[25px] h-1.5 w-5")}
    </div>
  );
}
