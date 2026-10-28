# MeetingLoop Backend

MeetingLoop is a Node.js + Express + PostgreSQL backend for managing the meeting lifecycle in a modular monolith architecture. This Phase II implementation delivers the shared infrastructure, database setup, meetings module, and deployment preparation for the project.

## Prerequisites

- Node.js 22+
- PostgreSQL 14+
- npm 10+
- Docker (optional, for containerized deployment)

## Project structure

```text
project/code/
├── app.js
├── server.js
├── package.json
├── .env.example
├── .dockerignore
├── schema.sql
├── seed.sql
├── README.md
├── deploy/
│   ├── Dockerfile
│   └── render.yaml
├── tests/
│   ├── validation.test.js
│   └── postman/
│       └── MeetingLoop.postman_collection.json
├── src/
│   ├── common/
│   │   ├── config/
│   │   │   └── env.js
│   │   ├── db/
│   │   │   ├── index.js
│   │   │   └── pool.js
│   │   ├── errors/
│   │   │   ├── AppError.js
│   │   │   └── index.js
│   │   └── middleware/
│   │       └── validation.js
│   └── modules/
│       ├── meetings/
│       │   ├── index.js
│       │   ├── meetingController.js
│       │   ├── meetingRepository.js
│       │   ├── meetingService.js
│       │   └── README.md
│       ├── readiness/
│       │   └── index.js
│       └── scheduling/
│           └── index.js
```

## Installation

1. Clone the repository and navigate to the project directory.
2. Install dependencies:

```bash
npm install
```

3. Copy the sample environment file and update values if necessary:

```bash
cp .env.example .env
```

## Database setup

1. Create the PostgreSQL database if it does not exist:

```sql
CREATE DATABASE meetingloop;
```

2. Connect to the database and run the schema creation script:

```bash
psql -h localhost -U postgres -d meetingloop -f schema.sql
```

3. Load seed data:

```bash
psql -h localhost -U postgres -d meetingloop -f seed.sql
```

4. Verify the tables exist:

```sql
\dt
SELECT * FROM users LIMIT 5;
SELECT * FROM meetings LIMIT 5;
SELECT * FROM meeting_attendees LIMIT 10;
```

## Running locally

Start the API server:

```bash
npm start
```

Run in watch mode during development:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/health
```

## API endpoints

### POST /api/meetings

Create a new meeting record.

Request body example:

```json
{
  "title": "Quarterly planning",
  "description": "Align roadmap planning and team priorities for the next quarter.",
  "start_time": "2026-11-16T09:00:00Z",
  "end_time": "2026-11-16T10:00:00Z",
  "organizer_id": 1,
  "attendees": [
    { "user_id": 2, "required": true },
    { "user_id": 3, "required": true },
    { "user_id": 5, "required": false }
  ]
}
```

Successful response:

```json
{
  "data": {
    "id": 16,
    "title": "Quarterly planning",
    "description": "Align roadmap planning and team priorities for the next quarter.",
    "start_time": "2026-11-16T09:00:00.000Z",
    "end_time": "2026-11-16T10:00:00.000Z",
    "organizer_id": 1,
    "status": "scheduled",
    "google_event_id": null,
    "created_at": "2026-11-01T10:20:00.000Z",
    "organizer": {
      "id": 1,
      "name": "Alice Martinez",
      "email": "alice.martinez@meetingloop.com",
      "role": "Product Manager",
      "department": "Product",
      "team": "Platform",
      "timezone": "America/Los_Angeles"
    },
    "attendees": [
      {
        "user_id": 2,
        "name": "Daniel Lee",
        "email": "daniel.lee@meetingloop.com",
        "role": "Senior Engineer",
        "department": "Engineering",
        "team": "Backend",
        "timezone": "America/New_York",
        "required": true
      }
    ]
  }
}
```

Validation error response format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [
      {
        "field": "title",
        "message": "Meeting title is required",
        "location": "body",
        "value": ""
      }
    ]
  }
}
```

### GET /api/meetings/:id

Retrieve a specific meeting with organizer and attendee details.

Example:

```bash
curl http://localhost:3000/api/meetings/1
```

Not found response:

```json
{
  "error": {
    "code": "MEETING_NOT_FOUND",
    "message": "Meeting with id 99999 was not found",
    "details": {
      "meeting_id": 99999
    }
  }
}
```

## Testing

Run the automated validation tests:

```bash
npm test
```

Postman collection:

- `tests/postman/MeetingLoop.postman_collection.json`

## Docker deployment

Build the image:

```bash
docker build -f deploy/Dockerfile -t meetingloop:latest .
```

Run the container:

```bash
docker run --rm -p 3000:3000 --env-file .env meetingloop:latest
```

## Render deployment

Render can deploy this service using the included configuration in `deploy/render.yaml`.

Create a new Web Service in Render and point it to this repository, or use the provided configuration with the following steps:

1. Add the repository to Render.
2. Set the build command to `npm install`.
3. Set the start command to `npm start`.
4. Add environment variables matching `.env.example`.
5. Ensure PostgreSQL is configured and the database is seeded before production usage.

## Notes

- The application uses parameterized SQL to avoid injection risks.
- Validation uses `express-validator` with HTTP 422 responses.
- The error envelope follows the required contract: `{ error: { code, message, details } }`.
- The code follows a Route -> Controller -> Service -> Repository pattern.
