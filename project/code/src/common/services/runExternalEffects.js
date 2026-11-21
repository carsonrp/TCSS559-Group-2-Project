import AppError from '../errors/AppError.js';

export async function runExternalEffects(effects) {
  const results = await Promise.allSettled(effects.map((effect) => Promise.resolve().then(effect)));
  const failures = results.flatMap((result) => result.status === 'rejected'
    ? [{
      code: result.reason?.code ?? 'EXTERNAL_SERVICE_ERROR',
      message: result.reason?.message ?? 'An external service request failed',
    }]
    : []);

  if (failures.length > 0) {
    throw new AppError(
      'The database change was committed, but one or more external integrations failed',
      502,
      'EXTERNAL_INTEGRATION_FAILED',
      { failures }
    );
  }
  return results.map((result) => result.value);
}

export default runExternalEffects;
