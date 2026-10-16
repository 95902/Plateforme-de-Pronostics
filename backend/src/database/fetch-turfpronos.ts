import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import pool from '../config/database.js';
import importService from '../services/import/import.service.js';
import tipsService from '../services/tips.service.js';
import {
  CONSENSUS_TIPSTER,
  TURFPRONOS_BETS,
  TURFPRONOS_SOURCE,
  TURFPRONOS_URL,
  parseCoursePage,
  parseHomePage,
  toImportRace
} from '../services/import/adapters/turfpronos.js';
import type { TurfPronosBet } from '../services/import/adapters/turfpronos.js';

/**
 * Fetch the day's Pick 5 races from www.turfpronos.fr: import each race (field, as scheduled) and
 * save the press tips with their synthesis.
 *
 *   npm run fetch:turfpronos
 *     [--day today|tomorrow]     (default today)
 *     [--bet pick5|quinte|all]   (default pick5, repeatable)
 *     [--save <dir>]             also write each parsed page (JSON)
 *     [--dry-run]                fetch and parse only, nothing saved
 *     [--delay-ms 1500]          pause between requests
 *
 * Private use only: scraping a third-party site (docs/sources-de-donnees.md).
 */
const BASE_URL = process.env.TURFPRONOS_URL || TURFPRONOS_URL;
const USER_AGENT = 'Mozilla/5.0 (compatible; plateforme-de-pronostics; usage prive)';

function parseArgs(argv: string[]) {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const bets = argv.flatMap((arg, index) => (arg === '--bet' && argv[index + 1] ? [argv[index + 1]] : []));
  return {
    day: value('--day') ?? 'today',
    bets: bets.includes('all') ? [...TURFPRONOS_BETS] : bets.length > 0 ? bets : ['pick5'],
    saveDir: value('--save'),
    dryRun: argv.includes('--dry-run'),
    delayMs: Number(value('--delay-ms') ?? 1500)
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(path: string): Promise<string> {
  const reply = await fetch(new URL(path, BASE_URL), {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'fr-FR,fr' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!reply.ok) throw new Error(`HTTP ${reply.status}`);
  return reply.text();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const invalidBets = args.bets.filter((bet) => !(TURFPRONOS_BETS as readonly string[]).includes(bet));
  if ((args.day !== 'today' && args.day !== 'tomorrow') || invalidBets.length > 0 || !Number.isFinite(args.delayMs)) {
    console.error('Usage: npm run fetch:turfpronos -- [--day today|tomorrow] [--bet pick5|quinte|all] [--save dir] [--dry-run] [--delay-ms 1500]');
    process.exit(1);
  }
  if (args.saveDir) mkdirSync(args.saveDir, { recursive: true });

  let home: ReturnType<typeof parseHomePage>;
  try {
    home = parseHomePage(await fetchPage('./'), args.day as 'today' | 'tomorrow');
  } catch (error) {
    console.error(`❌ Home page: request failed (${(error as Error).message})`);
    await pool.end();
    process.exit(1);
  }
  const links = home.races.filter((race) => args.bets.includes(race.bet as TurfPronosBet));
  console.log(`📅 ${home.date ?? args.day}: ${links.length} race(s) (${args.bets.join(', ')})`);

  const totals = { races: 0, failed: 0, created: 0, updated: 0, tips: 0 };
  for (const link of links) {
    await sleep(args.delayMs);
    const label = `${link.bet} ${link.label}`;
    try {
      const course = parseCoursePage(await fetchPage(`course?id=${link.course_id}`));
      if (args.saveDir) {
        writeFileSync(join(args.saveDir, `turfpronos-${course.date}-R${course.reunion}C${course.race_number}.json`), JSON.stringify(course, null, 2));
      }
      const synthesis = course.consensus ? course.consensus.join(' - ') : 'pas encore de synthèse';
      console.log(`🏇 ${label} (${course.racecourse}, ${course.time ?? '?'}): ${course.runners.length} partants, ${course.tips.length} pronostic(s) — synthèse ${synthesis}`);

      const race = toImportRace(course);
      if (typeof race === 'string') throw new Error(`cannot import the race: ${race}`);
      totals.races++;
      if (args.dryRun) continue;

      const summary = await importService.importDocument({ source: TURFPRONOS_SOURCE, races: [race] });
      if (summary.errors.length > 0) throw new Error(summary.errors.join('; '));
      totals.created += summary.created;
      totals.updated += summary.updated;

      const tips = [
        ...course.tips,
        ...(course.consensus ? [{ tipster: CONSENSUS_TIPSTER, selection: course.consensus, is_consensus: true }] : [])
      ];
      if (tips.length > 0 && (await tipsService.replaceTips(race.external_id, TURFPRONOS_SOURCE, tips))) totals.tips += tips.length;
    } catch (error) {
      totals.failed++;
      console.error(`   ✖ ${label}: ${(error as Error).message}`);
    }
  }

  console.log(
    `\n✅ ${totals.races} race(s) read` +
      (args.dryRun ? ' (dry run, nothing saved)' : `, ${totals.created} created, ${totals.updated} updated, ${totals.tips} tip(s) saved`) +
      (totals.failed > 0 ? `, ${totals.failed} failed` : '')
  );
  await pool.end();
  process.exit(totals.failed > 0 ? 1 : 0);
}

main();
