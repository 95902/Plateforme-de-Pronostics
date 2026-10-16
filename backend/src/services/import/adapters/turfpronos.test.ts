import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { htmlText, parseCoursePage, parseHomePage, toImportRace } from './turfpronos.js';
import { validateImport } from '../format.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Real pages of www.turfpronos.fr (16/10/2026), trimmed
const fixture = (name: string) => readFileSync(join(__dirname, '../../../../test/fixtures', name), 'utf-8');
const home = fixture('turfpronos-home.html');
const course = fixture('turfpronos-course.html');

test("home page: the day's Pick 5 and Quinté+ races", () => {
  assert.deepEqual(parseHomePage(home), {
    date: '2026-10-16',
    races: [
      { course_id: 177985, bet: 'quinte', label: 'R1C4 - PRIX THEMIS' },
      { course_id: 178011, bet: 'pick5', label: 'R4C9 - PRIX DE LA MALMONTAGNE' },
      { course_id: 177984, bet: 'pick5', label: 'R1C3 - PRIX SATURNE' }
    ]
  });
});

test("home page: tomorrow's races are kept apart", () => {
  const tomorrow = parseHomePage(home, 'tomorrow');
  assert.equal(tomorrow.date, '2026-10-17');
  assert.deepEqual(tomorrow.races.map((race) => race.course_id), [178022, 178023, 178026]);
  assert.equal(tomorrow.races[0].label, "R1C3 - PRIX PRINCE D'ECOUEN - GRAND HANDICAP D'AUTOMNE");
});

test('race page: race details, field, press tips and synthesis', () => {
  const parsed = parseCoursePage(course);

  assert.equal(parsed.date, '2026-10-16');
  assert.equal(parsed.reunion, 4);
  assert.equal(parsed.race_number, 9);
  assert.equal(parsed.name, 'PRIX DE LA MALMONTAGNE');
  assert.equal(parsed.racecourse, 'FONTAINEBLEAU');
  assert.equal(parsed.time, '17:48');
  assert.equal(parsed.speciality, 'PLAT');
  assert.equal(parsed.distance, 1200);
  assert.equal(parsed.prize_money, 21100);
  assert.equal(parsed.declared_runners, 15);

  assert.equal(parsed.runners.length, 15);
  assert.deepEqual(parsed.runners[1], {
    saddle_number: 2, horse: 'FUCHSIA', sex: 'F', age: 9, weight: 59.5, draw: 12,
    jockey: 'F.VALLE SKAR', trainer: 'A.SCHEPENS', music: '4p2p0p3p1p2p1p7p7p'
  });
  assert.equal(parsed.runners[3].trainer, 'M.BOUTIN (S)');

  assert.deepEqual(parsed.tips.map((tip) => tip.tipster), ['CanalTurf.com', 'Equidia', 'TurfPronos.fr', 'ZEturf.com']);
  assert.deepEqual(parsed.tips[0].selection, [1, 14, 11, 12, 13, 5, 2]);
  assert.deepEqual(parsed.consensus, [14, 1, 12, 11, 8, 2, 5, 10]);
  assert.deepEqual(parsed.scores.slice(0, 2), [{ saddle_number: 14, score: 3.9 }, { saddle_number: 1, score: 2.7 }]);
});

test('race page: tips not published yet', () => {
  const withoutTips = course.replace(/<tbody><tr><td>CanalTurf[\s\S]*?<\/tbody>/, '<tbody></tbody>').replace(/var scoreRes[^\n]*\n/, '');
  const parsed = parseCoursePage(withoutTips);
  assert.deepEqual(parsed.tips, []);
  assert.equal(parsed.consensus, null);
  assert.deepEqual(parsed.scores, []);
  assert.equal(parsed.runners.length, 15);
});

test('a page that is not a race page is rejected', () => {
  assert.throws(() => parseCoursePage(home), /not a race page/);
});

test('conversion: a valid scheduled race sharing its id with Open PMU results', () => {
  const race = toImportRace(parseCoursePage(course));
  assert.notEqual(typeof race, 'string');
  const { races, errors } = validateImport({ races: [race] });
  assert.deepEqual(errors, []);

  const [converted] = races;
  assert.equal(converted.external_id, 'openpmu-2026-10-16-R4C9');
  assert.equal(converted.status, 'scheduled');
  assert.equal(converted.discipline, 'Plat');
  assert.deepEqual(converted.racecourse, { name: 'FONTAINEBLEAU', country: 'France' });
  assert.deepEqual(converted.runners[0], {
    saddle_number: 1, horse: { name: 'BACCHILIDE', age: 7, sex: 'H' },
    jockey: { name: 'M.GRANDIN' }, trainer: { name: 'M.GUARNIERI' }, weight: 60
  });
});

test('conversion: races that cannot be imported are explained', () => {
  const parsed = parseCoursePage(course);
  assert.equal(toImportRace({ ...parsed, speciality: 'INCONNUE' }), 'unknown speciality "INCONNUE"');
  assert.equal(toImportRace({ ...parsed, runners: [] }), 'no runners');
});

test('html text: tags removed and entities decoded', () => {
  assert.equal(htmlText('<span class="x">PRIX D&#039;ECOUEN</span>&nbsp;&amp; co'), "PRIX D'ECOUEN & co");
});
