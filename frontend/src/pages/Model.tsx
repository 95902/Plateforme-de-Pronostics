import { useState } from 'react';
import { predictionsAPI, getErrorMessage } from '../lib/api';
import type { BettingResult, EvaluationReport, ProbabilityMetrics } from '../lib/types';

const toISODate = (date: Date) => date.toISOString().slice(0, 10);
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const signedPercent = (value: number) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

export default function Model() {
  const [from, setFrom] = useState(() => toISODate(new Date(Date.now() - 365 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError('');
    try {
      const response = await predictionsAPI.getEvaluation({ from, to });
      setReport(response.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Evaluation failed'));
    } finally {
      setRunning(false);
    }
  };

  const beatsMarket = report !== null && report.model.log_loss < report.market.log_loss;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Model Evaluation</h1>
        <p className="text-gray-600 mt-1">
          Does the model predict winners better than the odds? Measured on finished races, with each horse
          judged only on what was known before its race.
        </p>
      </div>

      <form onSubmit={run} className="bg-white rounded-lg shadow p-6 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="eval-from" className="block text-xs font-medium text-gray-600">From</label>
          <input id="eval-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 px-3 py-2 border rounded-md text-sm" required />
        </div>
        <div>
          <label htmlFor="eval-to" className="block text-xs font-medium text-gray-600">To</label>
          <input id="eval-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 px-3 py-2 border rounded-md text-sm" required />
        </div>
        <button type="submit" disabled={running} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50">
          {running ? 'Evaluating...' : 'Evaluate'}
        </button>
      </form>

      {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">{error}</div>}

      {report && report.races === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-gray-600">No finished race with odds and a winner in this period.</div>
      )}

      {report && report.races > 0 && (
        <>
          <div className={`px-4 py-3 rounded border ${beatsMarket ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {beatsMarket
              ? '✅ The model predicts winners better than the odds on this period.'
              : '⚠️ The model does not beat the odds on this period: its value bets have no real edge.'}
            <span className="block text-sm mt-1 opacity-80">
              {report.races} races, {report.runners} runners
              {report.skipped_races > 0 && ` (${report.skipped_races} skipped: missing odds or winner)`}
            </span>
          </div>

          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Probabilities from</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Log-loss (lower is better)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Brier (lower is better)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Top pick wins</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <MetricsRow label="Model" metrics={report.model} best={report.best === 'model'} />
                <MetricsRow label="Market (odds)" metrics={report.market} best={report.best === 'market'} />
                <MetricsRow label={`Blend (${report.blend.model_weight} model)`} metrics={report.blend} best={report.best === 'blend'} />
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">Calibration</h2>
              <p className="text-sm text-gray-600 mt-1">
                For runners given a win probability in each band, the share that actually won. Well calibrated
                probabilities have both columns close.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Predicted</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Model: runners</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">predicted → won</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Market: runners</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">predicted → won</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {report.model.calibration.map((band, index) => {
                    const market = report.market.calibration[index];
                    return (
                      <tr key={band.from}>
                        <td className="px-6 py-3 text-gray-700">{percent(band.from)} – {percent(band.to)}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{band.runners}</td>
                        <td className="px-6 py-3 text-right text-gray-900">{band.runners ? `${percent(band.predicted)} → ${percent(band.actual)}` : '—'}</td>
                        <td className="px-6 py-3 text-right text-gray-500">{market.runners}</td>
                        <td className="px-6 py-3 text-right text-gray-900">{market.runners ? `${percent(market.predicted)} → ${percent(market.actual)}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <BettingTile
              title={`1€ on each value bet (edge ≥ ${percent(report.betting.value_bets.min_edge)})`}
              result={report.betting.value_bets}
            />
            <BettingTile title="1€ on each favorite" result={report.betting.favorites} />
          </div>
        </>
      )}
    </div>
  );
}

function MetricsRow({ label, metrics, best }: { label: string; metrics: ProbabilityMetrics; best: boolean }) {
  return (
    <tr className={best ? 'bg-green-50' : ''}>
      <td className="px-6 py-3 font-medium text-gray-900">
        {label}
        {best && <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">best</span>}
      </td>
      <td className="px-6 py-3 text-right text-gray-900">{metrics.log_loss.toFixed(4)}</td>
      <td className="px-6 py-3 text-right text-gray-900">{metrics.brier.toFixed(4)}</td>
      <td className="px-6 py-3 text-right text-gray-900">{percent(metrics.top_pick_win_rate)}</td>
    </tr>
  );
}

function BettingTile({ title, result }: { title: string; result: BettingResult }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm text-gray-600">{title}</div>
      <div className={`text-2xl font-bold mt-2 ${result.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>ROI {signedPercent(result.roi)}</div>
      <div className="text-xs text-gray-500 mt-1">
        {result.bets} bets, {result.wins} wins, {result.staked.toFixed(0)}€ staked, {result.returned.toFixed(2)}€ returned
      </div>
    </div>
  );
}
