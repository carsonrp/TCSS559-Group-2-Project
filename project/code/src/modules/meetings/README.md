# Meeting Management Module

The module implements meeting lifecycle management, attendee management, user availability, scheduling conflict checks, and common availability calculations. It follows the Route -> Controller -> Service -> Repository pattern. All SQL is parameterized and lives in repository modules.

## Files

- `meeting.routes.js`, `attendee.routes.js`, `availability.routes.js`: route definitions and express-validator middleware.
- `meetingController.js`, `attendeeController.js`, `availabilityController.js`: HTTP request and response handling.
- `meetingService.js`, `attendeeService.js`, `availabilityService.js`, `conflictService.js`: validation and application logic.
- `meetingRepository.js`, `attendeeRepository.js`, `availabilityRepository.js`: PostgreSQL access.
- `index.js`: meeting and attendee routers; availability routes are mounted at `/api` by `app.js`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/meetings` | Create a meeting and one or more attendees |
| GET | `/api/meetings?page=1&limit=20` | Paginated meeting list |
| GET | `/api/meetings/:id` | Meeting, organizer, and attendees |
| PUT | `/api/meetings/:id` | Update one or more meeting fields |
| DELETE | `/api/meetings/:id` | Delete a meeting and cascaded attendee links |
| POST | `/api/meetings/:id/attendees` | Add an attendee |
| GET | `/api/meetings/:id/attendees` | List attendees with user details |
| DELETE | `/api/meetings/:id/attendees/:userId` | Remove an attendee |
| POST | `/api/users/:id/availability` | Create a user availability slot |
| GET | `/api/users/:id/availability` | List a user's availability slots |
| DELETE | `/api/availability/:id` | Delete an availability slot |
| GET | `/api/meetings/validate?start=…&end=…&attendees=1,2` | Check overlapping meetings |
| GET | `/api/meetings/availability/common?attendees=1,2` | Find windows available to all users |

Validation errors return HTTP 422, missing resources return HTTP 404, and schedule conflicts return HTTP 409. Meeting creation and updates lock the participating user rows inside a transaction before conflict checks and writes.

## Database migration

After applying `schema.sql` (which creates `users`), apply the availability migration:

```bash
psql -h localhost -U postgres -d meetingloop -f ../data/migrations/001_user_availability.sql   # from project/code
```

## Documentation and tests

- OpenAPI 3.0 specification: `docs/meeting-management.openapi.yaml`
- Postman collection: `project/tests/postman/MeetingLoop.postman_collection.json`
- Automated tests: `npm test`
