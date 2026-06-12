import type { Team } from '../lib/types';

/**
 * All 48 qualified teams (post-draw, Dec 2025), keyed by FIFA code.
 * `flag` is the flagcdn.com ISO code. `name` is the display name used
 * across the app (matches the approved design).
 */
export const TEAMS: Record<string, Team> = {
  MEX: { code: 'MEX', name: 'Mexico', flag: 'mx', group: 'A', host: true },
  RSA: { code: 'RSA', name: 'South Africa', flag: 'za', group: 'A' },
  KOR: { code: 'KOR', name: 'South Korea', flag: 'kr', group: 'A' },
  CZE: { code: 'CZE', name: 'Czechia', flag: 'cz', group: 'A' },
  CAN: { code: 'CAN', name: 'Canada', flag: 'ca', group: 'B', host: true },
  SUI: { code: 'SUI', name: 'Switzerland', flag: 'ch', group: 'B' },
  QAT: { code: 'QAT', name: 'Qatar', flag: 'qa', group: 'B' },
  BIH: { code: 'BIH', name: 'Bosnia & Herz.', flag: 'ba', group: 'B' },
  BRA: { code: 'BRA', name: 'Brazil', flag: 'br', group: 'C' },
  MAR: { code: 'MAR', name: 'Morocco', flag: 'ma', group: 'C' },
  HAI: { code: 'HAI', name: 'Haiti', flag: 'ht', group: 'C' },
  SCO: { code: 'SCO', name: 'Scotland', flag: 'gb-sct', group: 'C' },
  USA: { code: 'USA', name: 'United States', flag: 'us', group: 'D', host: true },
  PAR: { code: 'PAR', name: 'Paraguay', flag: 'py', group: 'D' },
  AUS: { code: 'AUS', name: 'Australia', flag: 'au', group: 'D' },
  TUR: { code: 'TUR', name: 'Türkiye', flag: 'tr', group: 'D' },
  GER: { code: 'GER', name: 'Germany', flag: 'de', group: 'E' },
  CUW: { code: 'CUW', name: 'Curaçao', flag: 'cw', group: 'E' },
  CIV: { code: 'CIV', name: "Côte d'Ivoire", flag: 'ci', group: 'E' },
  ECU: { code: 'ECU', name: 'Ecuador', flag: 'ec', group: 'E' },
  NED: { code: 'NED', name: 'Netherlands', flag: 'nl', group: 'F' },
  JPN: { code: 'JPN', name: 'Japan', flag: 'jp', group: 'F' },
  TUN: { code: 'TUN', name: 'Tunisia', flag: 'tn', group: 'F' },
  SWE: { code: 'SWE', name: 'Sweden', flag: 'se', group: 'F' },
  BEL: { code: 'BEL', name: 'Belgium', flag: 'be', group: 'G' },
  EGY: { code: 'EGY', name: 'Egypt', flag: 'eg', group: 'G' },
  IRN: { code: 'IRN', name: 'Iran', flag: 'ir', group: 'G' },
  NZL: { code: 'NZL', name: 'New Zealand', flag: 'nz', group: 'G' },
  ESP: { code: 'ESP', name: 'Spain', flag: 'es', group: 'H' },
  CPV: { code: 'CPV', name: 'Cabo Verde', flag: 'cv', group: 'H' },
  KSA: { code: 'KSA', name: 'Saudi Arabia', flag: 'sa', group: 'H' },
  URU: { code: 'URU', name: 'Uruguay', flag: 'uy', group: 'H' },
  FRA: { code: 'FRA', name: 'France', flag: 'fr', group: 'I' },
  SEN: { code: 'SEN', name: 'Senegal', flag: 'sn', group: 'I' },
  NOR: { code: 'NOR', name: 'Norway', flag: 'no', group: 'I' },
  IRQ: { code: 'IRQ', name: 'Iraq', flag: 'iq', group: 'I' },
  ARG: { code: 'ARG', name: 'Argentina', flag: 'ar', group: 'J' },
  ALG: { code: 'ALG', name: 'Algeria', flag: 'dz', group: 'J' },
  AUT: { code: 'AUT', name: 'Austria', flag: 'at', group: 'J' },
  JOR: { code: 'JOR', name: 'Jordan', flag: 'jo', group: 'J' },
  POR: { code: 'POR', name: 'Portugal', flag: 'pt', group: 'K' },
  UZB: { code: 'UZB', name: 'Uzbekistan', flag: 'uz', group: 'K' },
  COL: { code: 'COL', name: 'Colombia', flag: 'co', group: 'K' },
  COD: { code: 'COD', name: 'DR Congo', flag: 'cd', group: 'K' },
  ENG: { code: 'ENG', name: 'England', flag: 'gb-eng', group: 'L' },
  CRO: { code: 'CRO', name: 'Croatia', flag: 'hr', group: 'L' },
  GHA: { code: 'GHA', name: 'Ghana', flag: 'gh', group: 'L' },
  PAN: { code: 'PAN', name: 'Panama', flag: 'pa', group: 'L' },
};

export const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const HOST_BY_TEAM: Record<string, 'mx' | 'us' | 'ca'> = {
  MEX: 'mx',
  USA: 'us',
  CAN: 'ca',
};
