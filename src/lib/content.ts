import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.js";
import type { Show, YachtEntry } from "../types.js";

let cachedShows: Show[] | undefined;
let cachedYachts: YachtEntry[] | undefined;

async function loadJson<T>(file: string): Promise<T> {
  const raw = await readFile(join(CONTENT_DIR, file), "utf8");
  return JSON.parse(raw) as T;
}

/** Content is data — read fresh on first request, then cached for the process lifetime. */
export async function getShows(): Promise<Show[]> {
  cachedShows ??= await loadJson<Show[]>("shows.json");
  return cachedShows;
}

export async function getYachts(): Promise<YachtEntry[]> {
  cachedYachts ??= await loadJson<YachtEntry[]>("yachts.json");
  return cachedYachts;
}

/** Every distinct MMSI worth opening an AIS subscription for. */
export async function getTrackedMmsiList(): Promise<number[]> {
  const yachts = await getYachts();
  const mmsis = new Set<number>();
  for (const yacht of yachts) {
    if (yacht.mmsi !== null) mmsis.add(yacht.mmsi);
  }
  return [...mmsis];
}
