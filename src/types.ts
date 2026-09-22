export type ShowSlug =
  | "below-deck"
  | "below-deck-med"
  | "below-deck-sailing-yacht"
  | "below-deck-down-under"
  | "below-deck-adventure";

export interface Show {
  slug: ShowSlug;
  name: string;
  /** Short form used on badges/chips where space is tight. */
  shortName: string;
  premiered: number;
  /** Accent colour for this show's badges — a nautical-adjacent hue, not a clash. */
  colour: string;
}

export interface YachtEntry {
  /** Stable id, unique per show-appearance. Generated from show + season + show name. */
  id: string;
  /** The name the yacht is given on the show — what viewers know it as. */
  showName: string;
  /** The yacht's real, registered name. Same as showName for the few that weren't renamed. */
  realName: string;
  show: ShowSlug;
  seasons: number[];
  vesselType: "motor yacht" | "sailing yacht" | "catamaran";
  lengthFt: number | null;
  builder: string | null;
  /** Maritime Mobile Service Identity — the number AIS tracking keys off. null if unknown. */
  mmsi: number | null;
  imo: number | null;
  /** Descriptive cruising grounds for display, e.g. "Caribbean & Bahamas". Not used for AIS filtering. */
  homeWaters: string | null;
  notes: string | null;
}

export interface Position {
  mmsi: number;
  latitude: number;
  longitude: number;
  /** Course over ground, degrees. */
  course: number | null;
  /** Speed over ground, knots. */
  speedKnots: number | null;
  /** ISO timestamp of when this position was received. */
  receivedAt: string;
  /** Ship name as broadcast by the vessel itself, if we've seen a static data report. */
  broadcastName: string | null;
}
