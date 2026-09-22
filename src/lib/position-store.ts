import type { Position } from "../types.js";

/**
 * The app's entire "database": the latest known position per MMSI, held in
 * memory. Deliberately not persisted — restart the process and it re-fills
 * from the live feed within a few minutes. That's the tradeoff for staying
 * stateless (no volume, no schema migration, nothing to back up).
 */
const positions = new Map<number, Position>();

export function setPosition(position: Position): void {
  positions.set(position.mmsi, position);
}

export function getPositions(): Position[] {
  return [...positions.values()];
}

export function getPosition(mmsi: number): Position | undefined {
  return positions.get(mmsi);
}
