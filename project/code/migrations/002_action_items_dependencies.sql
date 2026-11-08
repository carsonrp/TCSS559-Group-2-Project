-- Action Item and Dependency Management: schema
-- Run after schema.sql and 001_user_availability.sql.

-- One row = one edge in the dependency graph:
-- meeting_id may start only after upstream_meeting_id ends, plus min_gap_hours.
-- ON DELETE RESTRICT: a meeting that is part of a dependency cannot be deleted.
CREATE TABLE IF NOT EXISTS meeting_dependencies (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  upstream_meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  min_gap_hours INTEGER NOT NULL DEFAULT 0 CHECK (min_gap_hours >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT meeting_dependencies_no_self CHECK (meeting_id <> upstream_meeting_id),
  CONSTRAINT meeting_dependencies_unique_pair UNIQUE (meeting_id, upstream_meeting_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_dependencies_upstream
  ON meeting_dependencies (upstream_meeting_id);

-- Action items come from a source meeting. AI-created items start as 'proposed'
-- and must carry the quote they were extracted from (traceability).
CREATE TABLE IF NOT EXISTS action_items (
  id SERIAL PRIMARY KEY,
  source_meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE RESTRICT,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('proposed', 'open', 'done', 'dropped', 'rejected')),
  origin VARCHAR(10) NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'ai')),
  evidence_quote TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT action_items_ai_needs_evidence CHECK (origin <> 'ai' OR evidence_quote IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_action_items_source_meeting ON action_items (source_meeting_id);
CREATE INDEX IF NOT EXISTS idx_action_items_owner_status ON action_items (owner_id, status);

-- What a meeting needs before it can proceed: an action item or a document.
CREATE TABLE IF NOT EXISTS prerequisites (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('action_item', 'document')),
  action_item_id INTEGER REFERENCES action_items(id) ON DELETE CASCADE,
  title VARCHAR(200),
  document_url TEXT,
  due_date TIMESTAMPTZ,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  dropped BOOLEAN NOT NULL DEFAULT FALSE,
  source VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'suggested')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT prerequisites_kind_fields CHECK (
    (kind = 'action_item' AND action_item_id IS NOT NULL)
    OR (kind = 'document' AND title IS NOT NULL)
  ),
  CONSTRAINT prerequisites_unique_item UNIQUE (meeting_id, action_item_id)
);

CREATE INDEX IF NOT EXISTS idx_prerequisites_meeting ON prerequisites (meeting_id);
