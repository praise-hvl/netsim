// Copying portfolio/README.draft.md to the repo's README.md. The draft sits one folder down, so
// its links to the repo start with ../; at the root they must not, or every image breaks on GitHub.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The draft's links, made relative to the repo root: ](../docs/x.png) → ](docs/x.png), and src="../…" / href="../…" too. */
export function draftToRoot(markdown: string): string {
  return markdown.replace(/(\]\(\s*<?|\b(?:src|href)=["'])\.\.\//g, "$1");
}

/**
 * Copy the draft, as it is on disk (with any edits made to it), to README.md. The README that was
 * there is kept as portfolio/README.before.md, only the first time: after that README.md is
 * already the portfolio one.
 */
export function copyDraftToReadme(root: string): void {
  const readme = join(root, "README.md");
  const before = join(root, "portfolio", "README.before.md");
  if (existsSync(readme) && !existsSync(before)) copyFileSync(readme, before);
  writeFileSync(readme, draftToRoot(readFileSync(join(root, "portfolio", "README.draft.md"), "utf8")));
}
