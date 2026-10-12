-- Indexes for the point-in-time statistics of horses, jockeys and trainers
-- (computed from the races finished before each race)
CREATE INDEX IF NOT EXISTS idx_runners_jockey ON runners(jockey_id);
CREATE INDEX IF NOT EXISTS idx_runners_trainer ON runners(trainer_id);
CREATE INDEX IF NOT EXISTS idx_results_runner ON results(runner_id);
CREATE INDEX IF NOT EXISTS idx_races_start ON races((date + time)) WHERE status = 'finished';
