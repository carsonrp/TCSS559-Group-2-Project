-- Action Item and Dependency Management: sample data
-- Run after seed.sql. Meeting and user ids refer to rows created there.
-- With ?as_of=2026-11-09T00:00:00Z the readiness endpoint returns:
--   meeting 11 Roadmap Alignment   -> ready
--   meeting 13 Launch Readiness    -> at_risk   (required item open, not yet due)
--   meeting 15 Quarterly Budget    -> not_ready (required item overdue)
--   meeting 6  Insights Deep Dive  -> not_ready (dependency order broken)

-- Dependency chain: Sprint Planning (1) -> Roadmap Alignment (11) -> Launch Readiness (13)
INSERT INTO meeting_dependencies (meeting_id, upstream_meeting_id, min_gap_hours)
VALUES
  (11, 1, 24),
  (13, 11, 24);

-- Edge case: a dependency whose order is broken (meeting 6 is held before meeting 10).
-- The API rejects this with 422; it is inserted directly to show how readiness reports it.
INSERT INTO meeting_dependencies (meeting_id, upstream_meeting_id, min_gap_hours)
VALUES (6, 10, 0);

INSERT INTO action_items (source_meeting_id, owner_id, description, due_date, status, origin, evidence_quote)
VALUES
  -- id 1: done
  (1, 2, 'Finalize the sprint scope document', '2026-11-05T17:00:00Z', 'done', 'manual', NULL),
  -- id 2: open, due after 2026-11-09
  (1, 5, 'Draft the launch checklist', '2026-11-11T17:00:00Z', 'open', 'manual', NULL),
  -- id 3: open, overdue
  (1, 8, 'Complete the security sign-off for the release', '2026-11-04T17:00:00Z', 'open', 'manual', NULL),
  -- id 4: AI-extracted, waiting for confirmation; carries its evidence quote
  (9, 5, 'Share the retrospective summary with the team', NULL, 'proposed', 'ai',
   'Sofia will send the retro summary to the team by Monday.'),
  -- id 5: dropped
  (1, 2, 'Prepare the old launch deck', '2026-11-08T17:00:00Z', 'dropped', 'manual', NULL);

INSERT INTO prerequisites (meeting_id, kind, action_item_id, title, document_url, due_date, required, done, dropped)
VALUES
  -- Roadmap Alignment (11): everything required is done
  (11, 'action_item', 1, NULL, NULL, NULL, TRUE, FALSE, FALSE),
  (11, 'document', NULL, 'Q4 roadmap draft', 'https://docs.example.com/roadmap-q4', NULL, TRUE, TRUE, FALSE),
  -- Launch Readiness (13): one required item still open, one optional document, one dropped item
  (13, 'action_item', 2, NULL, NULL, NULL, TRUE, FALSE, FALSE),
  (13, 'document', NULL, 'Support coverage plan', NULL, NULL, FALSE, FALSE, FALSE),
  (13, 'action_item', 5, NULL, NULL, NULL, TRUE, FALSE, FALSE),
  -- Quarterly Budget Review (15): one overdue item, one document not yet due
  (15, 'action_item', 3, NULL, NULL, NULL, TRUE, FALSE, FALSE),
  (15, 'document', NULL, 'Q4 budget forecast', NULL, '2026-11-13T17:00:00Z', TRUE, FALSE, FALSE);
