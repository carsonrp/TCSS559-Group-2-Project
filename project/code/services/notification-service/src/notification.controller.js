import { sendMeetingNotification } from './notification.service.js';

export async function sendNotificationController(req, res, next) {
  try {
    const result = await sendMeetingNotification(req.params.type, req.body);
    res.status(202).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export default { sendNotificationController };
