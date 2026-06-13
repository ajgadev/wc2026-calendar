/**
 * Re-buckets the statically rendered agenda sections and calendar
 * chips into the visitor's local timezone. The build groups matches by
 * stadium-local date (the only sane choice for prerendered HTML); for
 * a viewer in Europe a 20:00-in-LA kickoff belongs to *their* next
 * day. Runs once on load; without JS the venue-day grouping remains
 * as the fallback. Dispatches "wc26:refilter" so the FilterBar can
 * re-apply URL filters to the rebuilt sections.
 */
import { appData } from './client';

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n: number) => String(n).padStart(2, '0');

function localDayKey(utc: string): string {
  const d = new Date(utc);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayLabel(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function relocalize(): void {
  const { matches, stageLabels } = appData();
  const utcByN = new Map(matches.map((m) => [m.n, m.utc]));
  const stageByN = new Map(matches.map((m) => [m.n, m.stage]));
  const today = todayKey();

  /* ---- agenda sections ---- */
  const sections = [...document.querySelectorAll<HTMLElement>('[data-day-section]')];
  if (sections.length > 0) {
    const parent = sections[0].parentElement!;
    const rows = sections.flatMap((s) => [...s.querySelectorAll<HTMLElement>('[data-match]')]);

    // header-only template cloned from the first section
    const template = sections[0].cloneNode(true) as HTMLElement;
    template.querySelectorAll('[data-match]').forEach((r) => r.remove());

    const groups = new Map<string, HTMLElement[]>();
    for (const row of rows) {
      const utc = utcByN.get(Number(row.dataset.n));
      if (!utc) continue;
      const key = localDayKey(utc);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(row);
    }

    const anchor = sections[0];
    const fresh: HTMLElement[] = [];
    for (const key of [...groups.keys()].sort()) {
      const rowsForDay = groups.get(key)!.sort(
        (a, b) => Date.parse(utcByN.get(Number(a.dataset.n))!) - Date.parse(utcByN.get(Number(b.dataset.n))!),
      );
      const section = template.cloneNode(true) as HTMLElement;
      section.id = `day-${key}`;
      section.dataset.date = key;
      if (key === today) section.setAttribute('data-is-today', '');
      else section.removeAttribute('data-is-today');
      section.classList.remove('filtered-out');
      const h3 = section.querySelector('h3');
      if (h3) h3.textContent = dayLabel(key);
      const sub = section.querySelector('h3 + span');
      if (sub) {
        const rounds = [...new Set(rowsForDay.map((r) => {
          const stage = stageByN.get(Number(r.dataset.n)) ?? 'GR';
          return stage === 'GR' ? 'Group stage' : (stageLabels[stage] ?? stage);
        }))];
        sub.textContent = `${rowsForDay.length} ${rowsForDay.length === 1 ? 'match' : 'matches'} · ${rounds.join(' · ')}`;
      }
      section.append(...rowsForDay);
      fresh.push(section);
    }
    parent.insertBefore(document.createDocumentFragment(), anchor);
    fresh.forEach((s) => parent.insertBefore(s, anchor));
    sections.forEach((s) => s.remove());
  }

  /* ---- calendar chips ---- */
  const calendar = document.querySelector<HTMLElement>('[data-calendar]');
  if (calendar) {
    const touched = new Set<HTMLElement>();
    for (const chip of [...calendar.querySelectorAll<HTMLElement>('[data-match]')]) {
      const utc = utcByN.get(Number(chip.dataset.n));
      if (!utc) continue;
      const key = localDayKey(utc);
      const cell = chip.closest<HTMLElement>('[data-date]');
      if (!cell || cell.dataset.date === key) continue;
      const target = calendar.querySelector<HTMLElement>(`[data-date="${key}"]`);
      if (target) {
        target.querySelector('[data-rest-day]')?.remove();
        target.append(chip);
        touched.add(cell);
        touched.add(target);
      }
    }
    // re-sort every cell that gained or lost a chip, by kickoff time
    for (const cell of touched) {
      const chips = [...cell.querySelectorAll<HTMLElement>('[data-match]')].sort(
        (a, b) => Date.parse(utcByN.get(Number(a.dataset.n))!) - Date.parse(utcByN.get(Number(b.dataset.n))!),
      );
      chips.forEach((c) => cell.appendChild(c));
    }
  }

  window.dispatchEvent(new Event('wc26:refilter'));
}
