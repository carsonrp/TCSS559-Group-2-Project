# MeetingLoop — UML Activity Diagrams

Activity diagrams for the MeetingLoop calendar app (React + FullCalendar frontend,
Express + PostgreSQL backend). Each diagram uses swimlanes for the actor or tier
that performs each step.

| # | Diagram | What it covers |
|---|---------|----------------|
| 1 | [Load & navigate the calendar](01-load-calendar.png) | Theme bootstrapping, FullCalendar range fetch, `GET /api/meetings?start&end`, error banner, navigation loop |
| 2 | [View meeting details](02-view-meeting-details.png) | Event click → `GET /api/meetings/:id` → 404 / 200 → side panel |
| 3a | [Create a meeting — user & frontend](03a-create-meeting-form.png) | Drag-select or "+ New meeting", user loading, form editing, client validation, retry loop |
| 3b | [Create a meeting — backend & database](03b-create-meeting-server.png) | express-validator, service rules, attendee normalization, transaction (BEGIN / COMMIT / ROLLBACK) |
| 4 | [Switch dark / light mode](04-toggle-theme.png) | Toggle → `data-color-scheme` → CSS tokens + FullCalendar palette, localStorage persistence |
| 5 | [Backend request pipeline](05-backend-request-pipeline.png) | cors → helmet → JSON → routing → validation → controller / service / repository → errorHandler |

Each diagram is available as `.puml` (source), `.png` (raster) and `.svg` (vector, best for reports).

## Regenerating

The diagrams are written in [PlantUML](https://plantuml.com/activity-diagram-beta).
Shared styling lives in `_style.iuml`.

```sh
# from this folder, with plantuml.jar downloaded and Java installed
java -jar plantuml.jar -tsvg *.puml
java -jar plantuml.jar -tpng -Sdpi=150 *.puml
```

The VS Code "PlantUML" extension can also preview and export them.
