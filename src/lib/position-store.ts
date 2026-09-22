import type { Position } from "../types.js";

/**
 * The app's entire "database": the latest known position per MMSI, held in
 * memory. Periodically snapshotted to disk (see position-snapshot.ts) purely
 * so a restart doesn't show a blank map for a few minutes — there's still no
 * real database, schema, or migration to think about.
 */
const positions = new Map<number, Position>();

export function setPosition(position: Position): void {
  positions.set(position.mmsi, position);
}

/** Seeds the store from a saved snapshot at startup. Never call this after startup. */
export function loadPositions(saved: Position[]): void {
  for (const position of saved) positions.set(position.mmsi, position);
}

export function getPositions(): Position[] {
  return [...positions.values()];
}

export function getPosition(mmsi: number): Position | undefined {
  return positions.get(mmsi);
}
