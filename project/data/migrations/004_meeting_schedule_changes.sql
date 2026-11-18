CREATE TABLE IF NOT EXISTS meeting_schedule_changes (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  old_start_time TIMESTAMPTZ NOT NULL,
  old_end_time TIMESTAMPTZ NOT NULL,
  new_start_time TIMESTAMPTZ NOT NULL,
  new_end_time TIMESTAMPTZ NOT NULL,
  old_status VARCHAR(50) NOT NULL,
  new_status VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_schedule_changes_meeting
  ON meeting_schedule_changes (meeting_id, created_at DESC);
