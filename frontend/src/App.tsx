import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Races from './pages/Races';
import RaceDetail from './pages/RaceDetail';
import Strategies from './pages/Strategies';
import Bankroll from './pages/Bankroll';
import Layout from './components/Layout';
import { authAPI } from './lib/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authAPI.me();
        setUser(response.data);
        setIsAuthenticated(true);
      } catch (error) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setIsAuthenticated(false);
      }
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate to="/" />
            ) : (
              <Login onLogin={() => {
                setIsAuthenticated(true);
                checkAuth();
              }} />
            )
          }
        />
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Layout user={user}>
                <Dashboard user={user} />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/races"
          element={
            isAuthenticated ? (
              <Layout user={user}>
                <Races />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/races/:id"
          element={
            isAuthenticated ? (
              <Layout user={user}>
                <RaceDetail />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/strategies"
          element={
            isAuthenticated ? (
              <Layout user={user}>
                <Strategies />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route
          path="/bankroll"
          element={
            isAuthenticated ? (
              <Layout user={user}>
                <Bankroll />
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
