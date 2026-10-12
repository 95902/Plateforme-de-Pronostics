import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { convertOpenPmuResponse, mapDiscipline } from './open-pmu.js';
import { validateImport } from '../format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Sample response documented in the Open PMU API README (Chantilly, 29/09/2026, R1/C1)
const sample = JSON.parse(readFileSync(join(__dirname, '../../../../test/fixtures/open-pmu-sample.json'), 'utf-8'));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** The sample race with a complete field: only the 5 detailed horses start */
function completeSample() {
  const response = clone(sample);
  response.message[0].partants = 5;
  return response;
}

test('discipline labels', () => {
  assert.equal(mapDiscipline('Plat'), 'Plat');
  assert.equal(mapDiscipline('Attelé'), 'Trot');
  assert.equal(mapDiscipline('MONTE'), 'Trot');
  assert.equal(mapDiscipline('Steeple-chase'), 'Obstacles');
  assert.equal(mapDiscipline('Haies'), 'Obstacles');
  assert.equal(mapDiscipline(null), null);
});

test('races with an incomplete field are skipped by default', () => {
  const { document, skipped } = convertOpenPmuResponse(sample);
  assert.equal(document.races.length, 0);
  assert.deepEqual(skipped, [{ race: '2026-09-29 R1/C1 Chantilly', reason: 'incomplete field: 5 of 16 starters detailed' }]);

  assert.equal(convertOpenPmuResponse(sample, { allowIncomplete: true }).document.races.length, 1);
});

test('converts a race to a valid import document', () => {
  const { document, skipped } = convertOpenPmuResponse(completeSample());
  assert.deepEqual(skipped, []);
  assert.deepEqual(validateImport(document).errors, []);

  const [race] = document.races;
  assert.equal(race.external_id, 'openpmu-2026-09-29-R1C1');
  assert.equal(race.date, '2026-09-29');
  assert.equal(race.time, '13:55');
  assert.equal(race.race_number, 1);
  assert.equal(race.discipline, 'Plat');
  assert.equal(race.distance, 1900);
  assert.equal(race.prize_money, 50900);
  assert.equal(race.racecourse.name, 'Chantilly');
  assert.equal(race.status, 'finished');

  const winner = race.runners.find((runner) => runner.saddle_number === 1)!;
  assert.deepEqual(winner, {
    saddle_number: 1,
    horse: { name: 'ANSSIO', age: 4, sex: 'H' },
    jockey: { name: 'LECOEUVRE C.' },
    trainer: { name: 'BELLANGER (S) N.' },
    weight: 60,
    morning_odds: 9.8,
    final_odds: 6.1,
    finish_position: 1
  });

  // Arrival 1-9-15-2-4
  const order = [...race.runners].sort((a, b) => a.finish_position! - b.finish_position!).map((runner) => runner.saddle_number);
  assert.deepEqual(order, [1, 9, 15, 2, 4]);
});

test('non-runners, unclassified horses and missing people', () => {
  const response = completeSample();
  const race = response.message[0];
  race.non_partants = [4];
  race.partants = 4;
  race.arrivee_details['15'].position = 0;
  race.arrivee_details['2'].nom_jockey = null;

  const { document } = convertOpenPmuResponse(response);
  const runners = new Map(document.races[0].runners.map((runner) => [runner.saddle_number, runner]));

  assert.equal(runners.get(4)!.non_runner, true);
  assert.equal(runners.get(4)!.finish_position, undefined);
  assert.equal(runners.get(15)!.finish_position, undefined);
  assert.equal(runners.get(2)!.jockey.name, 'Inconnu');
  assert.deepEqual(validateImport(document).errors, []);
});

test('other disciplines, dead heats and empty responses are skipped with a reason', () => {
  const trot = completeSample();
  trot.message[0].type = 'Attelé';
  assert.deepEqual(convertOpenPmuResponse(trot).skipped[0].reason, 'discipline Trot not selected');
  assert.equal(convertOpenPmuResponse(trot, { disciplines: ['Trot'] }).document.races.length, 1);

  const deadHeat = completeSample();
  deadHeat.message[0].arrivee_details['9'].position = 1;
  assert.match(convertOpenPmuResponse(deadHeat).skipped[0].reason, /dead heat/);

  assert.equal(convertOpenPmuResponse({ error: true, message: 'Aucune course trouvée' }).document.races.length, 0);
});
