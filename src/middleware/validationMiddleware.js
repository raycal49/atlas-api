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

  // 
  // upon faliure, we return an object that looks like so
  /* response.body.errors.username or response.body.errors.email or response.body.errors.password
  {
    "status": "fail",
    "message": "Validation failed",
    "errors": {
      "username": ["Invalid uername"]
      "email": ["Invalid email address"],
      "password": ["Must be at least 8 characters", "Must contain a number"]
    }
  }
  */

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

// same contract as validate, for the query string instead of the body.
// the parsed result goes on req.validatedQuery rather than back onto req.query:
// in Express 5 req.query is a getter, so assigning to it throws
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
