const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  PERMISSIONS,
  canAccessDashboard,
  roleHasPermission,
} = require('./roles');

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token, unauthorized.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password -twoFactorCode');

    if (!user) return res.status(401).json({ message: 'User account no longer exists.' });
    if (user.status !== 'active') return res.status(403).json({ message: 'Account is not active.' });

    req.user = {
      userId: String(user._id),
      email: user.email,
      role: user.role,
    };
    req.currentUser = user;
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
}

function requireDashboardAccess(req, res, next) {
  if (canAccessDashboard(req.currentUser)) return next();
  return res.status(403).json({ message: 'Access denied: Requires dashboard privileges.' });
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.currentUser && roleHasPermission(req.currentUser.role, permission)) return next();
    return res.status(403).json({ message: `Access denied: Missing ${permission} permission.` });
  };
}

function requireSuperuser(req, res, next) {
  return requirePermission(PERMISSIONS.ACCESS_DJANGO_ADMIN)(req, res, next);
}

module.exports = {
  authMiddleware,
  requireDashboardAccess,
  requirePermission,
  requireSuperuser,
};
