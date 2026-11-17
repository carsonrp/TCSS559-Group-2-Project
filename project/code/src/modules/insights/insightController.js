import { getInsightsSummary, getMeetingInsights } from './insightService.js';

export async function getInsightsSummaryController(req, res, next) {
  try {
    const summary = await getInsightsSummary({ start: req.query.start, end: req.query.end });
    res.status(200).json({ data: summary });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingInsightsController(req, res, next) {
  try {
    const insights = await getMeetingInsights(req.params.id);
    res.status(200).json({ data: insights });
  } catch (error) {
    next(error);
  }
}

export default {
  getInsightsSummary: getInsightsSummaryController,
  getMeetingInsights: getMeetingInsightsController,
};
