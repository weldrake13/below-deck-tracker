import { Router } from "express";
import { aisConfigured } from "../lib/config.js";
import { getShows, getYachts } from "../lib/content.js";
import { getPositions } from "../lib/position-store.js";

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

export default router;
