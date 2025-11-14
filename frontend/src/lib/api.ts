import axios from 'axios';

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
    if (error.response?.status === 401) {
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
  getRaces: (params?: any) => api.get('/races', { params }),
  getRaceById: (id: number) => api.get(`/races/${id}`),
  getUpcoming: (limit?: number) => api.get('/races/upcoming', { params: { limit } }),
  getToday: () => api.get('/races/today'),
};

export const predictionsAPI = {
  getRacePredictions: (raceId: number) => api.get(`/predictions/race/${raceId}`),
  getValueBets: (raceId: number) => api.get(`/predictions/race/${raceId}/value-bets`),
};

export const bankrollAPI = {
  getBankroll: () => api.get('/bankroll'),
  getTransactions: (params?: any) => api.get('/bankroll/transactions', { params }),
  getStatistics: () => api.get('/bankroll/statistics'),
  deposit: (amount: number) => api.post('/bankroll/deposit', { amount }),
  withdraw: (amount: number) => api.post('/bankroll/withdraw', { amount }),
};

export const strategiesAPI = {
  getStrategies: () => api.get('/strategies'),
  getStrategyById: (id: number) => api.get(`/strategies/${id}`),
  createStrategy: (data: any) => api.post('/strategies', data),
  updateStrategy: (id: number, data: any) => api.put(`/strategies/${id}`, data),
  deleteStrategy: (id: number) => api.delete(`/strategies/${id}`),
};

export const betsAPI = {
  getBets: (params?: any) => api.get('/bets', { params }),
  placeBet: (data: any) => api.post('/bets', data),
  cancelBet: (id: number) => api.delete(`/bets/${id}`),
};

export const horsesAPI = {
  getHorses: (params?: any) => api.get('/horses', { params }),
  getHorseById: (id: number) => api.get(`/horses/${id}`),
};

export default api;
