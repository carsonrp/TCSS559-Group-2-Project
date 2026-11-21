import { Router } from 'express';
import meetingRouter from './meeting.routes.js';
import attendeeRouter from './attendee.routes.js';

const meetingModuleRouter = Router();
meetingModuleRouter.use(meetingRouter);
meetingModuleRouter.use(attendeeRouter);

export { meetingRouter, attendeeRouter };
export default meetingModuleRouter;
