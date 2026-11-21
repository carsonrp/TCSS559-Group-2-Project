import notificationService from './notification.service.js';

const operations = {
  created: (body) => notificationService.sendMeetingCreatedEmail(body.meeting),
  updated: (body) => notificationService.sendMeetingUpdatedEmail(body.meeting, body.old_meeting),
  deleted: (body) => notificationService.sendMeetingDeletedEmail(body.meeting),
  blocked: (body) => notificationService.sendDependencyBlockedEmail(body.meeting, body.reason),
  rescheduled: (body) => notificationService.sendRescheduledEmail(
    body.meeting,
    body.old_time,
    body.new_time,
    body.reason
  ),
};

export async function sendNotificationController(req, res, next) {
  try {
    const result = await operations[req.params.type](req.body);
    res.status(202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export default { sendNotificationController };
