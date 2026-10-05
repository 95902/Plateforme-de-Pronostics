import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { racesAPI, predictionsAPI, betsAPI, getErrorMessage } from '../lib/api';
import { BET_TYPES } from '../lib/types';
import type { BetType, Prediction, RaceDetail as Race, SettlementSummary, User } from '../lib/types';

interface RaceDetailProps {
  user: User | null;
  onBankrollChange: () => void;
}

export default function RaceDetail({ user, onBankrollChange }: RaceDetailProps) {
  const { id } = useParams();
  const raceId = Number(id);
  const [race, setRace] = useState<Race | null>(null);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  // Bet slip
  const [betType, setBetType] = useState<BetType>('simple');
  const [selected, setSelected] = useState<number[]>([]);
  const [stake, setStake] = useState('10');
  const [placing, setPlacing] = useState(false);
  const [betMessage, setBetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [adminNotice, setAdminNotice] = useState('');

  const fetchRaceDetails = useCallback(async () => {
    try {
      const [raceRes, predRes] = await Promise.all([
        racesAPI.getRaceById(raceId),
        predictionsAPI.getRacePredictions(raceId),
      ]);
      setRace(raceRes.data);
      setPredictions(predRes.data.predictions || []);
    } catch (error) {
      console.error('Error fetching race details:', error);
    } finally {
      setLoading(false);
    }
  }, [raceId]);

  useEffect(() => {
    fetchRaceDetails();
  }, [fetchRaceDetails]);

  if (loading) {
    return <div className="text-center py-12">Loading race details...</div>;
  }

  if (!race) {
    return <div className="text-center py-12">Race not found</div>;
  }

  const canBet = race.status === 'scheduled';
  const requiredSelections = BET_TYPES.find((type) => type.value === betType)!.selections;
  const oddsByRunner = new Map(predictions.map((pred) => [pred.runner_id, pred.odds]));
  const selectedPredictions = selected
    .map((runnerId) => predictions.find((pred) => pred.runner_id === runnerId))
    .filter((pred): pred is Prediction => Boolean(pred));
  const stakeValue = parseFloat(stake);
  const estimatedPayout =
    selected.length === requiredSelections && stakeValue > 0
      ? selected.reduce((acc, runnerId) => acc * (oddsByRunner.get(runnerId) || 0), stakeValue)
      : null;

  const toggleSelection = (runnerId: number) => {
    setBetMessage(null);
    setSelected((current) => {
      if (current.includes(runnerId)) return current.filter((id) => id !== runnerId);
      if (current.length >= requiredSelections) return current;
      return [...current, runnerId];
    });
  };

  const changeBetType = (type: BetType) => {
    const max = BET_TYPES.find((t) => t.value === type)!.selections;
    setBetType(type);
    setSelected((current) => current.slice(0, max));
    setBetMessage(null);
  };

  const placeBet = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlacing(true);
    setBetMessage(null);
    try {
      const response = await betsAPI.placeBet({
        race_id: race.id,
        bet_type: betType,
        stake: stakeValue,
        selections: selected.map((runner_id) => ({ runner_id })),
      });
      setBetMessage({
        type: 'success',
        text: `Bet placed! Potential payout: ${response.data.bet.potential_payout.toFixed(2)}€`,
      });
      setSelected([]);
      onBankrollChange();
    } catch (error) {
      setBetMessage({ type: 'error', text: getErrorMessage(error, 'Failed to place bet') });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Race Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{race.name}</h1>
            <p className="text-gray-600 mt-2">
              {race.hippodrome_name} • {race.city}, {race.country}
            </p>
            <div className="flex items-center gap-6 mt-4 text-sm">
              <span className="flex items-center gap-2">
                📅 {new Date(race.date).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-2">
                ⏰ {race.time}
              </span>
              <span className="flex items-center gap-2">
                📏 {race.distance}m
              </span>
              <span className="flex items-center gap-2">
                💰 {race.prize_money?.toFixed(0)}€
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-medium ${
              race.status === 'scheduled'
                ? 'bg-green-100 text-green-800'
                : race.status === 'finished'
                ? 'bg-gray-100 text-gray-800'
                : race.status === 'cancelled'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {race.status}
            </span>
            <div className="mt-2 text-sm text-gray-600">
              {race.track_type} • {race.surface}
            </div>
          </div>
        </div>
      </div>

      {adminNotice && (
        <div className="px-4 py-3 rounded border bg-green-50 border-green-200 text-green-700">
          {adminNotice}
        </div>
      )}

      {/* Official Result */}
      {race.status === 'finished' && race.results.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <h2 className="text-xl font-bold text-gray-900">🏁 Official Result</h2>
          </div>
          <div className="divide-y">
            {race.results.map((result) => (
              <div key={result.id} className="px-6 py-3 flex items-center gap-4">
                <span className={`w-10 font-bold ${result.finish_position <= 3 && !result.disqualified ? 'text-yellow-600' : 'text-gray-600'}`}>
                  {result.finish_position}.
                </span>
                <span className="w-10 text-sm text-gray-500">#{result.saddle_number}</span>
                <span className="flex-1 font-medium text-gray-900">{result.horse_name}</span>
                {result.disqualified && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                    Disqualified
                  </span>
                )}
                {result.finish_time && <span className="text-sm text-gray-500">{result.finish_time}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: record result / cancel */}
      {user?.role === 'admin' && (race.status === 'scheduled' || race.status === 'running') && (
        <AdminRacePanel
          race={race}
          predictions={predictions}
          onDone={(notice) => {
            setAdminNotice(notice);
            fetchRaceDetails();
            onBankrollChange();
          }}
        />
      )}

      {/* Bet Slip */}
      {canBet && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900">🎟️ Place a Bet</h2>
          <p className="text-sm text-gray-600 mt-1">
            Select {requiredSelections} horse{requiredSelections > 1 ? 's' : ''} in the predictions table below.
          </p>
          <form onSubmit={placeBet} className="mt-4 grid gap-4 md:grid-cols-4 items-end">
            <div>
              <label htmlFor="bet-type" className="block text-sm font-medium text-gray-700">Bet type</label>
              <select
                id="bet-type"
                value={betType}
                onChange={(e) => changeBetType(e.target.value as BetType)}
                className="mt-1 block w-full px-3 py-2 border rounded-md bg-white"
              >
                {BET_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="stake" className="block text-sm font-medium text-gray-700">Stake (€)</label>
              <input
                id="stake"
                type="number"
                min="0.01"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded-md"
                required
              />
            </div>
            <div className="text-sm">
              <div className="text-gray-600">
                Selection: {selectedPredictions.length > 0
                  ? selectedPredictions.map((pred) => `#${pred.saddle_number}`).join(' - ')
                  : '—'} ({selected.length}/{requiredSelections})
              </div>
              <div className="text-gray-900 font-medium mt-1">
                Estimated payout: {estimatedPayout !== null ? `${estimatedPayout.toFixed(2)}€` : '—'}
              </div>
            </div>
            <button
              type="submit"
              disabled={placing || selected.length !== requiredSelections || !(stakeValue > 0)}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {placing ? 'Placing...' : 'Place bet'}
            </button>
          </form>
          {betMessage && (
            <div className={`mt-4 px-4 py-3 rounded border ${
              betMessage.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              {betMessage.text}
              {betMessage.type === 'success' && (
                <Link to="/bets" className="ml-2 font-medium underline">See my bets</Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* Predictions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">AI Predictions</h2>
          <p className="text-sm text-gray-600 mt-1">
            Based on historical data, form, and conditions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {canBet && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Bet
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Rank
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Horse
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Odds
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Score
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Confidence
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {predictions.map((pred, index) => {
                const isSelected = selected.includes(pred.runner_id);
                return (
                  <tr
                    key={pred.runner_id}
                    className={isSelected ? 'bg-blue-50' : index < 3 ? 'bg-yellow-50' : ''}
                  >
                    {canBet && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          aria-label={`Select ${pred.horse_name}`}
                          checked={isSelected}
                          disabled={!isSelected && selected.length >= requiredSelections}
                          onChange={() => toggleSelection(pred.runner_id)}
                          className="h-4 w-4"
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-bold ${index < 3 ? 'text-yellow-600' : 'text-gray-600'}`}>
                        #{index + 1}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {pred.saddle_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{pred.horse_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {pred.odds?.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${pred.prediction_score}%` }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium text-gray-900">
                          {pred.prediction_score.toFixed(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        pred.confidence_level === 'High'
                          ? 'bg-green-100 text-green-800'
                          : pred.confidence_level === 'Medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {pred.confidence_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {pred.is_value_bet ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          ✓ Value
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Runners List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">All Runners</h2>
        </div>
        <div className="divide-y">
          {race.runners.map((runner) => (
            <div key={runner.id} className="p-6 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold text-gray-700">
                      {runner.saddle_number}
                    </span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{runner.horse_name}</h3>
                      <p className="text-sm text-gray-600">
                        {runner.jockey_name} • {runner.trainer_name}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-sm text-gray-500">
                    <span>Age: {runner.horse_age}</span>
                    <span>Weight: {runner.weight_carried}kg</span>
                    {runner.final_odds && <span>Odds: {runner.final_odds.toFixed(2)}</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface AdminRacePanelProps {
  race: Race;
  predictions: Prediction[];
  onDone: (notice: string) => void;
}

function AdminRacePanel({ race, predictions, onDone }: AdminRacePanelProps) {
  const [positions, setPositions] = useState<Record<number, string>>({});
  const [disqualified, setDisqualified] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const describe = (summary: SettlementSummary) =>
    `${summary.won} won, ${summary.lost} lost, ${summary.refunded} refunded`;

  // Convenience for demos: fill the finishing order with the predicted ranking
  const fillFromPredictions = () => {
    setPositions(Object.fromEntries(predictions.map((pred, index) => [pred.runner_id, String(index + 1)])));
  };

  const recordResults = async (e: React.FormEvent) => {
    e.preventDefault();
    const results = race.runners
      .filter((runner) => positions[runner.id]?.trim())
      .map((runner) => ({
        runner_id: runner.id,
        finish_position: Number(positions[runner.id]),
        disqualified: disqualified[runner.id] === true,
      }));

    if (results.length === 0) {
      setError('Enter at least one finishing position');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await racesAPI.recordResults(race.id, results);
      onDone(`Result recorded. Bets settled: ${describe(response.data.settlement)}`);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to record results'));
    } finally {
      setSubmitting(false);
    }
  };

  const cancelRace = async () => {
    if (!window.confirm('Cancel this race and refund all pending bets?')) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await racesAPI.cancelRace(race.id);
      onDone(`Race cancelled. Bets: ${describe(response.data.settlement)}`);
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to cancel race'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow border-2 border-purple-200">
      <div className="p-6 border-b flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold text-gray-900">🛠️ Admin: Official Result</h2>
          <p className="text-sm text-gray-600 mt-1">
            Enter the finishing position of each runner (leave empty for non-finishers). Bets are settled immediately.
          </p>
        </div>
        <button
          type="button"
          onClick={fillFromPredictions}
          className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
        >
          Fill from predictions
        </button>
      </div>
      <form onSubmit={recordResults}>
        <div className="divide-y">
          {race.runners.map((runner) => (
            <div key={runner.id} className="px-6 py-3 flex items-center gap-4">
              <span className="w-10 font-bold text-gray-700">#{runner.saddle_number}</span>
              <span className="flex-1 text-gray-900">{runner.horse_name}</span>
              <input
                type="number"
                min="1"
                aria-label={`Position of ${runner.horse_name}`}
                value={positions[runner.id] || ''}
                onChange={(e) => setPositions({ ...positions, [runner.id]: e.target.value })}
                placeholder="Pos."
                className="w-20 px-2 py-1 border rounded-md"
              />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={disqualified[runner.id] === true}
                  onChange={(e) => setDisqualified({ ...disqualified, [runner.id]: e.target.checked })}
                />
                DQ
              </label>
            </div>
          ))}
        </div>
        <div className="p-6 border-t flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
          >
            Record result & settle bets
          </button>
          <button
            type="button"
            onClick={cancelRace}
            disabled={submitting}
            className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            Cancel race
          </button>
          {error && <span className="text-red-600">{error}</span>}
        </div>
      </form>
    </div>
  );
}
