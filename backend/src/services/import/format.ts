/**
 * Source-agnostic import format (JSON). Any data source plugs in by converting its data to this
 * shape; see docs/format-import.md for the documentation and an example.
 */
import { PLACES_BY_BET_TYPE } from '../payout.js';
import type { BetType } from '../payout.js';

export const DISCIPLINES = ['Plat', 'Trot', 'Obstacles'] as const;
export const SURFACES = ['Gazon', 'Sable', 'Synthétique'] as const;
export const TRACK_CONDITIONS = ['Bon', 'Souple', 'Lourd'] as const;
export const IMPORT_STATUSES = ['scheduled', 'finished', 'cancelled'] as const;

export interface ImportRunner {
  saddle_number: number;
  horse: { name: string; age?: number; sex?: 'M' | 'F' | 'H' };
  /** Jockey, or driver in trotting races */
  jockey: { name: string };
  trainer: { name: string };
  weight?: number;
  morning_odds?: number;
  final_odds?: number;
  non_runner?: boolean;
  /** Finishing position, for finished races (omit for horses that did not finish) */
  finish_position?: number;
  disqualified?: boolean;
  finish_time?: string;
}

export interface ImportDividend {
  bet_type: BetType;
  /** Saddle numbers of the winning combination */
  combination: number[];
  /** Amount paid per 1€ staked */
  payout_per_euro: number;
}

export interface ImportRace {
  /** Stable identifier in the source, e.g. "2026-10-12-R1C3": re-importing it updates the race */
  external_id: string;
  date: string;
  time: string;
  racecourse: { name: string; city?: string; country: string; surface?: (typeof SURFACES)[number] };
  race_number: number;
  name?: string;
  discipline: (typeof DISCIPLINES)[number];
  distance: number;
  prize_money?: number;
  track_condition?: (typeof TRACK_CONDITIONS)[number];
  status: (typeof IMPORT_STATUSES)[number];
  runners: ImportRunner[];
  dividends?: ImportDividend[];
}

export interface ImportDocument {
  source?: string;
  races: ImportRace[];
}

