import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Races from './pages/Races';
import RaceDetail from './pages/RaceDetail';
import Bets from './pages/Bets';
import Strategies from './pages/Strategies';
import Bankroll from './pages/Bankroll';
import Layout from './components/Layout';
import { authAPI } from './lib/api';
import type { User } from './lib/types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  // Only wait for /auth/me when a token exists
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  // Reload the current user (e.g. after a bet, to update the bankroll in the header)
  const refreshUser = useCallback(
    () =>
      authAPI
        .me()
        .then((response) => setUser(response.data))
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setUser(null);
        }),
    []
  );

  useEffect(() => {
    if (localStorage.getItem('token')) {
      refreshUser().finally(() => setLoading(false));
    }
  }, [refreshUser]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  const protectedPage = (page: ReactNode) =>
    user ? (
      <Layout user={user} onLogout={handleLogout}>
        {page}
      </Layout>
    ) : (
      <Navigate to="/login" />
    );

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={user ? <Navigate to="/" /> : <Login onLogin={refreshUser} />}
        />
        <Route path="/" element={protectedPage(<Dashboard user={user} />)} />
        <Route path="/races" element={protectedPage(<Races />)} />
        <Route
          path="/races/:id"
          element={protectedPage(<RaceDetail user={user} onBankrollChange={refreshUser} />)}
        />
        <Route path="/bets" element={protectedPage(<Bets onBankrollChange={refreshUser} />)} />
        <Route path="/strategies" element={protectedPage(<Strategies />)} />
        <Route path="/bankroll" element={protectedPage(<Bankroll onBankrollChange={refreshUser} />)} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
