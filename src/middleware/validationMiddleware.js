export const listValidationErrors = (issues) => {
  const validationErrors = {};
  for (const issue of issues) {
    const field = issue.path.join('.') || 'root';
    (validationErrors[field] ??= []).push(issue.message);
  }
  return validationErrors;
}

export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});

  if (!result.success) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: listValidationErrors(result.error.issues),
    });
  }

  req.body = result.data;
  next();
};

export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {});

  if (!result.success) {
    return res.status(400).json({
      status: 'fail',
      message: 'Validation failed',
      errors: listValidationErrors(result.error.issues),
    });
  }

  req.validatedQuery = result.data;
  next();
};
