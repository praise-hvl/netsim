// `npm run asm -- programs/countdown.asm [origin] [NAME=value ...]`: assemble a file and print a
// listing. Handlers need their slot's symbols, e.g. `-- programs/isr-counter.asm 0x200 COUNTER=0x3E0`.
//   0x000  06 00 00 09  LOADI R0, 9
import { readFileSync } from "node:fs";
import { assemble } from "@/core/asm";
import { decode, INSTRUCTION_SIZE, disassemble } from "@/core/isa";
import { hex } from "@/protocol/memory-map";

const [file, ...rest] = process.argv.slice(2);
if (!file) {
  console.error("usage: npm run asm -- <file.asm> [origin, e.g. 0x080] [NAME=value ...]");
  process.exit(1);
}
const originText = rest.find((arg) => !arg.includes("="));
const origin = originText ? Number(originText) : 0;
const symbols = Object.fromEntries(
  rest.filter((arg) => arg.includes("=")).map((arg) => {
    const [name, value] = arg.split("=");
    return [name, Number(value)];
  }),
);

let bytes: number[];
try {
  bytes = assemble(readFileSync(file, "utf8"), { origin, symbols });
} catch (error) {
  console.error(`${file}: ${(error as Error).message}`);
  process.exit(1);
}

for (let i = 0; i < bytes.length; i += INSTRUCTION_SIZE) {
  const word = bytes.slice(i, i + INSTRUCTION_SIZE);
  const text = word.map((b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
  const decoded = word.length === INSTRUCTION_SIZE ? decode([word[0], word[1], word[2], word[3]]) : null;
  console.log(`${hex(origin + i)}  ${text.padEnd(11)}  ${decoded?.ok ? disassemble(decoded.instruction) : "(data)"}`);
}
console.log(`${bytes.length} bytes`);
