/**
 * Kickoff parsing & formatting.
 * openfootball gives `date: "2026-06-11"` + `time: "13:00 UTC-6"` —
 * the offset is the venue's. We convert once into a true UTC instant
 * and keep ISO UTC strings everywhere internally.
 */

/** "13:00 UTC-6" | "16:30 UTC-4" (+ optional :MM on the offset) → ISO UTC */
export function parseKickoff(date: string, time: string): string {
  const m = /^(\d{1,2}):(\d{2})\s*UTC([+-])(\d{1,2})(?::(\d{2}))?$/.exec(time.trim());
  if (!m) throw new Error(`Unparseable kickoff time "${time}" on ${date}`);
  const [, hh, mm, sign, oh, om] = m;
  const offsetMin = (Number(oh) * 60 + Number(om ?? 0)) * (sign === '-' ? -1 : 1);
  const utcMs = Date.parse(`${date}T${hh.padStart(2, '0')}:${mm}:00Z`) - offsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

/** Venue-local HH:MM for a UTC instant, via the stadium's IANA timezone. */
export function venueTime(utcIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date(utcIso));
}

/** Venue-local calendar date (YYYY-MM-DD) — used to bucket matches into days. */
export function venueDate(utcIso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: timezone,
  }).format(new Date(utcIso));
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "THU JUN 11" style label for a YYYY-MM-DD key (UTC-safe). */
export function dayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Jun 11" short label. */
export function shortDate(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  const mon = MON[d.getUTCMonth()];
  return mon.charAt(0) + mon.slice(1).toLowerCase() + ' ' + d.getUTCDate();
}

/** Live polling window: kickoff − 20 min … kickoff + 150 min. */
export const LIVE_WINDOW_BEFORE_MS = 20 * 60_000;
export const LIVE_WINDOW_AFTER_MS = 150 * 60_000;

export function inLiveWindow(utcIso: string, now: number): boolean {
  const kick = Date.parse(utcIso);
  return now >= kick - LIVE_WINDOW_BEFORE_MS && now <= kick + LIVE_WINDOW_AFTER_MS;
}
