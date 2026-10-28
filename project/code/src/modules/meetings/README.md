# Meetings Module

The meetings module implements the core meeting lifecycle for this application.

It follows a Route -> Controller -> Service -> Repository pattern:

- `index.js`: HTTP route definitions and request validation
- `meetingController.js`: request handling and response formatting
- `meetingService.js`: validation and business logic
- `meetingRepository.js`: PostgreSQL queries using parameterized SQL
