import { useEffect, useState } from 'react';
import { strategiesAPI } from '../lib/api';

export default function Strategies() {
  const [strategies, setStrategies] = useState([]);
  const [loading, setLoading] = useState(true);

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
      </div>

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
            Create a strategy to start automated betting
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {strategies.map((strategy: any) => (
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
              </div>

              {/* Performance Stats */}
              {strategy.total_bets > 0 && (
                <div className="mt-6 grid grid-cols-4 gap-4 pt-6 border-t">
                  <div>
                    <div className="text-xs text-gray-500">Total Staked</div>
                    <div className="text-lg font-bold text-gray-900">
                      {parseFloat(strategy.total_staked).toFixed(2)}€
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Returned</div>
                    <div className="text-lg font-bold text-gray-900">
                      {parseFloat(strategy.total_returned).toFixed(2)}€
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
                      {(parseFloat(strategy.total_returned) - parseFloat(strategy.total_staked)).toFixed(2)}€
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
