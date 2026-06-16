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
  /**
   * Match coverage. 'all' = carries every match (a free 'all' channel
   * guarantees THIS match is free). 'selected' = only a curated subset,
   * so a free badge must NOT imply this specific match. Undefined is
   * treated as 'all' for paid channels (badge unaffected) but the UI
   * only shows a solid FREE badge for free + 'all'.
   */
  coverage?: 'all' | 'selected';
  /** Watch URL — set for free platforms with an open web player */
  url?: string;
}

export interface MarketRights {
  country: string;
  broadcasters: Broadcaster[];
}

export const BROADCAST_RIGHTS: Record<string, MarketRights> = {
  US: {
    country: 'United States',
    broadcasters: [
      { name: 'Tubi', free: true, stream: true, coverage: 'all', note: 'all matches, ad-supported', url: 'https://tubitv.com/' },
      { name: 'FOX / FS1', free: true, coverage: 'selected', note: 'English, FOX over-the-air' },
      { name: 'Telemundo', free: true, coverage: 'selected', note: 'Spanish, over-the-air' },
      { name: 'Peacock', free: false, stream: true },
    ],
  },
  MX: {
    country: 'Mexico',
    broadcasters: [
      { name: 'Canal 5 (tv azteca en vivo)', free: true, stream: true, coverage: 'selected', url: 'https://www.tudn.com/' },
      { name: 'TV Azteca Deportes', free: true, stream: true, coverage: 'selected', url: 'https://www.aztecadeportes.com/en-vivo' },
      { name: 'ViX', free: false, stream: true },
    ],
  },
  CA: {
    country: 'Canada',
    broadcasters: [
      { name: 'CTV', free: true, stream: true, coverage: 'selected', url: 'https://www.ctv.ca/live' },
      { name: 'TSN', free: false, note: 'English' },
      { name: 'RDS', free: false, note: 'French' },
    ],
  },
  GB: {
    country: 'United Kingdom',
    broadcasters: [
      { name: 'BBC iPlayer', free: true, stream: true, coverage: 'selected', url: 'https://www.bbc.co.uk/iplayer' },
      { name: 'ITVX', free: true, stream: true, coverage: 'selected', url: 'https://www.itv.com/watch' },
    ],
  },
  DE: {
    country: 'Germany',
    broadcasters: [
      { name: 'MagentaTV', free: false, stream: true, coverage: 'all', note: 'all 104 matches' },
      { name: 'ARD Sportschau', free: true, stream: true, coverage: 'selected', note: 'selected matches', url: 'https://www.sportschau.de/' },
      { name: 'ZDF', free: true, stream: true, coverage: 'selected', note: 'selected matches', url: 'https://www.zdf.de/live-tv' },
    ],
  },
  ES: {
    country: 'Spain',
    broadcasters: [
      { name: 'RTVE Play', free: true, stream: true, coverage: 'selected', url: 'https://www.rtve.es/play/' },
    ],
  },
  FR: {
    country: 'France',
    broadcasters: [
      { name: 'beIN Sports', free: false, coverage: 'all', note: 'all matches' },
      { name: 'TF1+', free: true, stream: true, coverage: 'selected', note: 'selected matches', url: 'https://www.tf1.fr/' },
      { name: '6play (M6)', free: true, stream: true, coverage: 'selected', note: 'selected matches', url: 'https://www.6play.fr/' },
    ],
  },
  BR: {
    country: 'Brazil',
    broadcasters: [
      { name: 'CazéTV (YouTube)', free: true, stream: true, coverage: 'all', note: 'all matches', url: 'https://www.youtube.com/@CazeTV' },
      { name: 'TV Globo', free: true, coverage: 'selected' },
      { name: 'SporTV / Globoplay', free: false },
    ],
  },
  AR: {
    country: 'Argentina',
    broadcasters: [
      { name: 'Telefe', free: true, stream: true, coverage: 'selected', note: 'selected matches', url: 'https://mitelefe.com/vivo' },
      { name: 'TyC Sports', free: false },
    ],
  },
  NL: {
    country: 'Netherlands',
    broadcasters: [
      { name: 'NPO Start (NPO 1)', free: true, stream: true, coverage: 'all', url: 'https://npo.nl/start/live' },
    ],
  },
};

/**
 * Germany per-match free-to-air map for WC2026. MagentaTV carries all
 * 104; ARD/ZDF air a 60-match free subset (30 each), the other 44 are
 * MagentaTV-exclusive (paid). Keyed by our stable match number:
 *   'ARD' | 'ZDF' — confirmed free on that channel
 *   'free'        — confirmed free-to-air, channel not pinned
 *   'magenta'     — MagentaTV-exclusive (paid; not on ARD/ZDF)
 * Only VERIFIED matches are listed (~55 of 104); anything absent falls
 * back to the generic market chips (so we never guess "free"). The free
 * entries are cross-confirmed from sportschau's "60 Livestreams" + match
 * schedule (audio-stream / live-ticker ≠ free TV video); exclusives from
 * sport1.de + heise.de. Most knockout exclusives aren't announced yet —
 * fill them in here as they are. Confirm with local listings.
 */
export type DeFta = 'ARD' | 'ZDF' | 'free' | 'magenta';
export const DE_MATCH_FTA: Record<number, DeFta> = {
  // ---- Free-to-air on ARD ----
  9: 'ARD', // Germany–Curaçao
  56: 'ARD', // Ecuador–Germany
  19: 'ARD', 29: 'ARD', 31: 'ARD', 39: 'ARD', 41: 'ARD', 42: 'ARD',
  45: 'ARD', 46: 'ARD', 48: 'ARD', 49: 'ARD', 58: 'ARD', 60: 'ARD', 63: 'ARD',
  // ---- Free-to-air on ZDF ----
  1: 'ZDF', // opening match (Mexico–South Africa)
  34: 'ZDF', // Germany–Ivory Coast
  104: 'ZDF', // final
  20: 'ZDF', 21: 'ZDF', 22: 'ZDF', 25: 'ZDF', 27: 'ZDF', 33: 'ZDF', 35: 'ZDF',
  38: 'ZDF', 44: 'ZDF', 52: 'ZDF', 61: 'ZDF', 68: 'ZDF', 69: 'ZDF', 71: 'ZDF',
  // ---- Free-to-air, channel not yet pinned ----
  101: 'free', 102: 'free', // both semifinals
  // ---- MagentaTV-exclusive (paid; not on ARD/ZDF) ----
  2: 'magenta', 4: 'magenta', 8: 'magenta', 10: 'magenta', 12: 'magenta',
  17: 'magenta', 18: 'magenta', 23: 'magenta', 24: 'magenta', 26: 'magenta',
  28: 'magenta', 30: 'magenta', 32: 'magenta', 36: 'magenta', 37: 'magenta',
  40: 'magenta', 43: 'magenta', 47: 'magenta', 51: 'magenta', 59: 'magenta',
  103: 'magenta', // third-place playoff
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
