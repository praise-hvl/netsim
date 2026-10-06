// The course's colours, from the instructor's sketches (black outline over offset flat colour),
// plus a few more so up to 8 cores each get their own.

export const INK = {
  outline: "#000000",
  red: "#f4061e",
  darkGreen: "#173627",
  mint: "#5fc79a",
  yellow: "#ffcb12",
  lightGrey: "#d3dbdc",
  darkGrey: "#585654",
  white: "#ffffff",
  paper: "#f7f5ef",
} as const;

/** One colour per core (or per program), the sketch colours first. */
export const PALETTE = ["#f4061e", "#5fc79a", "#ffcb12", "#4c7cf3", "#ff8c42", "#a66cf0", "#22b8c7", "#8a6d3b"] as const;

export function coreColour(core: number): string {
  return PALETTE[((core % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
