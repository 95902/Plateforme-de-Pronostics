/**
 * Adapter for www.turfpronos.fr, a site that gathers the press tips of the day's PMU races.
 *
 * - The home page lists the day's Quinté+ and Pick 5 races (and tomorrow's).
 * - Each race page (course?id=N) gives the field (horse, weight, draw, jockey, trainer...) and,
 *   in its "Pronostics" tab, the tips of several newspapers and their synthesis (SYNTHESE).
 *
 * The pages are rendered on the server, so plain HTML parsing is enough. No odds and no results:
 * races are imported as scheduled; odds and arrivals come from another source. Scraping for
 * private use only (docs/sources-de-donnees.md).
 */
import type { ImportRace, ImportRunner } from '../format.js';
import { mapDiscipline, pmuRaceExternalId } from './open-pmu.js';

export const TURFPRONOS_SOURCE = 'turfpronos';
export const TURFPRONOS_URL = 'https://www.turfpronos.fr/';
export const TURFPRONOS_BETS = ['pick5', 'quinte'] as const;
export type TurfPronosBet = (typeof TURFPRONOS_BETS)[number];
/** Name of the synthesis row in the tips table */
export const CONSENSUS_TIPSTER = 'SYNTHESE';

export interface TurfPronosRaceLink {
  course_id: number;
  bet: TurfPronosBet;
  /** e.g. "R4C9 - PRIX DE LA MALMONTAGNE" */
  label: string;
}

export interface TurfPronosTip {
  tipster: string;
  /** Saddle numbers, in the tipster's order */
  selection: number[];
}

export interface TurfPronosRunner {
  saddle_number: number;
  horse: string;
  sex?: 'M' | 'F' | 'H';
  age?: number;
  weight?: number;
  draw?: number;
  jockey?: string;
  trainer?: string;
  /** Recent form as printed, e.g. "4p0p7p5p" */
  music?: string;
}

export interface TurfPronosCourse {
  date: string;
  reunion: number;
  race_number: number;
  name: string;
  racecourse: string;
  /** HH:MM, local time */
  time: string | null;
  /** As printed: PLAT, ATTELE, HAIES... */
  speciality: string | null;
  distance: number | null;
  prize_money: number | null;
  declared_runners: number | null;
  runners: TurfPronosRunner[];
  /** Press tips, synthesis excluded */
  tips: TurfPronosTip[];
  /** The site's synthesis of the press tips */
  consensus: number[] | null;
  /** Synthesis score of each horse cited (Gaussian weighting of its positions in the tips) */
  scores: { saddle_number: number; score: number }[];
}

const MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#039': "'" };

