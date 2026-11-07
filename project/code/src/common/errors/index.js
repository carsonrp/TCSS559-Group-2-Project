import AppError from './AppError.js';

export { AppError };

export function notFoundHandler(req, _res, next) {
  next(
    new AppError(`Route not found: ${req.originalUrl}`, 404, 'NOT_FOUND', {
      method: req.method,
      path: req.originalUrl,
    })
  );
}

// PostgreSQL foreign-key violation (SQLSTATE 23503) on delete: the row is still
// referenced, e.g. a meeting that has dependencies or action items.
function fromPostgresError(error) {
  if (error?.code === '23503' && /update or delete/i.test(error.message ?? '')) {
    return new AppError(
      'This record is still referenced by other data (for example dependencies or action items)',
      409,
      'RECORD_IN_USE',
      { constraint: error.constraint, table: error.table }
    );
  }
  return error;
}

export function errorHandler(rawError, _req, res, _next) {
  const error = fromPostgresError(rawError);
  const statusCode = error?.statusCode || 500;
  const code = error?.code || 'INTERNAL_SERVER_ERROR';
  const message = error?.message || 'An unexpected error occurred';
  const details = error?.details ?? null;

  const payload = {
    error: {
      code,
      message,
      details,
    },
  };

  res.status(statusCode).json(payload);
}
