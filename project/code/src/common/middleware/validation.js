import { validationResult } from 'express-validator';
import AppError from '../errors/AppError.js';

export function handleValidationErrors(req, _res, next) {
  const result = validationResult(req);

  if (!result.isEmpty()) {
    const validationDetails = result.array().map((error) => ({
      field: error.path,
      message: error.msg,
      location: error.location,
      value: error.value,
    }));

    return next(
      new AppError('Validation failed', 422, 'VALIDATION_ERROR', validationDetails)
    );
  }

  return next();
}

export default handleValidationErrors;
