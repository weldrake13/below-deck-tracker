import express from "express";
import { startAisTracking } from "./lib/ais-client.js";
import { config } from "./lib/config.js";
import { PUBLIC_DIR } from "./lib/paths.js";
import {
  loadPositionSnapshot,
  savePositionSnapshot,
  startPositionSnapshotWriter,
} from "./lib/position-snapshot.js";
import apiRoutes from "./routes/api.js";

const app = express();

app.disable("x-powered-by");

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use("/api", apiRoutes);

app.get("/healthz", (_req, res) => {
  res.type("text/plain").send("ok");
});

app.use(
  // maxAge: 0 (not a longer production value) is deliberate — app.js/styles.css/index.html
  // have no cache-busting hash in their URLs, so a longer max-age means browsers that
  // visited before a deploy keep serving stale JS/CSS for that whole window, silently
  // out of sync with the new HTML. Express still sends ETag/Last-Modified, so repeat
  // visits are a cheap conditional GET (304), not a full re-download.
  express.static(PUBLIC_DIR, { maxAge: 0 }),
);

app.use((_req, res) => {
  res.status(404).type("text/plain").send("404 — not found");
});

async function start(): Promise<void> {
  await loadPositionSnapshot();

  const server = app.listen(config.port, () => {
    console.log(`Below Deck Tracker listening on http://localhost:${config.port}`);
  });

  void startAisTracking();
  const stopSnapshotWriter = startPositionSnapshotWriter();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[server] ${signal} received, saving position snapshot before exit`);
    stopSnapshotWriter();
    await savePositionSnapshot().catch((error) => {
      console.warn("[positions] failed to save snapshot on shutdown:", error);
    });
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void start();
