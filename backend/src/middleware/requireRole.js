/**
 * Role-based authorization middleware.
 * Verifies req.user.role matches the required role.
 *
 * @param {string|string[]} allowedRoles
 */
function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires role [${roles.join(', ')}], but current user has [${req.user.role || 'none'}]`,
      });
    }

    next();
  };
}

module.exports = requireRole;
