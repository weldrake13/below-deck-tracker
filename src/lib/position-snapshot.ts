import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { CACHE_DIR, POSITIONS_SNAPSHOT_FILE } from "./paths.js";
import { getPositions, loadPositions } from "./position-store.js";

// This is a "don't show a blank map for a few minutes after a restart" cache,
// not a tracking history — five minutes is plenty for a franchise-tracking
// hobby app, nobody needs sub-minute freshness on where a charter yacht is.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

/** Reads whatever was last saved, if anything, so a restart isn't a blank map. */
export async function loadPositionSnapshot(): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(POSITIONS_SNAPSHOT_FILE, "utf8");
  } catch {
    return; // no snapshot yet — first run, or the cache dir was cleared. Fine.
  }

  try {
    loadPositions(JSON.parse(raw));
    console.log(`[positions] restored snapshot from ${POSITIONS_SNAPSHOT_FILE}`);
  } catch (error) {
    console.warn("[positions] snapshot was unreadable, ignoring it:", error);
  }
}

/**
 * Overwrites the one snapshot file with the current in-memory state. Always
 * the same path, always the full replacement (never appended to), so this
 * can never grow — its size is capped by however many yachts are tracked.
 */
export async function savePositionSnapshot(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const tmpFile = `${POSITIONS_SNAPSHOT_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(getPositions()));
  await rename(tmpFile, POSITIONS_SNAPSHOT_FILE); // atomic — never leaves a half-written file behind
}

/** For GET /api/debug — whether the snapshot file exists and how old it is. */
export async function getSnapshotStatus(): Promise<{
  path: string;
  existsOnDisk: boolean;
  savedAt: string | null;
}> {
  try {
    const info = await stat(POSITIONS_SNAPSHOT_FILE);
    return { path: POSITIONS_SNAPSHOT_FILE, existsOnDisk: true, savedAt: info.mtime.toISOString() };
  } catch {
    return { path: POSITIONS_SNAPSHOT_FILE, existsOnDisk: false, savedAt: null };
  }
}

/** Starts periodic saving. Returns a stopper to call during shutdown. */
export function startPositionSnapshotWriter(): () => void {
  const interval = setInterval(() => {
    void savePositionSnapshot().catch((error) => {
      console.warn("[positions] failed to save snapshot:", error);
    });
  }, SNAPSHOT_INTERVAL_MS);
  return () => clearInterval(interval);
}
