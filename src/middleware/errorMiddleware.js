export const createErrorHandler = () => (err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.statusCode === 401 && req.accepts(['json', 'html']) === 'html')
    return res.redirect('/login.html');

  if (err.statusCode && err.message)
    return res.status(err.statusCode).json(err.message);

  console.error(err);

  return res.status(500).json({ error: 'Internal server error' });
};