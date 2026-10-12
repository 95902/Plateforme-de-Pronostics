import pool from '../config/database.js';
import { evaluateModel } from '../services/evaluation.service.js';
import type { ProbabilityMetrics } from '../services/evaluation.js';

/**
 * Compare the prediction model with the market (odds) on finished races.
 *   npm run evaluate -- --from 2025-01-01 --to 2025-12-31
 */
function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function printCalibration(name: string, metrics: ProbabilityMetrics) {
  console.log(`\n  Calibration (${name}): predicted → actual win rate`);
  for (const band of metrics.calibration) {
    if (band.runners === 0) continue;
    console.log(
      `    ${percent(band.from).padStart(6)}–${percent(band.to).padEnd(6)} ${String(band.runners).padStart(6)} runners: ` +
        `${percent(band.predicted).padStart(6)} → ${percent(band.actual).padStart(6)}`
    );
  }
}

async function main() {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const from = arg('--from') ?? oneYearAgo;
  const to = arg('--to') ?? new Date().toISOString().slice(0, 10);

  const report = await evaluateModel(from, to);
  console.log(`📊 ${from} → ${to}: ${report.races} races, ${report.runners} runners (${report.skipped_races} skipped)\n`);

  if (report.races === 0) {
    console.log('No finished race with odds and a winner in this period.');
  } else {
    console.log('                 log-loss   Brier   top pick wins');
    for (const [name, metrics] of [['Model', report.model], ['Market (odds)', report.market], [`Blend ${report.blend.model_weight}`, report.blend]] as const) {
      console.log(`  ${name.padEnd(14)} ${metrics.log_loss.toFixed(4).padStart(8)}  ${metrics.brier.toFixed(4).padStart(6)}   ${percent(metrics.top_pick_win_rate).padStart(6)}`);
    }
    console.log(`\n  Best (lowest log-loss): ${report.best}`);
    console.log(
      report.model.log_loss < report.market.log_loss
        ? '  ✅ The model predicts winners better than the odds.'
        : '  ⚠️  The model does not beat the odds: its value bets have no real edge.'
    );
    printCalibration('model', report.model);
    printCalibration('market', report.market);

    const { value_bets: value, favorites } = report.betting;
    console.log(`\n  1€ on each value bet (edge ≥ ${percent(value.min_edge)}): ${value.bets} bets, ${value.wins} wins, ROI ${percent(value.roi)}`);
    console.log(`  1€ on each favorite:                   ${favorites.bets} bets, ${favorites.wins} wins, ROI ${percent(favorites.roi)}`);
  }

  await pool.end();
}

main();
