function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 3000),
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
