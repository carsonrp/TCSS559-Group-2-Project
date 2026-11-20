import { addDependency, listDependencies } from './dependencyService.js';
import { getReadiness } from './readinessService.js';
import { getMeetingDependencyStatus, recalculateMeetingDependencies } from './scheduleRuleService.js';
import {
  addPrerequisite,
  createActionItem,
  listActionItems,
  updateActionItem,
} from './actionItemService.js';

function actingUser(req) {
  const header = req.get('X-User-Id');
  return header ? Number(header) : undefined;
}

export async function addDependencyController(req, res, next) {
  try {
    const dependency = await addDependency(req.params.id, req.body);
    res.status(201).json({ data: dependency });
  } catch (error) {
    next(error);
  }
}

export async function listDependenciesController(req, res, next) {
  try {
    const result = await listDependencies(req.params.id, req.query.as_of);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
}

export async function getReadinessController(req, res, next) {
  try {
    const readiness = await getReadiness(req.params.id, req.query.as_of);
    res.status(200).json({ data: readiness });
  } catch (error) {
    next(error);
  }
}

export async function createActionItemController(req, res, next) {
  try {
    const item = await createActionItem(req.params.id, req.body);
    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function listActionItemsController(req, res, next) {
  try {
    const items = await listActionItems(req.query);
    res.status(200).json({ data: items });
  } catch (error) {
    next(error);
  }
}

export async function updateActionItemController(req, res, next) {
  try {
    const item = await updateActionItem(req.params.id, req.body, actingUser(req));
    res.status(200).json({ data: item });
  } catch (error) {
    next(error);
  }
}

export async function addPrerequisiteController(req, res, next) {
  try {
    const prerequisite = await addPrerequisite(req.params.id, req.body);
    res.status(201).json({ data: prerequisite });
  } catch (error) {
    next(error);
  }
}

export async function getMeetingDependencyStatusController(req, res, next) {
  try {
    const result = await getMeetingDependencyStatus(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function recalculateMeetingDependenciesController(req, res, next) {
  try {
    const updatedMeetings = await recalculateMeetingDependencies(req.params.id);
    res.status(200).json({ updatedMeetings });
  } catch (error) {
    next(error);
  }
}
