/**
 * World Cup 2026 broadcast rights holders for major markets, with
 * free-to-air flags. Curated from announced rights deals (see
 * Wikipedia: "2026 FIFA World Cup broadcasting rights") — per-match
 * channel splits come from the APIs at runtime; this table answers
 * "who has rights in my country and is it free?".
 *
 * Maintenance note: one entry per market, easy to correct. The UI
 * shows a "confirm with local listings" disclaimer.
 */

export interface Broadcaster {
  name: string;
  free: boolean;
  stream?: boolean;
  note?: string;
}

export interface MarketRights {
  country: string;
  broadcasters: Broadcaster[];
}

export const BROADCAST_RIGHTS: Record<string, MarketRights> = {
  US: {
    country: 'United States',
    broadcasters: [
      { name: 'FOX / FS1', free: true, note: 'English, FOX over-the-air' },
      { name: 'Tubi', free: true, stream: true, note: 'all matches, ad-supported' },
      { name: 'Telemundo', free: true, note: 'Spanish, over-the-air' },
      { name: 'Peacock', free: false, stream: true },
    ],
  },
  MX: {
    country: 'Mexico',
    broadcasters: [
      { name: 'Televisa (Canal 5 / Las Estrellas)', free: true },
      { name: 'TV Azteca (Azteca 7)', free: true },
      { name: 'ViX', free: false, stream: true },
    ],
  },
  CA: {
    country: 'Canada',
    broadcasters: [
      { name: 'CTV', free: true },
      { name: 'TSN', free: false, note: 'English' },
      { name: 'RDS', free: false, note: 'French' },
    ],
  },
  GB: {
    country: 'United Kingdom',
    broadcasters: [
      { name: 'BBC / iPlayer', free: true },
      { name: 'ITV / ITVX', free: true },
    ],
  },
  DE: {
    country: 'Germany',
    broadcasters: [
      { name: 'ARD / ZDF', free: true, note: 'most matches' },
      { name: 'MagentaTV', free: false, stream: true, note: 'all 104 matches' },
    ],
  },
  ES: {
    country: 'Spain',
    broadcasters: [
      { name: 'RTVE (La 1 / RTVE Play)', free: true },
    ],
  },
  FR: {
    country: 'France',
    broadcasters: [
      { name: 'TF1 / M6', free: true, note: 'selected matches' },
      { name: 'beIN Sports', free: false, note: 'all matches' },
    ],
  },
  BR: {
    country: 'Brazil',
    broadcasters: [
      { name: 'TV Globo', free: true },
      { name: 'CazéTV (YouTube)', free: true, stream: true },
      { name: 'SporTV / Globoplay', free: false },
    ],
  },
  AR: {
    country: 'Argentina',
    broadcasters: [
      { name: 'Telefe', free: true, note: 'selected matches' },
      { name: 'TyC Sports', free: false },
    ],
  },
  NL: {
    country: 'Netherlands',
    broadcasters: [
      { name: 'NOS (NPO 1)', free: true },
    ],
  },
};

/** Our market codes → TheSportsDB's country labels in lookuptv. */
export const SDB_COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  MX: 'Mexico',
  CA: 'Canada',
  GB: 'United Kingdom',
  DE: 'Germany',
  ES: 'Spain',
  FR: 'France',
  BR: 'Brazil',
  AR: 'Argentina',
  NL: 'Netherlands',
};

/** Browser locale → market code (region subtag when present). */
export function detectMarket(locale: string): string | null {
  const region = /-([A-Z]{2})\b/.exec(locale.toUpperCase())?.[1];
  if (region && BROADCAST_RIGHTS[region]) return region;
  if (region === 'UK') return 'GB';
  return null;
}
