-- Refunds of cancelled bets get their own transaction type instead of DEPOSIT,
-- so they no longer count as money deposited in the statistics.
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'BET_PLACED', 'BET_WON', 'BET_LOST', 'BET_REFUND'));

-- Past refunds: deposits tied to a bet (a real deposit never has a bet_id)
UPDATE transactions SET type = 'BET_REFUND' WHERE type = 'DEPOSIT' AND bet_id IS NOT NULL;
