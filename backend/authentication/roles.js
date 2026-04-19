const ROLES = Object.freeze({
  USER: 'user',
  ADMIN: 'admin',
  SUPERUSER: 'superuser',
});

const ROLE_LABELS = Object.freeze({
  [ROLES.USER]: 'Standard User',
  [ROLES.ADMIN]: 'Operations Admin',
  [ROLES.SUPERUSER]: 'Superuser',
});

const PERMISSIONS = Object.freeze({
  VIEW_DASHBOARD: 'view_dashboard',
  MANAGE_USERS: 'manage_users',
  MANAGE_RECYCLE_BIN: 'manage_recycle_bin',
  VIEW_ANALYTICS: 'view_analytics',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  ACCESS_DJANGO_ADMIN: 'access_django_admin',
});

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.USER]: [],
  [ROLES.ADMIN]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_RECYCLE_BIN,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
  ],
  [ROLES.SUPERUSER]: [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_RECYCLE_BIN,
    PERMISSIONS.VIEW_ANALYTICS,
    PERMISSIONS.VIEW_AUDIT_LOGS,
    PERMISSIONS.ACCESS_DJANGO_ADMIN,
  ],
});

function normalizeRole(role) {
  return Object.values(ROLES).includes(role) ? role : ROLES.USER;
}

function roleHasPermission(role, permission) {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission);
}

function getRolePermissions(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)];
}

function canAccessDashboard(user) {
  return Boolean(user && user.status === 'active' && roleHasPermission(user.role, PERMISSIONS.VIEW_DASHBOARD));
}

function canManageTargetUser(actor, targetUser, nextRole) {
  if (!actor || !targetUser) return false;
  if (actor.role !== ROLES.SUPERUSER) return false;

  if (String(actor._id) === String(targetUser._id) && nextRole && nextRole !== ROLES.SUPERUSER) {
    return false;
  }

  return true;
}

module.exports = {
  ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  normalizeRole,
  roleHasPermission,
  getRolePermissions,
  canAccessDashboard,
  canManageTargetUser,
};
