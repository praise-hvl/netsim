"use client";
// Reads ?source= (and &cores=) in the browser, so /board stays a static page (GitHub Pages has no server).
import { useSearchParams } from "next/navigation";
import { MyBoard } from "@/board/student/board";
import { BUS_URL } from "@/app/_lib/bus-connection";
import { defaultSource, sourceFromQuery } from "@/board/feed/source";

/** Set by next.config.ts in the GitHub Pages build (NETSIM_PAGES=1). */
const PAGES_BUILD = process.env.NEXT_PUBLIC_NETSIM_PAGES === "1";

export function BoardFromUrl() {
  const query = useSearchParams();
  return <MyBoard initialSource={sourceFromQuery(query, BUS_URL, defaultSource(PAGES_BUILD))} />;
}
