import { readFileSync } from 'fs';
import pool from '../config/database.js';
import importService from '../services/import/import.service.js';
import { validateImport } from '../services/import/format.js';

/**
 * Import race data files in the neutral JSON format (docs/format-import.md).
 *   npm run import -- day1.json day2.json [--dry-run]
 * Exits with code 1 when any race was rejected or conflicted.
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const files = args.filter((arg) => arg !== '--dry-run');

  if (files.length === 0) {
    console.error('Usage: npm run import -- <file.json> [more files] [--dry-run]');
    process.exit(1);
  }

  let failed = false;
  for (const file of files) {
    let document: unknown;
    try {
      document = JSON.parse(readFileSync(file, 'utf-8'));
    } catch (error) {
      console.error(`❌ ${file}: cannot read JSON (${(error as Error).message})`);
      failed = true;
      continue;
    }

    if (dryRun) {
      const { races, errors } = validateImport(document);
      console.log(`🔎 ${file}: ${races.length} valid race(s), ${errors.length} error(s)`);
      errors.forEach((error) => console.log(`   ✖ ${error}`));
      failed ||= errors.length > 0;
      continue;
    }

    const summary = await importService.importDocument(document);
    console.log(
      `📥 ${file}: ${summary.races_received} race(s) received — ${summary.created} created, ${summary.updated} updated, ` +
        `${summary.results_recorded} result(s) recorded, ${summary.cancelled} cancelled`
    );
    summary.errors.forEach((error) => console.log(`   ✖ ${error}`));
    failed ||= summary.errors.length > 0;
  }

  await pool.end();
  process.exit(failed ? 1 : 0);
}

main();
