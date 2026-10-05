import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User } from '../lib/types';

interface LayoutProps {
  user: User | null;
  onLogout: () => void;
  children: ReactNode;
}

export default function Layout({ user, onLogout, children }: LayoutProps) {

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <Link
                to="/"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-900 hover:text-blue-600"
              >
                🏇 Horse Racing Predictor
              </Link>
              <Link
                to="/"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Dashboard
              </Link>
              <Link
                to="/races"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Races
              </Link>
              <Link
                to="/bets"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                My Bets
              </Link>
              <Link
                to="/strategies"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Strategies
              </Link>
              <Link
                to="/bankroll"
                className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Bankroll
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-gray-600">Bankroll:</span>{' '}
                <span className="font-semibold text-green-600">
                  {user?.bankroll?.toFixed(2) || '0.00'}€
                </span>
              </div>
              <div className="text-sm text-gray-700">{user?.username}</div>
              <button
                onClick={onLogout}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}
