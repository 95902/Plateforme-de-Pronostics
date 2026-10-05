import { useEffect, useState } from 'react';
import { strategiesAPI, getErrorMessage } from '../lib/api';
import type { Strategy, StrategyType } from '../lib/types';

/** Suggested parameters for each strategy type (editable in the form) */
const DEFAULT_PARAMETERS: Record<StrategyType, Record<string, number>> = {
  FAVORITE: { baseStake: 20, maxOdds: 4 },
  VALUE_BETTING: { minEV: 5, percentageBankroll: 2, minOdds: 3, maxOdds: 15 },
  KELLY_CRITERION: { fraction: 0.5, maxStakePercent: 5 },
  MARTINGALE: { baseStake: 5, maxStake: 160, maxConsecutiveLosses: 5 },
  FIBONACCI: { baseStake: 5, maxStep: 8 },
  DUTCHING: { horses: 3, totalStake: 20 },
  FIXED_PERCENTAGE: { percentageBankroll: 2 },
  CUSTOM: {},
};

const STRATEGY_TYPES = Object.keys(DEFAULT_PARAMETERS) as StrategyType[];

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const response = await strategiesAPI.getStrategies();
      setStrategies(response.data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (strategy: Strategy) => {
    setError('');
    try {
      await strategiesAPI.updateStrategy(strategy.id, { is_active: !strategy.is_active });
      fetchStrategies();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update strategy'));
    }
  };

  const deleteStrategy = async (strategy: Strategy) => {
    if (!window.confirm(`Delete strategy "${strategy.name}"?`)) return;
    setError('');
    try {
      await strategiesAPI.deleteStrategy(strategy.id);
      fetchStrategies();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete strategy'));
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading strategies...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Betting Strategies</h1>
          <p className="text-gray-600 mt-1">
            Manage and test your betting strategies
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          {showForm ? 'Close' : 'New strategy'}
        </button>
      </div>

      {showForm && (
        <StrategyForm
          onCreated={() => {
            setShowForm(false);
            fetchStrategies();
          }}
        />
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">{error}</div>
      )}

      {/* Strategy Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          📊 Available Strategy Types
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
          <div>
            <strong>FAVORITE:</strong> Bet on the race favorite (lowest odds)
          </div>
          <div>
            <strong>VALUE_BETTING:</strong> Find undervalued horses (EV &gt; 0)
          </div>
          <div>
            <strong>KELLY_CRITERION:</strong> Optimal stake calculation
          </div>
          <div>
            <strong>MARTINGALE:</strong> Double stake after losses
          </div>
          <div>
            <strong>FIXED_PERCENTAGE:</strong> Bet fixed % of bankroll
          </div>
          <div>
            <strong>DUTCHING:</strong> Spread bet across multiple horses
          </div>
        </div>
      </div>

      {/* Strategies List */}
      {strategies.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No strategies configured yet</p>
          <p className="text-sm text-gray-400 mt-2">
            Create a strategy to track its performance
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {strategies.map((strategy) => (
            <div key={strategy.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-gray-900">
                      {strategy.name}
                    </h3>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      strategy.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {strategy.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-gray-600 mt-2">{strategy.description}</p>

                  <div className="mt-4 flex items-center gap-6 text-sm">
                    <div>
                      <span className="text-gray-500">Type:</span>{' '}
                      <span className="font-semibold text-blue-600">
                        {strategy.type}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Total Bets:</span>{' '}
                      <span className="font-semibold">{strategy.total_bets}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Win Rate:</span>{' '}
                      <span className="font-semibold">
                        {(strategy.win_rate * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">ROI:</span>{' '}
                      <span className={`font-semibold ${
                        strategy.roi >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {(strategy.roi * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Parameters */}
                  <div className="mt-4 p-4 bg-gray-50 rounded-md">
                    <div className="text-sm font-medium text-gray-700 mb-2">
                      Parameters:
                    </div>
                    <div className="text-sm text-gray-600">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(strategy.parameters, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => toggleActive(strategy)}
                    className="px-3 py-1 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    {strategy.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => deleteStrategy(strategy)}
                    className="px-3 py-1 text-sm font-medium rounded-md text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {/* Performance Stats */}
              {strategy.total_bets > 0 && (
                <div className="mt-6 grid grid-cols-4 gap-4 pt-6 border-t">
                  <div>
                    <div className="text-xs text-gray-500">Total Staked</div>
                    <div className="text-lg font-bold text-gray-900">
                      {strategy.total_staked.toFixed(2)}€
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Returned</div>
                    <div className="text-lg font-bold text-gray-900">
                      {strategy.total_returned.toFixed(2)}€
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Net Profit</div>
                    <div className={`text-lg font-bold ${
                      (strategy.total_returned - strategy.total_staked) >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {(strategy.total_returned - strategy.total_staked) >= 0 ? '+' : ''}
                      {(strategy.total_returned - strategy.total_staked).toFixed(2)}€
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Winning Bets</div>
                    <div className="text-lg font-bold text-blue-600">
                      {strategy.winning_bets} / {strategy.total_bets}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategyForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<StrategyType>('FAVORITE');
  const [description, setDescription] = useState('');
  const [parameters, setParameters] = useState(JSON.stringify(DEFAULT_PARAMETERS.FAVORITE, null, 2));
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const changeType = (newType: StrategyType) => {
    setType(newType);
    setParameters(JSON.stringify(DEFAULT_PARAMETERS[newType], null, 2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let parsedParameters: unknown;
    try {
      parsedParameters = JSON.parse(parameters);
    } catch {
      setError('Parameters must be valid JSON');
      return;
    }
    if (typeof parsedParameters !== 'object' || parsedParameters === null || Array.isArray(parsedParameters)) {
      setError('Parameters must be a JSON object');
      return;
    }

    setSaving(true);
    try {
      await strategiesAPI.createStrategy({ name, type, description, parameters: parsedParameters, is_active: isActive });
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create strategy'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">New Strategy</h3>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="strategy-name" className="block text-sm font-medium text-gray-700">Name</label>
          <input
            id="strategy-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded-md"
            maxLength={255}
            required
          />
        </div>
        <div>
          <label htmlFor="strategy-type" className="block text-sm font-medium text-gray-700">Type</label>
          <select
            id="strategy-type"
            value={type}
            onChange={(e) => changeType(e.target.value as StrategyType)}
            className="mt-1 block w-full px-3 py-2 border rounded-md bg-white"
          >
            {STRATEGY_TYPES.map((strategyType) => (
              <option key={strategyType} value={strategyType}>{strategyType}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="strategy-description" className="block text-sm font-medium text-gray-700">Description</label>
          <input
            id="strategy-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded-md"
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="strategy-parameters" className="block text-sm font-medium text-gray-700">
            Parameters (JSON)
          </label>
          <textarea
            id="strategy-parameters"
            value={parameters}
            onChange={(e) => setParameters(e.target.value)}
            rows={6}
            className="mt-1 block w-full px-3 py-2 border rounded-md font-mono text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Parameters are saved with the strategy. Automatic execution will come with the strategy engine.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="md:col-span-2 flex items-center gap-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create strategy'}
          </button>
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      </form>
    </div>
  );
}