export interface ValidationResult {
  /** Races that passed validation */
  races: ImportRace[];
  /** One message per problem, prefixed with its path, e.g. "races[2].runners[0].final_odds: ..." */
  errors: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInt = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isText = (value: unknown, max = 255) => typeof value === 'string' && value.trim() !== '' && value.length <= max;
const isOdds = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 10000;
const isDate = (value: unknown) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const isTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
const oneOf = <T extends readonly string[]>(values: T, value: unknown): value is T[number] =>
  typeof value === 'string' && (values as readonly string[]).includes(value);

function validateRunner(runner: unknown, path: string, errors: string[]) {
  if (!isObject(runner)) {
    errors.push(`${path}: must be an object`);
    return;
  }
  if (!isInt(runner.saddle_number, 1, 99)) errors.push(`${path}.saddle_number: integer between 1 and 99 required`);
  if (!isObject(runner.horse) || !isText(runner.horse.name)) errors.push(`${path}.horse.name: required`);
  else {
    if (runner.horse.age !== undefined && !isInt(runner.horse.age, 2, 20)) errors.push(`${path}.horse.age: integer between 2 and 20`);
    if (runner.horse.sex !== undefined && !oneOf(['M', 'F', 'H'] as const, runner.horse.sex)) errors.push(`${path}.horse.sex: M, F or H`);
  }
  for (const person of ['jockey', 'trainer'] as const) {
    const value = runner[person];
    if (!isObject(value) || !isText(value.name)) errors.push(`${path}.${person}.name: required`);
  }
  if (runner.weight !== undefined && !(typeof runner.weight === 'number' && runner.weight > 0 && runner.weight < 200)) {
    errors.push(`${path}.weight: number of kilograms`);
  }
  for (const field of ['morning_odds', 'final_odds'] as const) {
    if (runner[field] !== undefined && !isOdds(runner[field])) errors.push(`${path}.${field}: decimal odds greater than 1`);
  }
  if (runner.non_runner !== undefined && typeof runner.non_runner !== 'boolean') errors.push(`${path}.non_runner: boolean`);
  if (runner.disqualified !== undefined && typeof runner.disqualified !== 'boolean') errors.push(`${path}.disqualified: boolean`);
  if (runner.finish_position !== undefined && !isInt(runner.finish_position, 1, 99)) errors.push(`${path}.finish_position: integer ≥ 1`);
  if (runner.finish_time !== undefined && !isText(runner.finish_time, 20)) errors.push(`${path}.finish_time: text (20 characters max)`);
  if (runner.non_runner === true && runner.finish_position !== undefined) errors.push(`${path}: a non-runner cannot have a finishing position`);
}

function validateRace(race: unknown, path: string): string[] {
  const errors: string[] = [];
  if (!isObject(race)) return [`${path}: must be an object`];

  if (!isText(race.external_id, 100)) errors.push(`${path}.external_id: required (100 characters max)`);
  if (!isDate(race.date)) errors.push(`${path}.date: YYYY-MM-DD`);
  if (!isTime(race.time)) errors.push(`${path}.time: HH:MM (local time at the racecourse)`);
  if (!isObject(race.racecourse) || !isText(race.racecourse.name) || !isText(race.racecourse.country, 100)) {
    errors.push(`${path}.racecourse: name and country required`);
  } else if (race.racecourse.surface !== undefined && !oneOf(SURFACES, race.racecourse.surface)) {
    errors.push(`${path}.racecourse.surface: one of ${SURFACES.join(', ')}`);
  }
  if (!isInt(race.race_number, 1, 99)) errors.push(`${path}.race_number: integer between 1 and 99`);
  if (race.name !== undefined && !isText(race.name)) errors.push(`${path}.name: text`);
  if (!oneOf(DISCIPLINES, race.discipline)) errors.push(`${path}.discipline: one of ${DISCIPLINES.join(', ')}`);
  if (!isInt(race.distance, 100, 10000)) errors.push(`${path}.distance: meters between 100 and 10000`);
  if (race.prize_money !== undefined && !(typeof race.prize_money === 'number' && race.prize_money >= 0)) {
    errors.push(`${path}.prize_money: number ≥ 0`);
  }
  if (race.track_condition !== undefined && !oneOf(TRACK_CONDITIONS, race.track_condition)) {
    errors.push(`${path}.track_condition: one of ${TRACK_CONDITIONS.join(', ')}`);
  }
  if (!oneOf(IMPORT_STATUSES, race.status)) errors.push(`${path}.status: one of ${IMPORT_STATUSES.join(', ')}`);

  if (!Array.isArray(race.runners) || race.runners.length === 0) {
    errors.push(`${path}.runners: at least one runner required`);
    return errors;
  }
  race.runners.forEach((runner, index) => validateRunner(runner, `${path}.runners[${index}]`, errors));
  if (errors.length > 0) return errors;

  const runners = race.runners as ImportRunner[];
  const saddles = runners.map((runner) => runner.saddle_number);
  if (new Set(saddles).size !== saddles.length) errors.push(`${path}.runners: saddle numbers must be unique`);

  const positions = runners.filter((runner) => runner.finish_position !== undefined).map((runner) => runner.finish_position!);
  if (new Set(positions).size !== positions.length) errors.push(`${path}.runners: finishing positions must be unique`);
  if (race.status === 'finished' && !positions.includes(1)) errors.push(`${path}: a finished race needs the runner in position 1`);
  if (race.status !== 'finished' && positions.length > 0) errors.push(`${path}: finishing positions are only allowed when status is "finished"`);

  if (race.dividends !== undefined) {
    if (!Array.isArray(race.dividends)) {
      errors.push(`${path}.dividends: array`);
    } else {
      race.dividends.forEach((dividend, index) => {
        const dividendPath = `${path}.dividends[${index}]`;
        if (!isObject(dividend) || !oneOf(Object.keys(PLACES_BY_BET_TYPE) as BetType[], dividend.bet_type)) {
          errors.push(`${dividendPath}.bet_type: one of ${Object.keys(PLACES_BY_BET_TYPE).join(', ')}`);
          return;
        }
        const combination = dividend.combination;
        if (
          !Array.isArray(combination) ||
          combination.length !== PLACES_BY_BET_TYPE[dividend.bet_type as BetType] ||
          combination.some((saddle) => !saddles.includes(saddle as number)) ||
          new Set(combination).size !== combination.length
        ) {
          errors.push(`${dividendPath}.combination: ${PLACES_BY_BET_TYPE[dividend.bet_type as BetType]} distinct saddle numbers of this race`);
        }
        if (!(typeof dividend.payout_per_euro === 'number' && dividend.payout_per_euro > 0)) {
          errors.push(`${dividendPath}.payout_per_euro: number > 0`);
        }
      });
    }
  }

  return errors;
}

/**
 * Validate an import document. Invalid races are reported and left out; valid ones are kept,
 * so one bad race does not block a whole day.
 */
export function validateImport(document: unknown): ValidationResult {
  if (!isObject(document) || !Array.isArray(document.races)) {
    return { races: [], errors: ['document: an object with a "races" array is required'] };
  }

  const races: ImportRace[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  document.races.forEach((race, index) => {
    const raceErrors = validateRace(race, `races[${index}]`);
    if (raceErrors.length === 0 && seenIds.has((race as ImportRace).external_id)) {
      raceErrors.push(`races[${index}].external_id: duplicated in this document`);
    }
    if (raceErrors.length > 0) {
      errors.push(...raceErrors);
      return;
    }
    seenIds.add((race as ImportRace).external_id);
    races.push(race as ImportRace);
  });

  return { races, errors };
}
