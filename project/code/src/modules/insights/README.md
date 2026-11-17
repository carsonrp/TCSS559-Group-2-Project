# Meeting Insights Module

Meeting Insights computes statistics about meetings. It owns no tables: it reads
the Meeting Management tables (`meetings`, `meeting_attendees`, `users`) with
read-only queries and never writes to them.

Same Route -> Controller -> Service -> Repository pattern as the meetings module,
plus `insightCalculations.js`, which holds the rules as pure functions so they can
be unit tested without a database.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/insights/summary?start=&end=` | Totals, status breakdown, person-hours by department, per-person load, and meetings outside someone's working hours, for meetings overlapping the range (both bounds optional) |
| GET | `/api/insights/meetings/:id` | One meeting's duration, participants with local times, time zones, who is outside working hours, and who is double-booked |

## Rules

- **Participants** are the organizer plus every attendee.
- **Person-hours** = meeting length x number of participants.
- **Cancelled meetings** appear in the status breakdown only; they are left out of hours, people and working-hours figures.
- **Working hours** use each user's `timezone`, `working_hours_start` and `working_hours_end`. Working days are Monday to Friday. A meeting is outside working hours if, in that person's time zone, it falls on a weekend, starts before their day starts, or ends after it ends.
- **Double-booked** means another non-cancelled meeting overlaps in time and shares a participant.

Action item statistics (open, done, overdue, completion rate) will be added once
the Action Item and Dependency module provides its tables.
