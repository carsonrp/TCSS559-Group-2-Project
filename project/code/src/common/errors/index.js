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

export function errorHandler(error, _req, res, _next) {
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
