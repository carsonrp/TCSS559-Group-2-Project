import router from './routes.js';
import { registerScheduleRules } from '../meetings/scheduleChangeService.js';
import { planDependencyChanges } from './scheduleRuleService.js';

// Action Item and Dependency Management module.
// Mounted at /api in app.js:
//   POST  /api/meetings/:id/dependencies
//   GET   /api/meetings/:id/dependencies
//   GET   /api/meetings/:id/dependency-status
//   POST  /api/meetings/:id/recalculate-dependencies
//   GET   /api/meetings/:id/readiness
//   POST  /api/meetings/:id/action-items
//   GET   /api/action-items
//   PATCH /api/action-items/:id
//   POST  /api/meetings/:id/prerequisites

// Meeting Management calls these rules when a meeting's time changes, without
// importing this module (see meetings/scheduleChangeService.js).
registerScheduleRules({ planDependencyChanges });

export default router;
