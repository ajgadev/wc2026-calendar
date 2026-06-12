/** Server-side view helpers shared by the Astro components. */
import { STADIUMS, HOST_COUNTRIES } from '../data/stadiums';
import { TEAMS } from '../data/teams';
import { STAGE_LABELS } from '../data/schedule';
import { venueDate, venueTime } from './time';
import { hasRedCard, type MatchDetailsArchive } from './cards';
import matchDetails from '../../public/data/matchDetails.json';
import type { Match } from './types';

/** Red-card indicator for rows/chips — baked from the committed archive. */
export function matchHasRed(m: Match): boolean {
  return hasRedCard((matchDetails as MatchDetailsArchive)[String(m.n)]);
}

export function stadiumOf(m: Match) {
  return STADIUMS[m.stadium];
}

/** host-mx / host-us / host-ca — drives the structural color coding */
export function hostClass(m: Match): string {
  return `host-${stadiumOf(m).country.toLowerCase()}`;
}

export function flagSrc(code: string, size: 40 | 80 | 160 = 40): string {
  return `https://flagcdn.com/w${size}/${TEAMS[code]?.flag}.png`;
}

/** Venue-local calendar day the match belongs to (agenda/calendar bucketing) */
export function matchDayKey(m: Match): string {
  return venueDate(m.utc, stadiumOf(m).timezone);
}

/** Venue-local kickoff — the no-JS fallback text inside [data-kick] */
export function venueKick(m: Match): string {
  return venueTime(m.utc, stadiumOf(m).timezone);
}

export function venueChip(m: Match): string {
  const v = stadiumOf(m);
  return `${v.cityShort} · ${HOST_COUNTRIES[v.country].short}`;
}

/** "GROUP E · MD1" / "ROUND OF 32 · M74" */
export function roundLabel(m: Match): string {
  return m.stage === 'GR'
    ? `GROUP ${m.group} · MD${m.md}`
    : `${STAGE_LABELS[m.stage].toUpperCase()} · M${m.n}`;
}

/** "Group E" / "Round of 32" — calendar chip caption (spelled out) */
export function groupCaption(m: Match): string {
  return m.stage === 'GR' ? `Group ${m.group}` : STAGE_LABELS[m.stage];
}

/** Static-layer state: live only ever comes from the runtime overlay */
export function stateOf(m: Match): 'up' | 'ft' {
  return m.ft ? 'ft' : 'up';
}

/** Search haystack for the client-side filter (codes, names, city, stadium, round) */
export function searchText(m: Match): string {
  const v = stadiumOf(m);
  return [
    m.a, m.b,
    m.a ? TEAMS[m.a]?.name : m.pa,
    m.b ? TEAMS[m.b]?.name : m.pb,
    v.name, v.city, v.cityShort,
    STAGE_LABELS[m.stage],
    m.group ? `group ${m.group}` : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
