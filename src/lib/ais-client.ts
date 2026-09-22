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

// aisstream sends time_utc as Go's default time.Time string format, e.g.
// "2026-09-22 10:57:03.893983009 +0000 UTC" — not ISO 8601. `new Date(...)`
// happens to parse it in V8 (Node, Chrome), but that's lenient-parser luck,
// not a guarantee — other engines (e.g. Safari/JavaScriptCore) are stricter
// and can return Invalid Date. Normalise once here rather than trust every
// consumer's Date parser to guess right. It's always UTC (the field name
// says so), so we only need the date/time digits — sub-second precision and
// the redundant "+0000 UTC" suffix don't matter for an "updated Xm ago" UI.
const GO_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/;

function toIsoTimestamp(raw: string | undefined): string {
  const match = raw !== undefined ? GO_TIMESTAMP.exec(raw) : null;
  if (match) return `${match[1]}T${match[2]}Z`;
  return new Date().toISOString();
}

export type AisConnectionState = "disabled" | "connecting" | "connected" | "reconnecting";

export interface AisStatus {
  connectionState: AisConnectionState;
  /** Why tracking never started, when connectionState is "disabled". */
  disabledReason: string | null;
  trackedMmsiCount: number;
  connectedAt: string | null;
  reconnectAttempts: number;
  lastCloseCode: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** Total AIS frames received since this process started — near-zero after
   *  a while means the socket itself isn't hearing anything, which points at
   *  the subscription (wrong key, or aisstream-side issue) rather than the
   *  tracked vessels just being out of coverage. */
  messagesReceived: number;
}

const status: AisStatus = {
  connectionState: "disabled",
  disabledReason: "not started yet",
  trackedMmsiCount: 0,
  connectedAt: null,
  reconnectAttempts: 0,
  lastCloseCode: null,
  lastError: null,
  lastErrorAt: null,
  messagesReceived: 0,
};

/** A snapshot of the live feed's own health — see GET /api/debug. */
export function getAisStatus(): AisStatus {
  return { ...status };
}

function connect(mmsiList: number[]): void {
  const ws = new WebSocket(STREAM_URL);

  ws.on("open", () => {
    console.log(`[ais] connected — tracking ${mmsiList.length} vessel(s)`);
    backoffMs = 1000;
    status.connectionState = "connected";
    status.connectedAt = new Date().toISOString();
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
    status.messagesReceived += 1;

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
      receivedAt: toIsoTimestamp(envelope.MetaData?.time_utc),
      broadcastName: envelope.MetaData?.ShipName?.trim() || null,
    });
  });

  ws.on("close", (code) => {
    console.log(`[ais] disconnected (code ${code}), reconnecting in ${backoffMs / 1000}s`);
    status.connectionState = "reconnecting";
    status.lastCloseCode = code;
    scheduleReconnect(mmsiList);
  });

  ws.on("error", (error) => {
    console.error("[ais] connection error:", error.message);
    status.lastError = error.message;
    status.lastErrorAt = new Date().toISOString();
    ws.close();
  });
}

function scheduleReconnect(mmsiList: number[]): void {
  status.reconnectAttempts += 1;
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
    status.disabledReason = "AISSTREAM_API_KEY not set";
    return;
  }

  const mmsiList = await getTrackedMmsiList();
  if (mmsiList.length === 0) {
    console.log("[ais] no yachts have a known MMSI yet — nothing to track");
    status.disabledReason = "no yachts have a known MMSI yet";
    return;
  }

  status.trackedMmsiCount = mmsiList.length;
  status.disabledReason = null;
  status.connectionState = "connecting";
  connect(mmsiList);
}
