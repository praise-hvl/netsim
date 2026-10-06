"use client";
// Your board: the layers you build, stacked on one SVG. Each sits in a <Layer>: until you build
// it, it shows which week builds it, and an error in it stays inside its own box. Add layers,
// reorder them, restyle anything: this file is yours.
import { useState } from "react";
import type { Source } from "@/board/feed/use-feed";
import { BoardShell } from "@/board/shell/board-shell";
import { Layer } from "@/board/shell/layer";
import { BOARD_SIZE, CPU_AREA, MEMORY_AREA } from "@/board/student/places";
import { BusLayer, MemoryLayer } from "@/board/student/memory-bus";
import { CoreView } from "@/board/student/core";
import { CoresView } from "@/board/student/cores";

const BUS_ROW = { x: 6, y: 80, w: 188, h: 40 };

export function MyBoard({ initialSource }: { initialSource: Source }) {
  const [source, setSource] = useState<Source>(initialSource);
  return (
    <BoardShell title="My board" source={source} onSource={setSource} size={BOARD_SIZE}>
      {({ frame, frames, index, progress }) => {
        const firstCore = frame.cores[0];
        const singleCore = firstCore ? (
          <Layer rect={CPU_AREA} name="A CPU core">
            <CoreView frame={frame} core={firstCore} rect={CPU_AREA} />
          </Layer>
        ) : null;
        return (
          <g>
            <Layer rect={BUS_ROW} name="The bus and its packets">
              <BusLayer frame={frame} progress={progress} />
            </Layer>
            <Layer rect={MEMORY_AREA} name="Memory">
              <MemoryLayer frame={frame} progress={progress} />
            </Layer>
            {/* Week 7's lanes replace week 5's single core; until then, the single core shows. */}
            <Layer rect={CPU_AREA} name="Every core" fallback={singleCore}>
              <CoresView frame={frame} previous={index > 0 ? frames[index - 1] : null} rect={CPU_AREA} />
            </Layer>
          </g>
        );
      }}
    </BoardShell>
  );
}
