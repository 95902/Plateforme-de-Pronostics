import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { strategiesAPI, getErrorMessage } from '../lib/api';
import type { Simulation, Strategy } from '../lib/types';

const CHART_LINE = '#2563eb'; // blue-600, the app's primary color
const GRID = '#e5e7eb'; // gray-200
const AXIS_TEXT = '#6b7280'; // gray-500

const toISODate = (date: Date) => date.toISOString().slice(0, 10);

function defaultFrom() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return toISODate(date);
}

const euros = (value: number) => `${value.toFixed(2)}€`;
const signedEuros = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}€`;
const percent = (value: number, signed = false) => `${signed && value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;

export default function BacktestPanel({ strategy }: { strategy: Strategy }) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [initialBankroll, setInitialBankroll] = useState('1000');
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  // Show the latest backtest of this strategy, if any
  useEffect(() => {
    strategiesAPI
      .getSimulations(strategy.id)
      .then((response) => {
        const [latest] = response.data as Simulation[];
        if (latest) setSimulation(latest);
      })
      .catch(() => {});
  }, [strategy.id]);

  const runBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError('');
    try {
      const response = await strategiesAPI.backtest(strategy.id, {
        from,
        to,
        initial_bankroll: parseFloat(initialBankroll),
      });
      setSimulation(response.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Backtest failed'));
    } finally {
      setRunning(false);
    }
  };

  const summary = simulation?.results.summary;

  return (
    <div className="mt-6 pt-6 border-t">
      <h4 className="font-semibold text-gray-900">Backtest on past races</h4>
      <p className="text-sm text-gray-500 mt-1">
        Replays this strategy on finished races with a virtual bankroll. Your real bankroll is not affected.
      </p>

      <form onSubmit={runBacktest} className="mt-4 flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`bt-from-${strategy.id}`} className="block text-xs font-medium text-gray-600">From</label>
          <input
            id={`bt-from-${strategy.id}`}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 px-3 py-2 border rounded-md text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor={`bt-to-${strategy.id}`} className="block text-xs font-medium text-gray-600">To</label>
          <input
            id={`bt-to-${strategy.id}`}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 px-3 py-2 border rounded-md text-sm"
            required
          />
        </div>
        <div>
          <label htmlFor={`bt-bankroll-${strategy.id}`} className="block text-xs font-medium text-gray-600">
            Starting bankroll (€)
          </label>
          <input
            id={`bt-bankroll-${strategy.id}`}
            type="number"
            min="1"
            step="0.01"
            value={initialBankroll}
            onChange={(e) => setInitialBankroll(e.target.value)}
            className="mt-1 w-32 px-3 py-2 border rounded-md text-sm"
            required
          />
        </div>
        <button
          type="submit"
          disabled={running}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Run backtest'}
        </button>
      </form>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded text-sm">{error}</div>
      )}

      {simulation && summary && (
        <div className="mt-6 space-y-6">
          <p className="text-xs text-gray-500">
            {simulation.config.from} → {simulation.config.to} • {summary.races_analyzed} races analyzed,{' '}
            {summary.races_bet} bet on • run {new Date(simulation.created_at).toLocaleString()}
          </p>

          {summary.busted && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              ⚠️ Bankroll exhausted: the strategy could no longer cover its stakes.
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatTile label="Final bankroll" value={euros(summary.final_bankroll)} />
            <StatTile
              label="Net profit"
              value={signedEuros(summary.net_profit)}
              tone={summary.net_profit >= 0 ? 'good' : 'bad'}
            />
            <StatTile label="ROI" value={percent(summary.roi, true)} tone={summary.roi >= 0 ? 'good' : 'bad'} />
            <StatTile
              label="Win rate"
              value={percent(summary.win_rate)}
              detail={`${summary.winning_bets} / ${summary.total_bets} bets`}
            />
            <StatTile label="Max drawdown" value={percent(summary.max_drawdown)} detail="from peak bankroll" />
          </div>

          {simulation.results.equity_curve.length > 1 ? (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Bankroll over time</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={simulation.results.equity_curve} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                      tickLine={false}
                      axisLine={{ stroke: GRID }}
                      minTickGap={40}
                    />
                    <YAxis
                      tick={{ fill: AXIS_TEXT, fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tickFormatter={(value: number) => `${Math.round(value)}€`}
                    />
                    <ReferenceLine
                      y={summary.initial_bankroll}
                      stroke={AXIS_TEXT}
                      strokeDasharray="4 4"
                      label={{ value: 'Start', position: 'insideTopRight', fill: AXIS_TEXT, fontSize: 12 }}
                    />
                    <Tooltip
                      formatter={(value) => [euros(Number(value)), 'Bankroll']}
                      labelStyle={{ color: '#111827' }}
                      cursor={{ stroke: AXIS_TEXT, strokeWidth: 1 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="bankroll"
                      stroke={CHART_LINE}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Not enough bets in this period to draw the bankroll curve.</p>
          )}

          {simulation.results.recent_bets.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-700 mb-2">Last simulated bets</div>
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Horse</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Odds</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Stake</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {simulation.results.recent_bets.slice(0, 10).map((bet, index) => (
                      <tr key={`${bet.race_id}-${bet.saddle_number}-${index}`}>
                        <td className="px-4 py-2 text-gray-500">{bet.date}</td>
                        <td className="px-4 py-2 text-gray-900">#{bet.saddle_number}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{bet.odds.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-gray-700">{euros(bet.stake)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${bet.won ? 'text-green-600' : 'text-gray-500'}`}>
                          {bet.won ? `Won +${euros(bet.payout)}` : 'Lost'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400">
            Simplified model: fixed odds, win bets only, predictions computed with today&apos;s horse statistics.
            Past results do not guarantee future returns.
          </p>
        </div>
      )}
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  tone?: 'good' | 'bad';
}

function StatTile({ label, value, detail, tone }: StatTileProps) {
  return (
    <div className="bg-gray-50 rounded-md p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold mt-1 ${
        tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-600' : 'text-gray-900'
      }`}>
        {value}
      </div>
      {detail && <div className="text-xs text-gray-500 mt-1">{detail}</div>}
    </div>
  );
}
