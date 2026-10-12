import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database.js';
import importService from '../services/import/import.service.js';
import { convertOpenPmuResponse } from '../services/import/adapters/open-pmu.js';
import { DISCIPLINES } from '../services/import/format.js';
import type { ImportRace } from '../services/import/format.js';

/**
 * Fetch race results from Open PMU API day by day, convert them to the neutral format and import them.
 *
 *   npm run fetch:open-pmu -- --from 2025-01-01 --to 2025-03-31
 *     [--discipline Plat|Trot|Obstacles|all] (default Plat, repeatable)
 *     [--allow-incomplete]   keep races where some starters have no details
 *     [--save <dir>]         also write the converted files (one per day)
 *     [--dry-run]            fetch and convert only, no import
 *     [--delay-ms 1500]      pause between requests, to stay polite with the free API
 *
 * Private use only: the rights on this data are not established (docs/sources-de-donnees.md).
 */
const API_URL = process.env.OPEN_PMU_API_URL || 'https://open-pmu-api.vercel.app/api/arrivees';
const MAX_DAYS = 366;

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const values = (name: string) => argv.flatMap((arg, index) => (arg === name && argv[index + 1] ? [argv[index + 1]] : []));

  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
  const disciplines = values('--discipline');
  return {
    from: value('--from') ?? yesterday,
    to: value('--to') ?? value('--from') ?? yesterday,
    disciplines: (disciplines.includes('all') ? [...DISCIPLINES] : disciplines.length > 0 ? disciplines : ['Plat']) as ImportRace['discipline'][],
    allowIncomplete: argv.includes('--allow-incomplete'),
    saveDir: value('--save'),
    dryRun: argv.includes('--dry-run'),
    delayMs: Number(value('--delay-ms') ?? 1500)
  };
}

function* days(from: string, to: string) {
  for (let day = new Date(`${from}T00:00:00Z`); day <= new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    yield day.toISOString().slice(0, 10);
  }
}

/** Open PMU API expects MM/DD/YYYY */
const toApiDate = (isoDate: string) => `${isoDate.slice(5, 7)}/${isoDate.slice(8, 10)}/${isoDate.slice(0, 4)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const invalid = args.disciplines.filter((discipline) => !(DISCIPLINES as readonly string[]).includes(discipline));
  if (invalid.length > 0 || !/^\d{4}-\d{2}-\d{2}$/.test(args.from) || !/^\d{4}-\d{2}-\d{2}$/.test(args.to) || args.from > args.to) {
    console.error('Usage: npm run fetch:open-pmu -- --from YYYY-MM-DD --to YYYY-MM-DD [--discipline Plat|Trot|Obstacles|all] [--allow-incomplete] [--save dir] [--dry-run]');
    process.exit(1);
  }
  const dates = [...days(args.from, args.to)];
  if (dates.length > MAX_DAYS) {
    console.error(`At most ${MAX_DAYS} days per run, to stay polite with the free API (asked: ${dates.length})`);
    process.exit(1);
  }
  if (args.saveDir) mkdirSync(args.saveDir, { recursive: true });

  const totals = { days: 0, failedDays: 0, converted: 0, skipped: 0, created: 0, updated: 0, errors: 0 };

  for (const [index, date] of dates.entries()) {
    if (index > 0) await sleep(args.delayMs);
    totals.days++;

    let response: unknown;
    try {
      const reply = await fetch(`${API_URL}?date=${encodeURIComponent(toApiDate(date))}`, { signal: AbortSignal.timeout(30_000) });
      response = await reply.json();
      if (!reply.ok && reply.status !== 404) throw new Error(`HTTP ${reply.status}`);
    } catch (error) {
      console.error(`❌ ${date}: request failed (${(error as Error).message})`);
      totals.failedDays++;
      continue;
    }

    const { document, skipped } = convertOpenPmuResponse(response, { disciplines: args.disciplines, allowIncomplete: args.allowIncomplete });
    totals.converted += document.races.length;
    totals.skipped += skipped.length;
    const notSelected = skipped.filter((item) => item.reason.includes('not selected')).length;
    const otherSkips = skipped.filter((item) => !item.reason.includes('not selected'));

    if (args.saveDir && document.races.length > 0) {
      writeFileSync(join(args.saveDir, `open-pmu-${date}.json`), JSON.stringify(document, null, 2));
    }

    let line = `${date}: ${document.races.length} race(s) converted, ${notSelected} of other disciplines, ${otherSkips.length} skipped`;
    if (!args.dryRun && document.races.length > 0) {
      const summary = await importService.importDocument(document);
      totals.created += summary.created;
      totals.updated += summary.updated;
      totals.errors += summary.errors.length;
      line += ` — imported: ${summary.created} created, ${summary.updated} updated`;
      summary.errors.forEach((error) => console.log(`   ✖ ${error}`));
    }
    console.log(`📅 ${line}`);
    otherSkips.forEach((item) => console.log(`   ⏭  ${item.race}: ${item.reason}`));
  }

  console.log(
    `\n✅ ${totals.days} day(s): ${totals.converted} race(s) converted, ${totals.skipped} skipped` +
      (args.dryRun ? ' (dry run, nothing imported)' : `, ${totals.created} created, ${totals.updated} updated, ${totals.errors} error(s)`) +
      (totals.failedDays > 0 ? `, ${totals.failedDays} day(s) failed` : '')
  );

  await pool.end();
  process.exit(totals.failedDays > 0 || totals.errors > 0 ? 1 : 0);
}

main();
