-- Support for importing real race data from an external source.

-- Stable identifier of a race in the source (e.g. "2026-10-12-R1C3"), used to re-import without duplicates
ALTER TABLE races ADD COLUMN IF NOT EXISTS external_id VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_races_external_id ON races(external_id) WHERE external_id IS NOT NULL;

-- Horses withdrawn after declaration
ALTER TABLE runners ADD COLUMN IF NOT EXISTS non_runner BOOLEAN NOT NULL DEFAULT FALSE;

-- Official dividends (rapports) per euro staked, when the source provides them
CREATE TABLE IF NOT EXISTS race_dividends (
  id SERIAL PRIMARY KEY,
  race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  bet_type VARCHAR(20) NOT NULL CHECK (bet_type IN ('simple', 'couple', 'trio', 'quarte', 'quinte')),
  -- Saddle numbers of the winning combination, sorted ascending
  combination INTEGER[] NOT NULL,
  payout_per_euro DECIMAL(12, 2) NOT NULL CHECK (payout_per_euro > 0),
  UNIQUE (race_id, bet_type, combination)
);
CREATE INDEX IF NOT EXISTS idx_race_dividends_race ON race_dividends(race_id);

-- Name lookups used when importing horses, jockeys, trainers and racecourses
CREATE INDEX IF NOT EXISTS idx_horses_lower_name ON horses(lower(name));
CREATE INDEX IF NOT EXISTS idx_jockeys_lower_name ON jockeys(lower(name));
CREATE INDEX IF NOT EXISTS idx_trainers_lower_name ON trainers(lower(name));
CREATE INDEX IF NOT EXISTS idx_hippodromes_lower_name ON hippodromes(lower(name));

-- Real sources do not always give a horse's age
ALTER TABLE horses ALTER COLUMN age DROP NOT NULL;
