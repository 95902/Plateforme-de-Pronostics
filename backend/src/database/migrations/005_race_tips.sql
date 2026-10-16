-- Press tips of a race gathered from an external site (e.g. turfpronos), and the site's synthesis

CREATE TABLE IF NOT EXISTS race_tips (
  id SERIAL PRIMARY KEY,
  race_id INTEGER NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  -- Site the tips come from
  source VARCHAR(50) NOT NULL,
  -- Newspaper or tipster, e.g. "Equidia"; the synthesis has is_consensus = TRUE
  tipster VARCHAR(100) NOT NULL,
  -- Saddle numbers, in the tipster's order
  selection INTEGER[] NOT NULL,
  is_consensus BOOLEAN NOT NULL DEFAULT FALSE,
  fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (race_id, source, tipster)
);
CREATE INDEX IF NOT EXISTS idx_race_tips_race ON race_tips(race_id);
