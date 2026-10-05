import { useEffect, useState } from 'react';
import { bankrollAPI, getErrorMessage } from '../lib/api';
import type { BankrollStatistics } from '../lib/types';

interface Transaction {
  id: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'BET_PLACED' | 'BET_WON' | 'BET_LOST';
  amount: number;
  bankroll_after: number;
  description: string | null;
  created_at: string;
}

// Money leaving the bankroll is shown as a negative amount
const DEBIT_TYPES: Transaction['type'][] = ['WITHDRAWAL', 'BET_PLACED'];

export default function Bankroll({ onBankrollChange }: { onBankrollChange: () => void }) {
  const [statistics, setStatistics] = useState<BankrollStatistics | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<'deposit' | 'withdraw' | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, transRes] = await Promise.all([
        bankrollAPI.getStatistics(),
        bankrollAPI.getTransactions({ limit: 20 }),
      ]);
      setStatistics(statsRes.data);
      setTransactions(transRes.data);
    } catch (error) {
      console.error('Error fetching bankroll data:', error);
    } finally {
      setLoading(false);
    }
  };

  const openOperation = (newOperation: 'deposit' | 'withdraw') => {
    setOperation(operation === newOperation ? null : newOperation);
    setAmount('');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (operation === 'withdraw') {
        await bankrollAPI.withdraw(parseFloat(amount));
      } else {
        await bankrollAPI.deposit(parseFloat(amount));
      }
      setAmount('');
      setOperation(null);
      fetchData();
      onBankrollChange();
    } catch (err) {
      setError(getErrorMessage(err, operation === 'withdraw' ? 'Withdrawal failed' : 'Deposit failed'));
    }
  };

  if (loading) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Bankroll Management</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openOperation('deposit')}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Deposit
          </button>
          <button
            onClick={() => openOperation('withdraw')}
            className="px-4 py-2 bg-white text-gray-700 border rounded-md hover:bg-gray-50"
          >
            Withdraw
          </button>
        </div>
      </div>

      {operation && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">
            {operation === 'deposit' ? 'Deposit Funds' : 'Withdraw Funds'}
          </h3>
          <form onSubmit={handleSubmit} className="flex gap-4">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount (€)"
              className="flex-1 px-3 py-2 border rounded-md"
              min="0.01"
              step="0.01"
              required
            />
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setOperation(null)}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              Cancel
            </button>
          </form>
          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded">{error}</div>
          )}
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Current Bankroll</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {statistics?.current_bankroll?.toFixed(2) || '0.00'}€
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Total Bets</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {statistics?.total_bets || 0}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {statistics?.winning_bets || 0} wins
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Win Rate</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">
            {statistics?.win_rate?.toFixed(1) || '0.0'}%
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm text-gray-600">Net Profit/Loss</div>
          <div className={`text-3xl font-bold mt-2 ${(statistics?.net_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(statistics?.net_profit || 0) >= 0 ? '+' : ''}{statistics?.net_profit?.toFixed(2) || '0.00'}€
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ROI: {statistics?.roi?.toFixed(2) || '0.00'}%
          </div>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Transaction History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(tx.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      tx.type === 'DEPOSIT'
                        ? 'bg-green-100 text-green-800'
                        : tx.type === 'BET_WON'
                        ? 'bg-blue-100 text-blue-800'
                        : tx.type === 'BET_PLACED'
                        ? 'bg-yellow-100 text-yellow-800'
                        : tx.type === 'WITHDRAWAL'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {tx.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {tx.description || '-'}
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${
                    DEBIT_TYPES.includes(tx.type) ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {DEBIT_TYPES.includes(tx.type) ? '-' : '+'}{tx.amount.toFixed(2)}€
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                    {tx.bankroll_after.toFixed(2)}€
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