/** Text content of an HTML fragment: tags removed, entities decoded, spaces collapsed */
export function htmlText(fragment: string): string {
  return fragment
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (entity, code: string) => {
      const lower = code.toLowerCase();
      if (ENTITIES[lower]) return ENTITIES[lower];
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith('#')) return String.fromCodePoint(Number(lower.slice(1)));
      return entity;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** "16 Octobre 2026" → "2026-10-16" */
function parseFrenchDate(day: string, month: string, year: string): string | null {
  const index = MONTHS.indexOf(normalize(month));
  if (index < 0) return null;
  return `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** Saddle numbers of a tip such as " 1 - 14 - 11 - 12" */
const parseSelection = (text: string) =>
  text
    .split('-')
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number > 0);

/** Rows of an HTML table, each row being the HTML of its cells */
function tableRows(tableHtml: string): string[][] {
  return [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => cell[1])
  );
}

/** HTML of the tab pane with this id (up to the next pane) */
function tabPane(html: string, id: string): string {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return '';
  const next = html.indexOf('class="tab-pane', start + id.length);
  return html.slice(start, next < 0 ? undefined : next);
}

/**
 * Quinté+ and Pick 5 races listed on the home page, for today (default) or tomorrow.
 * Returns the date of that day as well (YYYY-MM-DD), read from the page.
 */
export function parseHomePage(html: string, day: 'today' | 'tomorrow' = 'today'): { date: string | null; races: TurfPronosRaceLink[] } {
  const todayStart = html.indexOf('id="reunions-jour"');
  const tomorrowStart = html.indexOf('id="reunions-demain"');
  const section =
    day === 'today'
      ? html.slice(Math.max(todayStart, 0), tomorrowStart > todayStart ? tomorrowStart : undefined)
      : tomorrowStart >= 0 ? html.slice(tomorrowStart) : '';

  const dateMatch = section.match(/pronostics\?d=(\d{2})-(\d{2})-(\d{4})/);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : null;

  const races: TurfPronosRaceLink[] = [];
  for (const match of section.matchAll(/<a href="course\?id=(\d+)"\s+title="pronostic (pick5|quinte)"\s*>([\s\S]*?)<\/a>/gi)) {
    races.push({ course_id: Number(match[1]), bet: match[2].toLowerCase() as TurfPronosBet, label: htmlText(match[3]) });
  }
  return { date, races };
}

function parseRunners(html: string): TurfPronosRunner[] {
  const table = tabPane(html, 'course').match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const [header, ...rows] = tableRows(table);
  const columns = header.map((cell) => normalize(htmlText(cell)));
  const column = (...names: string[]) => columns.findIndex((name) => names.some((wanted) => name.startsWith(wanted)));
  const index = {
    saddle: column('n°', 'no', 'num'),
    horse: column('nom cheval', 'cheval'),
    weight: column('poids'),
    draw: column('crd', 'corde'),
    sexAge: column('s/a'),
    jockey: column('jockey', 'driver'),
    trainer: column('entraineur'),
    music: column('dernieres perf', 'musique')
  };
  if (index.saddle < 0 || index.horse < 0) return [];

  const runners: TurfPronosRunner[] = [];
  for (const cells of rows) {
    const text = (position: number) => (position >= 0 && cells[position] !== undefined ? htmlText(cells[position]) : '');
    const number = (position: number) => {
      const value = Number(text(position).replace(',', '.'));
      return text(position) !== '' && Number.isFinite(value) && value > 0 ? value : undefined;
    };

    const saddle = number(index.saddle);
    const horse = text(index.horse);
    if (!saddle || !Number.isInteger(saddle) || !horse) continue;

    const sexAge = text(index.sexAge).match(/^([MFH])\s*(\d{1,2})$/i);
    const jockey = text(index.jockey);
    const trainer = text(index.trainer);
    const music = text(index.music);
    const draw = number(index.draw);
    runners.push({
      saddle_number: saddle,
      horse,
      ...(sexAge && { sex: sexAge[1].toUpperCase() as TurfPronosRunner['sex'], age: Number(sexAge[2]) }),
      ...(number(index.weight) !== undefined && { weight: number(index.weight) }),
      ...(draw !== undefined && Number.isInteger(draw) && { draw }),
      ...(jockey && jockey !== '-' && { jockey }),
      ...(trainer && trainer !== '-' && { trainer }),
      ...(music && music !== '-' && { music })
    });
  }
  return runners;
}

function parseTips(html: string): { tips: TurfPronosTip[]; consensus: number[] | null } {
  const table = tabPane(html, 'pronostics').match(/<table[\s\S]*?<\/table>/i)?.[0];
  const tips: TurfPronosTip[] = [];
  let consensus: number[] | null = null;
  for (const cells of table ? tableRows(table) : []) {
    if (cells.length < 2 || /<th/i.test(cells[0])) continue;
    const tipster = htmlText(cells[0]);
    const selection = parseSelection(htmlText(cells[1]));
    if (!tipster || selection.length === 0) continue;
    if (tipster.toUpperCase() === CONSENSUS_TIPSTER) consensus = selection;
    else tips.push({ tipster, selection });
  }
  return { tips, consensus };
}

function parseScores(html: string): TurfPronosCourse['scores'] {
  const raw = html.match(/var scoreRes\s*=\s*(\[[\s\S]*?\]\s*\])\s*;/)?.[1];
  if (!raw) return [];
  try {
    const pairs = JSON.parse(raw) as [number, string][];
    return pairs
      .map(([score, saddle]) => ({ saddle_number: Number(saddle), score: Number(score) }))
      .filter((item) => Number.isInteger(item.saddle_number) && item.saddle_number > 0 && Number.isFinite(item.score));
  } catch {
    return [];
  }
}

/** Parse a race page (course?id=N). Throws when the page is not a race page. */
export function parseCoursePage(html: string): TurfPronosCourse {
  // Page title, or the <h1> when there is none (e.g. markup copied from the browser's inspector)
  const title =
    htmlText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? '') || htmlText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  // "R4C9 - PRIX DE LA MALMONTAGNE - Vendredi 16 Octobre 2026 | TurfPronos"; the name may contain " - "
  const heading = title.match(/^R(\d+)\s*C(\d+)\s*-\s*(.*?)\s*-\s*\S+\s+(\d{1,2})\s+(\S+)\s+(\d{4})\b/i);
  const date = heading && parseFrenchDate(heading[4], heading[5], heading[6]);
  if (!heading || !date) throw new Error(`not a race page (title "${title}")`);
  const reunion = Number(heading[1]);

  // Racecourse from the meeting link: title="R4 - FONTAINEBLEAU - Vendredi 16 Octobre 2026"
  let racecourse = '';
  for (const match of html.matchAll(/<a href="reunion\?id=\d+"\s+title="([^"]*)"/gi)) {
    const meeting = htmlText(match[1]).match(/^R(\d+)\s*-\s*(.*?)\s*-\s*\S+\s+\d{1,2}\s+\S+\s+\d{4}$/);
    if (meeting && Number(meeting[1]) === reunion) racecourse = meeting[2];
  }

  const info = htmlText(html.match(/<div class="col-sm-9 pinfo">([\s\S]*?)<\/div>/i)?.[1] ?? '');
  const field = (label: string) => info.match(new RegExp(`${label}\\s*:\\s*(.*?)(?=\\s+[A-ZÉ][a-zé]+\\s*:|$)`))?.[1]?.trim() ?? null;
  const time = field('Heure')?.match(/^(\d{1,2})\s*h\s*(\d{2})/i);
  const toInt = (text: string | null) => (text && /\d/.test(text) ? Number(text.replace(/[^\d]/g, '')) : null);

  const { tips, consensus } = parseTips(html);
  return {
    date,
    reunion,
    race_number: Number(heading[2]),
    name: heading[3],
    racecourse,
    time: time ? `${time[1].padStart(2, '0')}:${time[2]}` : null,
    speciality: field('Spécialité'),
    distance: toInt(field('Distance')),
    prize_money: toInt(field('Allocation')),
    declared_runners: toInt(field('Partants')),
    runners: parseRunners(html),
    tips,
    consensus,
    scores: parseScores(html)
  };
}

const UNKNOWN = 'Inconnu';

/**
 * Convert a parsed race page to the neutral import format, as a scheduled race. Its external id is
 * the one Open PMU results use, so importing the results later completes the same race.
 */
export function toImportRace(course: TurfPronosCourse): ImportRace | string {
  const discipline = mapDiscipline(course.speciality);
  if (!discipline) return `unknown speciality "${course.speciality}"`;
  if (!course.time) return 'missing start time';
  if (!course.distance) return 'missing distance';
  if (course.runners.length === 0) return 'no runners';

  const runners: ImportRunner[] = course.runners.map((runner) => ({
    saddle_number: runner.saddle_number,
    horse: {
      name: runner.horse,
      ...(runner.age !== undefined && runner.age >= 2 && runner.age <= 20 && { age: runner.age }),
      ...(runner.sex && { sex: runner.sex })
    },
    jockey: { name: runner.jockey ?? UNKNOWN },
    trainer: { name: runner.trainer ?? UNKNOWN },
    ...(runner.weight !== undefined && runner.weight < 200 && { weight: runner.weight })
  }));

  return {
    external_id: pmuRaceExternalId(course.date, course.reunion, course.race_number),
    date: course.date,
    time: course.time,
    // The site does not give the country; Quinté+ and Pick 5 races are run in France
    racecourse: { name: course.racecourse || UNKNOWN, country: 'France' },
    race_number: course.race_number,
    ...(course.name && { name: course.name }),
    discipline,
    distance: course.distance,
    ...(course.prize_money !== null && { prize_money: course.prize_money }),
    status: 'scheduled',
    runners
  };
}
