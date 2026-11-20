import { getMeetingSummary, getSingleMeetingInsights } from './insights.service.js';

export async function getMeetingSummaryController(req, res, next) {
  try {
    const summary = await getMeetingSummary(req.query.start, req.query.end);
    res.status(200).json(summary);
  } catch (error) {
    next(error);
  }
}

export async function getSingleMeetingInsightsController(req, res, next) {
  try {
    const insights = await getSingleMeetingInsights(req.params.id);
    res.status(200).json({ data: insights });
  } catch (error) {
    next(error);
  }
}

export default {
  getMeetingSummaryController,
  getSingleMeetingInsightsController,
};
