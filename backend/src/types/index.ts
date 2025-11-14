export interface User {
  id: number;
  email: string;
  username: string;
  password: string;
  role: 'user' | 'premium' | 'admin';
  bankroll: number;
  preferences?: any;
  created_at: Date;
  updated_at: Date;
}

export interface Horse {
  id: number;
  name: string;
  age: number;
  sex: 'M' | 'F' | 'H'; // Male, Female, Gelding (Hongre)
  breed: string;
  color?: string;
  country?: string;
  sire?: string; // Father
  dam?: string; // Mother
  career_total_races: number;
  career_wins: number;
  career_places: number;
  career_earnings: number;
  optimal_distance?: number;
  optimal_terrain?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Jockey {
  id: number;
  name: string;
  weight?: number;
  nationality?: string;
  license_number?: string;
  career_total_races: number;
  career_wins: number;
  career_win_rate: number;
  career_earnings: number;
  created_at: Date;
  updated_at: Date;
}

export interface Trainer {
  id: number;
  name: string;
  stable_name?: string;
  nationality?: string;
  license_number?: string;
  career_horses_trained: number;
  career_wins: number;
  career_win_rate: number;
  specialty_type?: string;
  specialty_distance?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Hippodrome {
  id: number;
  name: string;
  city?: string;
  country: string;
  track_type: 'Plat' | 'Trot' | 'Obstacles';
  surface?: 'Gazon' | 'Sable' | 'Synthétique';
  configuration?: string;
  capacity?: number;
  created_at: Date;
  updated_at: Date;
}

export interface Race {
  id: number;
  hippodrome_id: number;
  race_number: number;
  date: Date;
  time: string;
  name: string;
  race_type: string;
  distance: number;
  prize_money?: number;
  age_restriction?: string;
  weather?: string;
  track_condition?: 'Bon' | 'Souple' | 'Lourd';
  status: 'scheduled' | 'running' | 'finished' | 'cancelled';
  created_at: Date;
  updated_at: Date;
}

export interface Runner {
  id: number;
  race_id: number;
  horse_id: number;
  jockey_id: number;
  trainer_id: number;
  saddle_number: number;
  barrier_draw?: number;
  weight_carried?: number;
  handicap?: number;
  morning_odds?: number;
  final_odds?: number;
  prediction_score?: number;
  confidence_level?: 'Low' | 'Medium' | 'High';
  form_last_5?: any;
  created_at: Date;
  updated_at: Date;
}

export interface Result {
  id: number;
  race_id: number;
  runner_id: number;
  finish_position: number;
  finish_time?: string;
  lengths_behind?: number;
  disqualified: boolean;
  payout_win?: number;
  payout_place?: number;
  created_at: Date;
}

export enum StrategyType {
  FAVORITE = 'FAVORITE',
  VALUE_BETTING = 'VALUE_BETTING',
  MARTINGALE = 'MARTINGALE',
  FIBONACCI = 'FIBONACCI',
  KELLY_CRITERION = 'KELLY_CRITERION',
  DUTCHING = 'DUTCHING',
  FIXED_PERCENTAGE = 'FIXED_PERCENTAGE',
  CUSTOM = 'CUSTOM'
}

export interface Strategy {
  id: number;
  user_id: number;
  name: string;
  type: StrategyType;
  description?: string;
  parameters: any;
  is_active: boolean;
  is_public: boolean;
  total_bets: number;
  winning_bets: number;
  total_staked: number;
  total_returned: number;
  roi: number;
  win_rate: number;
  avg_odds: number;
  max_drawdown: number;
  created_at: Date;
  updated_at: Date;
}

export enum BetType {
  SIMPLE = 'simple',
  COUPLE = 'couple',
  TRIO = 'trio',
  QUARTE = 'quarte',
  QUINTE = 'quinte'
}

export enum BetStatus {
  PENDING = 'pending',
  WON = 'won',
  LOST = 'lost',
  CANCELLED = 'cancelled'
}

export interface Bet {
  id: number;
  user_id: number;
  race_id: number;
  strategy_id?: number;
  bet_type: BetType;
  selections: any; // JSON: [{runner_id, odds}]
  stake: number;
  potential_payout: number;
  actual_payout: number;
  status: BetStatus;
  placed_at: Date;
  settled_at?: Date;
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  BET_PLACED = 'BET_PLACED',
  BET_WON = 'BET_WON',
  BET_LOST = 'BET_LOST'
}

export interface Transaction {
  id: number;
  user_id: number;
  type: TransactionType;
  amount: number;
  bankroll_before: number;
  bankroll_after: number;
  bet_id?: number;
  description?: string;
  created_at: Date;
}

export interface Simulation {
  id: number;
  user_id: number;
  strategy_id: number;
  name?: string;
  config: any;
  results?: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: Date;
  completed_at?: Date;
}

export interface Prediction {
  runner_id: number;
  horse_name: string;
  saddle_number: number;
  odds: number;
  prediction_score: number;
  confidence_level: 'Low' | 'Medium' | 'High';
  is_value_bet: boolean;
  expected_value?: number;
}
