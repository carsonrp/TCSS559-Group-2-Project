import router from './routes.js';

// Action Item and Dependency Management module.
// Mounted at /api in app.js:
//   POST  /api/meetings/:id/dependencies
//   GET   /api/meetings/:id/dependencies
//   GET   /api/meetings/:id/readiness
//   POST  /api/meetings/:id/action-items
//   GET   /api/action-items
//   PATCH /api/action-items/:id
//   POST  /api/meetings/:id/prerequisites
export default router;
