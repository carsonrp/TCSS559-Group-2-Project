CREATE TABLE IF NOT EXISTS user_availability (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_start TIMESTAMPTZ NOT NULL,
  available_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_availability_valid_range CHECK (available_end > available_start)
);

CREATE INDEX IF NOT EXISTS idx_user_availability_user_start
  ON user_availability (user_id, available_start);
