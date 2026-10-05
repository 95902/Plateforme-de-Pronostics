-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'premium', 'admin')),
  bankroll DECIMAL(12,2) DEFAULT 0,
  preferences JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Horses table
CREATE TABLE IF NOT EXISTS horses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 2 AND age <= 20),
  sex CHAR(1) CHECK (sex IN ('M', 'F', 'H')),
  breed VARCHAR(100),
  color VARCHAR(50),
  country VARCHAR(100),
  sire VARCHAR(255),
  dam VARCHAR(255),
  career_total_races INTEGER DEFAULT 0,
  career_wins INTEGER DEFAULT 0,
  career_places INTEGER DEFAULT 0,
  career_earnings DECIMAL(12,2) DEFAULT 0,
  optimal_distance INTEGER,
  optimal_terrain VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Jockeys table
CREATE TABLE IF NOT EXISTS jockeys (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  weight DECIMAL(4,1),
  nationality VARCHAR(100),
  license_number VARCHAR(50) UNIQUE,
  career_total_races INTEGER DEFAULT 0,
  career_wins INTEGER DEFAULT 0,
  career_win_rate DECIMAL(5,4) DEFAULT 0,
  career_earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trainers table
CREATE TABLE IF NOT EXISTS trainers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  stable_name VARCHAR(255),
  nationality VARCHAR(100),
  license_number VARCHAR(50) UNIQUE,
  career_horses_trained INTEGER DEFAULT 0,
  career_wins INTEGER DEFAULT 0,
  career_win_rate DECIMAL(5,4) DEFAULT 0,
  specialty_type VARCHAR(50),
  specialty_distance INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Hippodromes table
CREATE TABLE IF NOT EXISTS hippodromes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  city VARCHAR(100),
  country VARCHAR(100) NOT NULL,
  track_type VARCHAR(50) NOT NULL CHECK (track_type IN ('Plat', 'Trot', 'Obstacles')),
  surface VARCHAR(50) CHECK (surface IN ('Gazon', 'Sable', 'Synthétique')),
  configuration VARCHAR(50),
  capacity INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Races table
CREATE TABLE IF NOT EXISTS races (
  id SERIAL PRIMARY KEY,
  hippodrome_id INTEGER REFERENCES hippodromes(id) ON DELETE CASCADE,
  race_number INTEGER NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  name VARCHAR(255),
  race_type VARCHAR(50) NOT NULL,
  distance INTEGER NOT NULL,
  prize_money DECIMAL(12,2),
  age_restriction VARCHAR(50),
  weather VARCHAR(50),
  track_condition VARCHAR(50) CHECK (track_condition IN ('Bon', 'Souple', 'Lourd')),
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'running', 'finished', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Runners (partants) table
CREATE TABLE IF NOT EXISTS runners (
  id SERIAL PRIMARY KEY,
  race_id INTEGER REFERENCES races(id) ON DELETE CASCADE,
  horse_id INTEGER REFERENCES horses(id) ON DELETE CASCADE,
  jockey_id INTEGER REFERENCES jockeys(id) ON DELETE CASCADE,
  trainer_id INTEGER REFERENCES trainers(id) ON DELETE CASCADE,
  saddle_number INTEGER NOT NULL,
  barrier_draw INTEGER,
  weight_carried DECIMAL(4,1),
  handicap INTEGER DEFAULT 0,
  morning_odds DECIMAL(8,2),
  final_odds DECIMAL(8,2),
  prediction_score DECIMAL(5,2),
  confidence_level VARCHAR(20) CHECK (confidence_level IN ('Low', 'Medium', 'High')),
  form_last_5 JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(race_id, saddle_number)
);

-- Results table
CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  race_id INTEGER REFERENCES races(id) ON DELETE CASCADE,
  runner_id INTEGER REFERENCES runners(id) ON DELETE CASCADE,
  finish_position INTEGER NOT NULL,
  finish_time VARCHAR(20),
  lengths_behind DECIMAL(4,2) DEFAULT 0,
  disqualified BOOLEAN DEFAULT FALSE,
  payout_win DECIMAL(8,2) DEFAULT 0,
  payout_place DECIMAL(8,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(race_id, finish_position)
);

-- Strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('FAVORITE', 'VALUE_BETTING', 'MARTINGALE', 'FIBONACCI', 'KELLY_CRITERION', 'DUTCHING', 'FIXED_PERCENTAGE', 'CUSTOM')),
  description TEXT,
  parameters JSONB NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  total_bets INTEGER DEFAULT 0,
  winning_bets INTEGER DEFAULT 0,
  total_staked DECIMAL(12,2) DEFAULT 0,
  total_returned DECIMAL(12,2) DEFAULT 0,
  roi DECIMAL(8,4) DEFAULT 0,
  win_rate DECIMAL(5,4) DEFAULT 0,
  avg_odds DECIMAL(6,2) DEFAULT 0,
  max_drawdown DECIMAL(8,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bets table
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  race_id INTEGER REFERENCES races(id) ON DELETE CASCADE,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL,
  bet_type VARCHAR(50) NOT NULL CHECK (bet_type IN ('simple', 'couple', 'trio', 'quarte', 'quinte')),
  selections JSONB NOT NULL,
  stake DECIMAL(10,2) NOT NULL CHECK (stake > 0),
  potential_payout DECIMAL(10,2) NOT NULL,
  actual_payout DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'cancelled')),
  placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMP
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'BET_PLACED', 'BET_WON', 'BET_LOST')),
  amount DECIMAL(10,2) NOT NULL,
  bankroll_before DECIMAL(10,2) NOT NULL,
  bankroll_after DECIMAL(10,2) NOT NULL,
  bet_id INTEGER REFERENCES bets(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simulations table
CREATE TABLE IF NOT EXISTS simulations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  strategy_id INTEGER REFERENCES strategies(id) ON DELETE CASCADE,
  name VARCHAR(255),
  config JSONB NOT NULL,
  results JSONB,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_races_date ON races(date DESC);
CREATE INDEX IF NOT EXISTS idx_races_hippodrome ON races(hippodrome_id);
CREATE INDEX IF NOT EXISTS idx_races_status ON races(status);
CREATE INDEX IF NOT EXISTS idx_runners_race ON runners(race_id);
CREATE INDEX IF NOT EXISTS idx_runners_horse ON runners(horse_id);
CREATE INDEX IF NOT EXISTS idx_results_race ON results(race_id);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_race ON bets(race_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(status);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_strategies_user ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_horses_name ON horses(name);
CREATE INDEX IF NOT EXISTS idx_jockeys_name ON jockeys(name);

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_horses_updated_at ON horses;
CREATE TRIGGER update_horses_updated_at BEFORE UPDATE ON horses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_jockeys_updated_at ON jockeys;
CREATE TRIGGER update_jockeys_updated_at BEFORE UPDATE ON jockeys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_trainers_updated_at ON trainers;
CREATE TRIGGER update_trainers_updated_at BEFORE UPDATE ON trainers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_hippodromes_updated_at ON hippodromes;
CREATE TRIGGER update_hippodromes_updated_at BEFORE UPDATE ON hippodromes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_races_updated_at ON races;
CREATE TRIGGER update_races_updated_at BEFORE UPDATE ON races FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_runners_updated_at ON runners;
CREATE TRIGGER update_runners_updated_at BEFORE UPDATE ON runners FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_strategies_updated_at ON strategies;
CREATE TRIGGER update_strategies_updated_at BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
