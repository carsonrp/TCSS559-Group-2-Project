# Action Item and Dependency Management module

Decides whether a meeting can proceed. It owns three tables: `meeting_dependencies`,
`action_items`, and `prerequisites` (see `migrations/002_action_items_dependencies.sql`).
Meeting data is read through Meeting Management's `getMeetingById` service, never by
querying its tables. No part of this module calls an LLM.

## Files

| File | Role |
|---|---|
| `routes.js` | Endpoints and request validation (express-validator) |
| `controller.js` | HTTP request and response handling |
| `dependencyService.js` | Dependency rules: self-link, duplicate, cycle, minimum gap; dependency status |
| `readinessService.js` | Readiness rules (`evaluateReadiness` is a pure function, unit-tested) |
| `actionItemService.js` | Action items, status lifecycle, prerequisites |
| `dependencyRepository.js`, `actionItemRepository.js` | Parameterized SQL |

## Endpoints

| Method | Path | Success | Errors |
|---|---|---|---|
| POST | `/api/meetings/:id/dependencies` | 201 | 422 invalid input or gap violated, 404 meeting not found, 409 self-link, duplicate, or cycle |
| GET | `/api/meetings/:id/dependencies` | 200 | 404, 422 |
| GET | `/api/meetings/:id/readiness` | 200 | 404, 422 |
| POST | `/api/meetings/:id/action-items` | 201 | 404, 422 (owner must be organizer or attendee; AI items need `evidence_quote`) |
| GET | `/api/action-items?meeting_id=&owner_id=&status=` | 200 | 422 |
| PATCH | `/api/action-items/:id` | 200 | 403, 404, 409 invalid status change, 422 |
| POST | `/api/meetings/:id/prerequisites` | 201 | 404, 409 duplicate, 422 |

`GET` readiness and dependencies accept an optional `as_of` (ISO 8601) to evaluate at a
fixed time; it defaults to now. Tests use `as_of=2026-11-09T00:00:00Z` so results do not
change with the calendar.

## Rules

**Adding a dependency**, in order: validate input (422), both meetings exist (404),
self-link (409), duplicate (409), cycle via a recursive query over the graph (409),
minimum gap between the upstream meeting's end and this meeting's start (422), then insert (201).
The cycle check and insert run in one transaction holding an advisory lock, so two
concurrent requests cannot create a cycle together.

**Readiness:**

| Check | Result |
|---|---|
| Upstream dependency violated (order broken or upstream cancelled) | Blocking |
| Required prerequisite done | Complete |
| Required, not done, due date passed | Blocking (`overdue`, or `missing` for a document without a link) |
| Required, not done, not yet due | At risk |
| Optional, not done | Warning |
| Dropped prerequisite, or item dropped or rejected | Listed, not counted |

The due date is the prerequisite's own, else its action item's, else the meeting start.
Status is `not_ready` if anything blocks, `at_risk` if anything is at risk, else `ready`.

**Action item status changes:** proposed to open or rejected; open to done or dropped;
done back to open. When an `X-User-Id` header is sent, only the item owner or the
meeting organizer may change an item, and only the organizer may drop one.
AI-created items always start as `proposed` and count only after a user confirms them.

## Setup and tests

```bash
psql -U postgres -d meetingloop -f migrations/002_action_items_dependencies.sql
psql -U postgres -d meetingloop -f seed_action_items_dependencies.sql   # after seed.sql
npm test                                                                # unit tests
```

Postman: `tests/postman/ActionItemsDependencies.postman_collection.json`, run in order
against a freshly seeded database.
