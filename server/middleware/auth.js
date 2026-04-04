/**
 * Auth middleware — checks that a valid session exists.
 * Returns 401 if no active session.
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = requireAuth;
