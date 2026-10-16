import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import importService from '../src/services/import/import.service.js';
import tipsService from '../src/services/tips.service.js';
import { CONSENSUS_TIPSTER, TURFPRONOS_SOURCE, parseCoursePage, toImportRace } from '../src/services/import/adapters/turfpronos.js';
import type { ImportRace } from '../src/services/import/format.js';
import { client, pool, query, resetDatabase, startServer } from './helpers.js';
import type { TestServer } from './helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const course = parseCoursePage(readFileSync(join(__dirname, 'fixtures/turfpronos-course.html'), 'utf-8'));
const race = toImportRace(course) as ImportRace;
const tips = [...course.tips, { tipster: CONSENSUS_TIPSTER, selection: course.consensus!, is_consensus: true }];

let server: TestServer;

before(async () => {
  await resetDatabase();
  server = await startServer();
});

after(async () => {
  await server.close();
  await pool.end();
});

test('tips need the race to be imported first', async () => {
  assert.equal(await tipsService.replaceTips(race.external_id, TURFPRONOS_SOURCE, tips), false);
});

test('a turfpronos race page is imported with its press tips and synthesis', async () => {
  const summary = await importService.importDocument({ source: TURFPRONOS_SOURCE, races: [race] });
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.created, 1);
  assert.equal(await tipsService.replaceTips(race.external_id, TURFPRONOS_SOURCE, tips), true);

  const [{ id }] = await query(`SELECT id FROM races WHERE external_id = 'openpmu-2026-10-16-R4C9'`);
  const { status, body } = await client(server.url).get(`/races/${id}`);
  assert.equal(status, 200);
  assert.equal(body.status, 'scheduled');
  assert.equal(body.hippodrome_name, 'FONTAINEBLEAU');
  assert.equal(body.runners.length, 15);
  assert.deepEqual(
    body.tips.map((tip: any) => [tip.tipster, tip.is_consensus]),
    [['CanalTurf.com', false], ['Equidia', false], ['TurfPronos.fr', false], ['ZEturf.com', false], ['SYNTHESE', true]]
  );
  assert.deepEqual(body.tips[4].selection, [14, 1, 12, 11, 8, 2, 5, 10]);
});

test('fetching again replaces the tips of that source', async () => {
  const updated = [{ tipster: 'Equidia', selection: [8, 14, 1] }, { tipster: CONSENSUS_TIPSTER, selection: [14, 8, 1], is_consensus: true }];
  assert.equal(await tipsService.replaceTips(race.external_id, TURFPRONOS_SOURCE, updated), true);

  const rows = await query(`SELECT tipster, selection FROM race_tips ORDER BY is_consensus, tipster`);
  assert.deepEqual(rows, [
    { tipster: 'Equidia', selection: [8, 14, 1] },
    { tipster: 'SYNTHESE', selection: [14, 8, 1] }
  ]);
});

test('the Open PMU results complete the same race', async () => {
  const finished: ImportRace = {
    ...race,
    status: 'finished',
    runners: race.runners.map((runner) => ({ ...runner, finish_position: runner.saddle_number === 14 ? 1 : runner.saddle_number === 1 ? 2 : undefined }))
  };
  const summary = await importService.importDocument({ source: 'open-pmu-api', races: [finished] });
  assert.deepEqual(summary.errors, []);
  assert.equal(summary.updated, 1);
  assert.equal(summary.results_recorded, 1);

  const races = await query(`SELECT status FROM races`);
  assert.deepEqual(races, [{ status: 'finished' }]);
  assert.equal((await query('SELECT COUNT(*)::int AS count FROM race_tips'))[0].count, 2);
});
