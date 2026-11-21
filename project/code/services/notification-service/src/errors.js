export class ServiceError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON', details: null },
    });
  }
  if (!error.statusCode || error.statusCode >= 500) {
    console.error('Notification Service request failed:', error);
  }
  return res.status(error.statusCode || 500).json({
    error: {
      code: error.code || 'INTERNAL_SERVER_ERROR',
      message: error.statusCode ? error.message : 'An unexpected error occurred',
      details: error.details ?? null,
    },
  });
}
