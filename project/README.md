# MeetingLoop

MeetingLoop is a meeting lifecycle management application: meetings, attendees and availability, dependencies between meetings, action items, and a readiness check that decides whether a meeting can proceed. The backend is a Node.js, Express, and PostgreSQL modular monolith.

## Folder layout

```text
project/
├── README.md        this file
├── code/            Node.js/Express backend (app.js, server.js, src/, unit tests in code/tests/)
├── data/            database schema, migrations, and sample data
├── tests/           Postman collections
├── deploy/          Dockerfile, Dockerfile.dockerignore, render.yaml
├── frontend/        React client (see frontend/README.md)
└── docs/            UML diagrams
```

Backend modules (`code/src/modules/`):

| Module | Folder | Endpoints |
| --- | --- | --- |
| Meeting Management | `meetings/`, `users/` | Meetings CRUD, attendees, availability, conflict check, users list |
| Action Item and Dependency Management | `action-items-dependencies/` | Dependencies, readiness, action items, prerequisites |

Each module folder has its own README with endpoint details. Meeting Management is also documented in `code/docs/meeting-management.openapi.yaml`.

## Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+
- Docker (for the container build)

## 1. Install and configure

```bash
cd project/code
npm install
cp .env.example .env
```

Edit `.env` and set `DB_PASSWORD` (and the other values if your PostgreSQL setup differs). Never commit `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | 3000 | API port |
| `DB_HOST`, `DB_PORT` | localhost, 5432 | PostgreSQL location |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | meetingloop, postgres, (empty) | PostgreSQL database and credentials |
| `NODE_ENV` | development | Environment name |

## 2. Set up the database

From `project/code`, create the database and run the scripts in this order:

```bash
psql -U postgres -c "CREATE DATABASE meetingloop"
psql -U postgres -d meetingloop -f ../data/schema.sql
psql -U postgres -d meetingloop -f ../data/migrations/001_user_availability.sql
psql -U postgres -d meetingloop -f ../data/migrations/002_action_items_dependencies.sql
psql -U postgres -d meetingloop -f ../data/seed.sql
psql -U postgres -d meetingloop -f ../data/seed_action_items_dependencies.sql
```

| File | Creates |
| --- | --- |
| `schema.sql` | users, meetings, meeting_attendees |
| `migrations/001_user_availability.sql` | user_availability |
| `migrations/002_action_items_dependencies.sql` | meeting_dependencies, action_items, prerequisites |
| `seed.sql` | 10 users, 15 meetings, and their attendees |
| `seed_action_items_dependencies.sql` | 3 dependencies, 5 action items, 7 prerequisites |

The sample data covers each readiness outcome. With `as_of=2026-11-09T00:00:00Z`, meeting 11 is `ready`, 13 is `at_risk`, 15 is `not_ready` (overdue item), and 6 is `not_ready` (dependency order broken).

To reset, run `DROP DATABASE meetingloop` (with the server stopped) and repeat the steps above.

## 3. Run the backend

```bash
cd project/code
npm start
curl http://localhost:3000/health
```

`npm run dev` starts it in watch mode.

## 4. Test

Unit tests (no database needed), from `project/code`:

```bash
npm test
```

API tests with the Postman collections, against a freshly seeded database and a running server. Import them into Postman, or run them with Newman from `project/code`:

```bash
npx newman run ../tests/postman/ActionItemsDependencies.postman_collection.json
npx newman run ../tests/postman/MeetingLoop.postman_collection.json
```

Reset the database between runs, since both collections create and change data. The collections use a `baseUrl` variable, set to `http://localhost:3000`.

## 5. Docker

Build from `project/code`, using the Dockerfile in `project/deploy`:

```bash
cd project/code
docker build -f ../deploy/Dockerfile -t meetingloop:latest .
docker run --rm -p 3000:3000 --env-file .env -e DB_HOST=host.docker.internal meetingloop:latest
curl http://localhost:3000/health
```

`DB_HOST=host.docker.internal` lets the container reach PostgreSQL running on your machine (Docker Desktop on macOS and Windows). The ignore rules are in `deploy/Dockerfile.dockerignore`, which Docker applies automatically to builds that use `deploy/Dockerfile`; they keep `node_modules` and `.env` out of the image.

## 6. Render deployment

`deploy/render.yaml` describes the web service. In Render, create a Web Service from this repository with root directory `project/code`, build command `npm install`, start command `npm start`, and the environment variables from `.env.example`, pointing `DB_*` at a hosted PostgreSQL database initialized with the scripts in `project/data`.

## Phase II status

Completed:

- Meeting Management: meeting create, read, update, delete, and list (paging or date range); attendees; user availability; attendee conflict detection; common availability; users list.
- Action Item and Dependency Management: dependencies with cycle and minimum-gap checks, readiness check, action items with a status lifecycle, prerequisites.
- PostgreSQL schema, sample data, unit tests, Postman collections, Dockerfile.

Planned for Phase III:

- AI Meeting Lifecycle Assistant (LLM with tool calling over these APIs).
- Google Calendar integration.
- Dependency order check when a meeting's time is changed.
- Separate services behind an API gateway, and frontend integration.

## Conventions

- JSON with snake_case fields. Success: `{ "data": ... }`. Errors: `{ "error": { "code", "message", "details" } }`.
- Validation errors return 422; conflicts and rule violations return 409; unknown resources return 404.
- All SQL is parameterized. Code follows Route, Controller, Service, Repository layers.
