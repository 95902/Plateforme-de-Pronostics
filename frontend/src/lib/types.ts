export interface User {
  id: number;
  email: string;
  username: string;
  role: 'user' | 'premium' | 'admin';
  bankroll: number;
}

export type BetType = 'simple' | 'couple' | 'trio' | 'quarte' | 'quinte';
export type BetStatus = 'pending' | 'won' | 'lost' | 'cancelled';
export type RaceStatus = 'scheduled' | 'running' | 'finished' | 'cancelled';

/** Number of horses to select for each bet type */
export const BET_TYPES: { value: BetType; label: string; selections: number }[] = [
  { value: 'simple', label: 'Simple (winner)', selections: 1 },
  { value: 'couple', label: 'Couplé (top 2)', selections: 2 },
  { value: 'trio', label: 'Trio (top 3)', selections: 3 },
  { value: 'quarte', label: 'Quarté (top 4)', selections: 4 },
  { value: 'quinte', label: 'Quinté (top 5)', selections: 5 },
];

/** Race as returned by the race lists */
export interface RaceSummary {
  id: number;
  name: string;
  date: string;
  time: string;
  distance: number;
  race_number: number;
  race_type: string;
  prize_money: number | null;
  status: RaceStatus;
  hippodrome_name: string;
  city: string;
  country: string;
  track_type: string;
}

export interface BankrollStatistics {
  current_bankroll: number;
  total_bets: number;
  winning_bets: number;
  win_rate: number;
  net_profit: number;
  roi: number;
}

export interface Runner {
  id: number;
  saddle_number: number;
  horse_name: string;
  horse_age: number;
  jockey_name: string;
  trainer_name: string;
  weight_carried: number | null;
  final_odds: number | null;
}

export interface RaceResult {
  id: number;
  runner_id: number;
  finish_position: number;
  finish_time: string | null;
  disqualified: boolean;
  saddle_number: number;
  horse_name: string;
}

export interface RaceDetail {
  id: number;
  name: string;
  date: string;
  time: string;
  distance: number;
  prize_money: number | null;
  status: RaceStatus;
  hippodrome_name: string;
  city: string;
  country: string;
  track_type: string;
  surface: string;
  runners: Runner[];
  results: RaceResult[];
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

export interface BetSelection {
  runner_id: number;
  saddle_number: number;
  odds: number;
}

export interface Bet {
  id: number;
  race_id: number;
  bet_type: BetType;
  selections: BetSelection[];
  stake: number;
  potential_payout: number;
  actual_payout: number;
  status: BetStatus;
  placed_at: string;
  race_name: string;
  race_date: string;
  race_time: string;
  race_status: RaceStatus;
  hippodrome_name: string;
  strategy_name: string | null;
}

export type StrategyType =
  | 'FAVORITE'
  | 'VALUE_BETTING'
  | 'KELLY_CRITERION'
  | 'MARTINGALE'
  | 'FIBONACCI'
  | 'DUTCHING'
  | 'FIXED_PERCENTAGE'
  | 'CUSTOM';

export interface Strategy {
  id: number;
  name: string;
  type: StrategyType;
  description: string;
  parameters: Record<string, unknown>;
  is_active: boolean;
  total_bets: number;
  winning_bets: number;
  total_staked: number;
  total_returned: number;
  roi: number;
  win_rate: number;
}

export interface SettlementSummary {
  race_id: number;
  won: number;
  lost: number;
  refunded: number;
}
