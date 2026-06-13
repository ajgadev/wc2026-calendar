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
      { name: 'FOX / FS1', free: true, note: 'English, FOX over-the-air' },
      { name: 'Tubi', free: true, stream: true, note: 'all matches, ad-supported', url: 'https://tubitv.com/' },
      { name: 'Telemundo', free: true, note: 'Spanish, over-the-air' },
      { name: 'Peacock', free: false, stream: true },
    ],
  },
  MX: {
    country: 'Mexico',
    broadcasters: [
      { name: 'Canal 5 (tv azteca en vivo)', free: true, stream: true, url: 'https://www.tudn.com/' },
      { name: 'TV Azteca Deportes', free: true, stream: true, url: 'https://www.aztecadeportes.com/en-vivo' },
      { name: 'ViX', free: false, stream: true },
    ],
  },
  CA: {
    country: 'Canada',
    broadcasters: [
      { name: 'CTV', free: true, stream: true, url: 'https://www.ctv.ca/live' },
      { name: 'TSN', free: false, note: 'English' },
      { name: 'RDS', free: false, note: 'French' },
    ],
  },
  GB: {
    country: 'United Kingdom',
    broadcasters: [
      { name: 'BBC iPlayer', free: true, stream: true, url: 'https://www.bbc.co.uk/iplayer' },
      { name: 'ITVX', free: true, stream: true, url: 'https://www.itv.com/watch' },
    ],
  },
  DE: {
    country: 'Germany',
    broadcasters: [
      { name: 'ARD Sportschau', free: true, stream: true, note: 'most matches', url: 'https://www.sportschau.de/' },
      { name: 'ZDF', free: true, stream: true, url: 'https://www.zdf.de/live-tv' },
      { name: 'MagentaTV', free: false, stream: true, note: 'all 104 matches' },
    ],
  },
  ES: {
    country: 'Spain',
    broadcasters: [
      { name: 'RTVE Play', free: true, stream: true, url: 'https://www.rtve.es/play/' },
    ],
  },
  FR: {
    country: 'France',
    broadcasters: [
      { name: 'TF1+', free: true, stream: true, note: 'selected matches', url: 'https://www.tf1.fr/' },
      { name: '6play (M6)', free: true, stream: true, note: 'selected matches', url: 'https://www.6play.fr/' },
      { name: 'beIN Sports', free: false, note: 'all matches' },
    ],
  },
  BR: {
    country: 'Brazil',
    broadcasters: [
      { name: 'CazéTV (YouTube)', free: true, stream: true, url: 'https://www.youtube.com/@CazeTV' },
      { name: 'TV Globo', free: true },
      { name: 'SporTV / Globoplay', free: false },
    ],
  },
  AR: {
    country: 'Argentina',
    broadcasters: [
      { name: 'Telefe', free: true, stream: true, note: 'selected matches', url: 'https://mitelefe.com/vivo' },
      { name: 'TyC Sports', free: false },
    ],
  },
  NL: {
    country: 'Netherlands',
    broadcasters: [
      { name: 'NPO Start (NPO 1)', free: true, stream: true, url: 'https://npo.nl/start/live' },
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
