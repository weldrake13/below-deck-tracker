import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Walk up from this file until we find the package.json — works the same whether
 * we're running from `src/` via tsx or from `dist/` via node.
 */
function findProjectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Could not locate the project root (no package.json found)");
}

export const ROOT = findProjectRoot();

/** Browser assets always live in src/, never in dist/. */
export const PUBLIC_DIR = join(ROOT, "src", "public");

/** The yacht/show data James edits by hand. */
export const CONTENT_DIR = resolve(process.env.CONTENT_DIR ?? join(ROOT, "content"));

/** Disposable: just the last-saved position snapshot, so a restart isn't a blank map. */
export const CACHE_DIR = resolve(process.env.CACHE_DIR ?? join(ROOT, ".cache"));
export const POSITIONS_SNAPSHOT_FILE = join(CACHE_DIR, "positions.json");
