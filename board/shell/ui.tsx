// Small shared pieces of the board's page: buttons and panels in the sketch style.
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function SketchButton({ active = false, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded-md border-2 border-black px-2.5 py-1 text-sm font-semibold shadow-[2px_2px_0_#000] transition active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-40 ${active ? "bg-[#ffcb12]" : "bg-white hover:bg-[#f2efe6]"} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Panel({ title, children, right, className = "" }: { title: string; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border-2 border-black bg-white shadow-[3px_3px_0_#000] ${className}`}>
      <header className="flex items-center justify-between border-b-2 border-black px-3 py-1.5">
        <h2 className="text-xs font-bold uppercase tracking-wide">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

export function Swatch({ colour }: { colour: string }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-sm border border-black" style={{ background: colour }} />;
}
