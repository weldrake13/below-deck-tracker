import { Router } from "express";
import { getAisStatus } from "../lib/ais-client.js";
import { aisConfigured } from "../lib/config.js";
import { getShows, getYachts } from "../lib/content.js";
import { getSnapshotStatus } from "../lib/position-snapshot.js";
import { getPositions } from "../lib/position-store.js";
import type { YachtEntry } from "../types.js";

const router = Router();

// Everything the page needs on first load, in one round trip.
router.get("/state", async (_req, res) => {
  const [shows, yachts] = await Promise.all([getShows(), getYachts()]);
  res.json({
    shows,
    yachts,
    positions: getPositions(),
    aisConfigured,
  });
});

// Polled every 30s from the client to move the markers without re-fetching
// the (static, larger) yacht and show data.
router.get("/positions", (_req, res) => {
  res.json({ positions: getPositions(), aisConfigured });
});

function hasMmsi(yacht: YachtEntry): yacht is YachtEntry & { mmsi: number } {
  return yacht.mmsi !== null;
}

// Diagnostics for "why isn't yacht X tracked" — nothing here is secret (the
// API key itself is never included), it's just the operational state that's
// otherwise only visible in server logs. Meant to be opened in a browser.
router.get("/debug", async (_req, res) => {
  const yachts = await getYachts();
  const positions = getPositions();
  const positionsByMmsi = new Map(positions.map((p) => [p.mmsi, p]));
  const now = Date.now();

  const trackedYachts = yachts.filter(hasMmsi);
  const distinctMmsis = [...new Set(trackedYachts.map((y) => y.mmsi))];

  const summarise = (mmsi: number) => ({
    mmsi,
    yachts: trackedYachts
      .filter((y) => y.mmsi === mmsi)
      .map((y) => ({ showName: y.showName, realName: y.realName, show: y.show })),
  });

  const reporting = distinctMmsis
    .filter((mmsi) => positionsByMmsi.has(mmsi))
    .map((mmsi) => {
      const position = positionsByMmsi.get(mmsi)!;
      return {
        ...summarise(mmsi),
        latitude: position.latitude,
        longitude: position.longitude,
        speedKnots: position.speedKnots,
        course: position.course,
        broadcastName: position.broadcastName,
        receivedAt: position.receivedAt,
        ageSeconds: Math.round((now - new Date(position.receivedAt).getTime()) / 1000),
      };
    });

  const notReporting = distinctMmsis.filter((mmsi) => !positionsByMmsi.has(mmsi)).map(summarise);

  res.json({
    aisConfigured,
    ais: getAisStatus(),
    snapshot: await getSnapshotStatus(),
    yachts: {
      total: yachts.length,
      withKnownMmsi: trackedYachts.length,
      withoutMmsi: yachts.length - trackedYachts.length,
    },
    mmsisTracked: distinctMmsis.length,
    mmsisReporting: reporting.length,
    reporting,
    notReporting,
  });
});

export default router;
