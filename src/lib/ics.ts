import type { Match, Stadium, Team } from './types';
import { STAGE_LABELS } from '../data/schedule';
import { HOST_COUNTRIES } from '../data/stadiums';

/**
 * Standards-compliant iCalendar feed. Stable UIDs
 * (`wc2026-match-{n}@{domain}`) mean a re-fetch after a result updates
 * the event (score lands in SUMMARY) instead of duplicating it.
 */

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function icsDate(utcIso: string): string {
  return utcIso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75);
  }
  out.push(rest);
  return out.join('\r\n');
}

export interface IcsOptions {
  domain: string;
  appUrl: string;
  /** built at this time — becomes DTSTAMP */
  now?: string;
}

export function buildIcs(
  matches: Match[],
  teams: Record<string, Team>,
  stadiums: Record<string, Stadium>,
  opts: IcsOptions,
): string {
  const dtstamp = icsDate(opts.now ?? new Date().toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MATCHDAY26//World Cup 2026 Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold('X-WR-CALNAME:World Cup 2026'),
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const m of matches) {
    const v = stadiums[m.stadium];
    const host = v ? HOST_COUNTRIES[v.country] : undefined;
    const nameA = m.a ? teams[m.a]?.name ?? m.a : m.pa ?? m.rawA;
    const nameB = m.b ? teams[m.b]?.name ?? m.b : m.pb ?? m.rawB;
    const stageBit = m.stage === 'GR' ? `Group ${m.group}` : STAGE_LABELS[m.stage];
    let summary = `⚽ ${nameA} vs ${nameB} — ${stageBit}`;
    if (m.ft) summary = `⚽ ${nameA} ${m.ft[0]}–${m.ft[1]} ${nameB} — ${stageBit}`;
    const end = new Date(Date.parse(m.utc) + 2 * 3600_000).toISOString();
    const description = `${stageBit} · Match ${m.n} · World Cup 2026\n${opts.appUrl}`;

    lines.push(
      'BEGIN:VEVENT',
      fold(`UID:wc2026-match-${m.n}@${opts.domain}`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${icsDate(m.utc)}`,
      `DTEND:${icsDate(end)}`,
      fold(`SUMMARY:${icsEscape(summary)}`),
      fold(`LOCATION:${icsEscape(v ? `${v.name}, ${v.city}, ${host?.name ?? ''}` : '')}`),
      fold(`DESCRIPTION:${icsEscape(description)}`),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
