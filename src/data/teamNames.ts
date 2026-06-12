import { TEAMS } from './teams';

/**
 * Cross-API name normalization. The three sources disagree on names:
 *   openfootball:      "Czech Republic", "Turkey", "Ivory Coast", "USA"
 *   football-data.org: "Czechia", "Korea Republic", "IR Iran", "Côte d'Ivoire"
 *   TheSportsDB:       common English names
 * Everything funnels through `teamCodeFor(name)` → FIFA code.
 */

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Aliases seen across openfootball / football-data.org / TheSportsDB. */
const ALIASES: Record<string, string> = {
  // host trio
  'usa': 'USA', 'united states': 'USA', 'united states of america': 'USA',
  'mexico': 'MEX',
  'canada': 'CAN',
  // names that differ between sources
  'czech republic': 'CZE', 'czechia': 'CZE',
  'turkey': 'TUR', 'turkiye': 'TUR',
  'ivory coast': 'CIV', "cote d ivoire": 'CIV', 'cote divoire': 'CIV',
  'cape verde': 'CPV', 'cabo verde': 'CPV', 'cape verde islands': 'CPV',
  'bosnia herzegovina': 'BIH', 'bosnia and herzegovina': 'BIH', 'bosnia herz': 'BIH',
  'south korea': 'KOR', 'korea republic': 'KOR', 'korea': 'KOR',
  'iran': 'IRN', 'ir iran': 'IRN',
  'dr congo': 'COD', 'congo dr': 'COD', 'democratic republic of the congo': 'COD',
  'netherlands': 'NED', 'holland': 'NED',
  'switzerland': 'SUI',
  'saudi arabia': 'KSA',
  'new zealand': 'NZL',
  'south africa': 'RSA',
  'uruguay': 'URU',
  'paraguay': 'PAR',
  'curacao': 'CUW',
};

const byName: Record<string, string> = { ...ALIASES };
for (const t of Object.values(TEAMS)) {
  byName[strip(t.name)] = t.code;
  byName[strip(t.code)] = t.code;
}

/** Resolve any source's team name to a FIFA code, or null if unknown. */
export function teamCodeFor(name: string): string | null {
  if (!name) return null;
  const code = byName[strip(name)];
  if (!code && import.meta.env?.DEV) {
    console.warn(`[teamNames] unmatched team name: "${name}"`);
  }
  return code ?? null;
}

/** Name to use when querying TheSportsDB (common English names). */
export const SPORTSDB_NAMES: Record<string, string> = {
  USA: 'United States', CIV: 'Ivory Coast', CPV: 'Cape Verde',
  CZE: 'Czech Republic', TUR: 'Turkey', BIH: 'Bosnia and Herzegovina',
  KOR: 'South Korea', COD: 'DR Congo', KSA: 'Saudi Arabia',
};

export function sportsDbNameFor(code: string): string {
  return SPORTSDB_NAMES[code] ?? TEAMS[code]?.name ?? code;
}

export { strip as normalizeName };
