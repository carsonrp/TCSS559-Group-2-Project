import {
  createAvailability,
  deleteAvailability,
  findCommonAvailability,
  listAvailability,
} from './availabilityService.js';

export async function createAvailabilityController(req, res, next) {
  try {
    const slot = await createAvailability(req.params.id, req.body);
    res.status(201).json({ data: slot });
  } catch (error) {
    next(error);
  }
}

export async function listAvailabilityController(req, res, next) {
  try {
    const slots = await listAvailability(req.params.id);
    res.status(200).json({ data: slots });
  } catch (error) {
    next(error);
  }
}

export async function deleteAvailabilityController(req, res, next) {
  try {
    await deleteAvailability(req.params.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}

export async function findCommonAvailabilityController(req, res, next) {
  try {
    const attendees = req.query.attendees.split(',').map((id) => id.trim());
    const availableSlots = await findCommonAvailability(attendees);
    res.status(200).json({ availableSlots });
  } catch (error) {
    next(error);
  }
}

export default {
  createAvailability: createAvailabilityController,
  deleteAvailability: deleteAvailabilityController,
  findCommonAvailability: findCommonAvailabilityController,
  listAvailability: listAvailabilityController,
};
