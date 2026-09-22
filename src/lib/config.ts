function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  // 3100, not 3000 — this runs on the same box as the jessica-jade site, which owns 3000.
  port: num(process.env.PORT, 3100),
  isProduction: process.env.NODE_ENV === "production",

  /**
   * Live AIS tracking. With no key configured the app still runs in full —
   * the yacht list, filters and map all work — positions are just reported
   * as "not currently tracked" instead of silently pretending to be live.
   */
  aisstream: {
    apiKey: process.env.AISSTREAM_API_KEY ?? "",
  },
} as const;

export const aisConfigured = config.aisstream.apiKey !== "";
