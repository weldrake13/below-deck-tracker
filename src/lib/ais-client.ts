import WebSocket from "ws";
import { config } from "./config.js";
import { getTrackedMmsiList } from "./content.js";
import { setPosition } from "./position-store.js";

const STREAM_URL = "wss://stream.aisstream.io/v0/stream";

// aisstream.io message envelope: { MessageType, MetaData, Message: { [MessageType]: {...} } }
// MetaData carries MMSI/ShipName/lat/lon on every message, regardless of type.
interface AisEnvelope {
  MessageType: string;
  MetaData?: {
    MMSI?: number;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: {
      Latitude?: number;
      Longitude?: number;
      Cog?: number;
      Sog?: number;
    };
  };
}

let backoffMs = 1000;
const MAX_BACKOFF_MS = 30_000;

function connect(mmsiList: number[]): void {
  const ws = new WebSocket(STREAM_URL);

  ws.on("open", () => {
    console.log(`[ais] connected — tracking ${mmsiList.length} vessel(s)`);
    backoffMs = 1000;
    ws.send(
      JSON.stringify({
        APIKey: config.aisstream.apiKey,
        // One box spanning the whole world: charter yachts reposition between
        // oceans between seasons, and FiltersShipMMSI below already restricts
        // the feed to just our tracked vessels, so a wide box costs us nothing.
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FiltersShipMMSI: mmsiList.map(String),
        FilterMessageTypes: ["PositionReport", "ShipStaticData"],
      }),
    );
  });

  ws.on("message", (data) => {
    let envelope: AisEnvelope;
    try {
      envelope = JSON.parse(data.toString());
    } catch {
      return;
    }

    const mmsi = envelope.MetaData?.MMSI;
    if (mmsi === undefined) return;

    const report = envelope.Message?.PositionReport;
    const latitude = report?.Latitude ?? envelope.MetaData?.latitude;
    const longitude = report?.Longitude ?? envelope.MetaData?.longitude;
    if (latitude === undefined || longitude === undefined) return;

    setPosition({
      mmsi,
      latitude,
      longitude,
      course: report?.Cog ?? null,
      speedKnots: report?.Sog ?? null,
      receivedAt: envelope.MetaData?.time_utc ?? new Date().toISOString(),
      broadcastName: envelope.MetaData?.ShipName?.trim() || null,
    });
  });

  ws.on("close", (code) => {
    console.log(`[ais] disconnected (code ${code}), reconnecting in ${backoffMs / 1000}s`);
    scheduleReconnect(mmsiList);
  });

  ws.on("error", (error) => {
    console.error("[ais] connection error:", error.message);
    ws.close();
  });
}

function scheduleReconnect(mmsiList: number[]): void {
  setTimeout(() => connect(mmsiList), backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

/**
 * Opens the live AIS feed if a key is configured and at least one yacht has
 * a known MMSI. Otherwise a no-op — the app runs fine without it, just with
 * no live positions.
 */
export async function startAisTracking(): Promise<void> {
  if (config.aisstream.apiKey === "") {
    console.log("[ais] AISSTREAM_API_KEY not set — live tracking disabled");
    return;
  }

  const mmsiList = await getTrackedMmsiList();
  if (mmsiList.length === 0) {
    console.log("[ais] no yachts have a known MMSI yet — nothing to track");
    return;
  }

  connect(mmsiList);
}
