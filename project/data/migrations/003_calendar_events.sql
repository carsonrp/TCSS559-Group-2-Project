CREATE TABLE IF NOT EXISTS calendar_events (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL UNIQUE REFERENCES meetings(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT calendar_events_valid_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events (start_time);

INSERT INTO calendar_events (meeting_id, start_time, end_time, status)
SELECT id, start_time, end_time, status
FROM meetings
ON CONFLICT (meeting_id) DO NOTHING;
