// Your board: the simulated computer, drawn by you, live from the bus or from a recording.
//   /board                 the 2-core recording
//   /board?source=8-cores  the 8-core recording
//   /board?source=live     the live bus (npm run dev:all, or npm run bus + components)
// The board itself is in board/student/board.tsx. This page is static (the query is read in
// the browser), so it also works as a GitHub Pages site: see npm run pages:check.
import { Suspense } from "react";
import { BoardFromUrl } from "@/app/board/board-from-url";

export const metadata = { title: "My board", description: "The simulated computer, drawn as a board" };

export default function BoardPage() {
  // useSearchParams needs a Suspense boundary in a static page; the board itself draws its own loading state.
  return (
    <Suspense fallback={null}>
      <BoardFromUrl />
    </Suspense>
  );
}
