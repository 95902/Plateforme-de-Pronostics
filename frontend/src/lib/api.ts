import axios from 'axios';
import type { BetType, StrategyType } from './types';

type QueryParams = Record<string, string | number | undefined>;

interface StrategyInput {
  name: string;
  type: StrategyType;
  description?: string;
  parameters: object;
  is_active?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 on login/register means bad credentials: let the form show the error
    const isAuthRequest = error.config?.url?.startsWith('/auth/');
    if (error.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, username: string, password: string) =>
    api.post('/auth/register', { email, username, password }),
  me: () => api.get('/auth/me'),
};

export const racesAPI = {
  getRaces: (params?: QueryParams) => api.get('/races', { params }),
  getRaceById: (id: number) => api.get(`/races/${id}`),
  getUpcoming: (limit?: number) => api.get('/races/upcoming', { params: { limit } }),
  getToday: () => api.get('/races/today'),
  recordResults: (
    id: number,
    results: { runner_id: number; finish_position: number; disqualified?: boolean }[]
  ) => api.post(`/races/${id}/results`, { results }),
  cancelRace: (id: number) => api.post(`/races/${id}/cancel`),
};

export const predictionsAPI = {
  getRacePredictions: (raceId: number) => api.get(`/predictions/race/${raceId}`),
  getValueBets: (raceId: number) => api.get(`/predictions/race/${raceId}/value-bets`),
};

export const bankrollAPI = {
  getBankroll: () => api.get('/bankroll'),
  getTransactions: (params?: QueryParams) => api.get('/bankroll/transactions', { params }),
  getStatistics: () => api.get('/bankroll/statistics'),
  deposit: (amount: number) => api.post('/bankroll/deposit', { amount }),
  withdraw: (amount: number) => api.post('/bankroll/withdraw', { amount }),
};

export const strategiesAPI = {
  getStrategies: () => api.get('/strategies'),
  getStrategyById: (id: number) => api.get(`/strategies/${id}`),
  createStrategy: (data: StrategyInput) => api.post('/strategies', data),
  updateStrategy: (id: number, data: Partial<StrategyInput>) => api.put(`/strategies/${id}`, data),
  deleteStrategy: (id: number) => api.delete(`/strategies/${id}`),
  backtest: (id: number, config: { from: string; to: string; initial_bankroll: number }) =>
    api.post(`/strategies/${id}/backtest`, config),
  getSimulations: (id: number) => api.get(`/strategies/${id}/simulations`),
};

export const betsAPI = {
  getBets: (params?: QueryParams) => api.get('/bets', { params }),
  placeBet: (data: {
    race_id: number;
    bet_type: BetType;
    stake: number;
    selections: { runner_id: number }[];
    strategy_id?: number;
  }) => api.post('/bets', data),
  cancelBet: (id: number) => api.delete(`/bets/${id}`),
};

export const horsesAPI = {
  getHorses: (params?: QueryParams) => api.get('/horses', { params }),
  getHorseById: (id: number) => api.get(`/horses/${id}`),
};

/** Extract the API error message from an axios error */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error?.message || fallback;
  }
  return fallback;
}

export default api;
