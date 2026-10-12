/**
 * Adapter for Open PMU API (https://github.com/nanaelie/open-pmu-api), an unofficial, free API of
 * French race results. It converts its responses to the neutral import format.
 *
 * Limits of this source: finished races only (no upcoming programme), no PMU dividends, and the
 * rights on the data are not established — fine for private use, not for a public service
 * (see docs/sources-de-donnees.md).
 */
import type { ImportDocument, ImportRace, ImportRunner } from '../format.js';

export const OPEN_PMU_SOURCE = 'open-pmu-api';

interface OpenPmuHorse {
  nom_cheval: string | null;
  sexe: string | null;
  annee_de_naissance: number | null;
  nom_jockey: string | null;
  nom_entraineur: string | null;
  /** Hectograms: 600 = 60 kg */
  poids_cheval: number | null;
  /** Odds as they moved before the start, last = final */
  cotes: (number | null)[] | null;
  discipline: string | null;
  position: number | null;
}

interface OpenPmuRace {
  type: string | null;
  montant: number | null;
  distance: number | null;
  prix: string | null;
  lieu: string | null;
  heure_depart: string | null;
  partants: number | null;
  non_partants: number[] | null;
  'r/c': string | null;
  date: string | null;
  arrivee_details: Record<string, OpenPmuHorse>;
}

export interface ConvertOptions {
  /** Disciplines to keep (default: Plat only) */
  disciplines?: ImportRace['discipline'][];
  /** Keep races where some starters have no details (default: false, they would bias odds and models) */
  allowIncomplete?: boolean;
}

export interface ConvertResult {
  document: ImportDocument;
  /** Races left out, with the reason */
  skipped: { race: string; reason: string }[];
}

const UNKNOWN = 'Inconnu';

/** Discipline from the PMU labels (Plat, Attelé, Monté, Haies, Steeple-chase, Cross) */
export function mapDiscipline(label: string | null): ImportRace['discipline'] | null {
  const normalized = (label ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (normalized.includes('PLAT')) return 'Plat';
  if (normalized.includes('ATTELE') || normalized.includes('MONTE') || normalized.includes('TROT')) return 'Trot';
  if (normalized.includes('HAIE') || normalized.includes('STEEPLE') || normalized.includes('CROSS') || normalized.includes('OBSTACLE')) {
    return 'Obstacles';
  }
  return null;
}

const validOdds = (odds: (number | null)[] | null) => (odds ?? []).filter((value): value is number => typeof value === 'number' && value > 1);

function convertRunner(saddle: number, horse: OpenPmuHorse, raceYear: number, nonRunners: Set<number>): ImportRunner | null {
  if (!horse.nom_cheval) return null;

  const odds = validOdds(horse.cotes);
  const age = horse.annee_de_naissance ? raceYear - horse.annee_de_naissance : undefined;
  const weight = horse.poids_cheval ? (horse.poids_cheval > 200 ? horse.poids_cheval / 10 : horse.poids_cheval) : undefined;
  const sex = horse.sexe === 'M' || horse.sexe === 'F' || horse.sexe === 'H' ? horse.sexe : undefined;
  const nonRunner = nonRunners.has(saddle);

  return {
    saddle_number: saddle,
    horse: { name: horse.nom_cheval, ...(age !== undefined && age >= 2 && age <= 20 && { age }), ...(sex && { sex }) },
    jockey: { name: horse.nom_jockey || UNKNOWN },
    trainer: { name: horse.nom_entraineur || UNKNOWN },
    ...(weight !== undefined && weight > 0 && weight < 200 && { weight }),
    ...(odds.length > 0 && { morning_odds: odds[0], final_odds: odds[odds.length - 1] }),
    ...(nonRunner && { non_runner: true }),
    // Position 0 or none: not classified
    ...(!nonRunner && horse.position && horse.position > 0 && { finish_position: horse.position })
  };
}

function convertRace(race: OpenPmuRace, options: Required<ConvertOptions>): ImportRace | string {
  const raceCourse = race['r/c'] ?? '';
  const match = raceCourse.match(/^R(\d+)\s*\/\s*C(\d+)$/i);
  if (!race.date || !match) return 'missing date or R/C number';

  const discipline = mapDiscipline(race.type) ?? mapDiscipline(Object.values(race.arrivee_details)[0]?.discipline ?? null);
  if (!discipline) return `unknown discipline "${race.type}"`;
  if (!options.disciplines.includes(discipline)) return `discipline ${discipline} not selected`;

  const nonRunners = new Set(race.non_partants ?? []);
  const raceYear = Number(race.date.slice(0, 4));
  const runners = Object.entries(race.arrivee_details)
    .map(([saddle, horse]) => convertRunner(Number(saddle), horse, raceYear, nonRunners))
    .filter((runner): runner is ImportRunner => runner !== null);

  const starters = runners.filter((runner) => !runner.non_runner).length;
  if (!options.allowIncomplete && race.partants !== null && starters < race.partants) {
    return `incomplete field: ${starters} of ${race.partants} starters detailed`;
  }

  const positions = runners.flatMap((runner) => (runner.finish_position ? [runner.finish_position] : []));
  if (!positions.includes(1)) return 'no winner in the results';
  if (new Set(positions).size !== positions.length) return 'dead heat (shared position), not supported yet';

  return {
    external_id: `openpmu-${race.date}-R${match[1]}C${match[2]}`,
    date: race.date,
    time: (race.heure_depart ?? '00:00').slice(0, 5),
    racecourse: { name: race.lieu || UNKNOWN, country: 'France' },
    race_number: Number(match[2]),
    ...(race.prix && { name: race.prix }),
    discipline,
    distance: race.distance ?? 0,
    ...(race.montant !== null && race.montant >= 0 && { prize_money: race.montant }),
    status: 'finished',
    runners
  };
}

/** Convert one Open PMU API response (GET /api/arrivees) to the neutral import format */
export function convertOpenPmuResponse(response: unknown, options: ConvertOptions = {}): ConvertResult {
  const settings: Required<ConvertOptions> = { disciplines: ['Plat'], allowIncomplete: false, ...options };
  const races = (response as { message?: unknown })?.message;
  if (!Array.isArray(races)) {
    return { document: { source: OPEN_PMU_SOURCE, races: [] }, skipped: [{ race: '-', reason: `no races in response (${String(races)})` }] };
  }

  const converted: ImportRace[] = [];
  const skipped: ConvertResult['skipped'] = [];
  for (const race of races as OpenPmuRace[]) {
    const label = `${race.date ?? '?'} ${race['r/c'] ?? '?'} ${race.lieu ?? ''}`.trim();
    const result = convertRace(race, settings);
    if (typeof result === 'string') skipped.push({ race: label, reason: result });
    else converted.push(result);
  }

  return { document: { source: OPEN_PMU_SOURCE, races: converted }, skipped };
}
