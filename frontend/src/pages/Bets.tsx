import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { betsAPI, getErrorMessage } from '../lib/api';
import { BET_TYPES } from '../lib/types';
import type { Bet, BetStatus } from '../lib/types';

const PAGE_SIZE = 20;

const FILTERS: { value: BetStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_STYLES: Record<BetStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  won: 'bg-green-100 text-green-800',
  lost: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function Bets({ onBankrollChange }: { onBankrollChange: () => void }) {
  const [bets, setBets] = useState<Bet[]>([]);
  const [filter, setFilter] = useState<BetStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const fetchBets = useCallback(async (offset: number) => {
    setError('');
    try {
      const params = { limit: PAGE_SIZE, offset, ...(filter !== 'all' && { status: filter }) };
      const response = await betsAPI.getBets(params);
      setBets((current) => (offset === 0 ? response.data : [...current, ...response.data]));
      setHasMore(response.data.length === PAGE_SIZE);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load bets'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    fetchBets(0);
  }, [fetchBets]);

  const cancelBet = async (bet: Bet) => {
    if (!window.confirm(`Cancel this bet and get ${bet.stake.toFixed(2)}€ back?`)) return;
    setError('');
    try {
      await betsAPI.cancelBet(bet.id);
      onBankrollChange();
      fetchBets(0);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to cancel bet'));
    }
  };

  const betTypeLabel = (bet: Bet) => BET_TYPES.find((type) => type.value === bet.bet_type)?.label ?? bet.bet_type;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Bets</h1>
        <div className="flex gap-2">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                filter === option.value ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">{error}</div>
      )}

      {loading ? (
        <div className="text-center py-12">Loading bets...</div>
      ) : bets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No bets yet</p>
          <p className="text-sm text-gray-400 mt-2">
            Open an upcoming <Link to="/races" className="text-blue-600 hover:text-blue-800">race</Link> to place a bet
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Race</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bet</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Selection</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Stake</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Payout</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {bets.map((bet) => (
                <tr key={bet.id}>
                  <td className="px-6 py-4">
                    <Link to={`/races/${bet.race_id}`} className="font-medium text-blue-600 hover:text-blue-800">
                      {bet.race_name}
                    </Link>
                    <div className="text-xs text-gray-500 mt-1">
                      {bet.hippodrome_name} • {new Date(bet.race_date).toLocaleDateString()} {bet.race_time}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {betTypeLabel(bet)}
                    {bet.strategy_name && <div className="text-xs text-gray-500">{bet.strategy_name}</div>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {bet.selections.map((sel) => `#${sel.saddle_number} (${sel.odds.toFixed(2)})`).join(' - ')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {bet.stake.toFixed(2)}€
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    {bet.status === 'won' ? (
                      <span className="font-semibold text-green-600">+{bet.actual_payout.toFixed(2)}€</span>
                    ) : bet.status === 'pending' ? (
                      <span className="text-gray-500">{bet.potential_payout.toFixed(2)}€ potential</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS_STYLES[bet.status]}`}>
                      {bet.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    {bet.status === 'pending' && bet.race_status === 'scheduled' && (
                      <button
                        onClick={() => cancelBet(bet)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {hasMore && (
            <div className="p-4 text-center border-t">
              <button
                onClick={() => fetchBets(bets.length)}
                className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
