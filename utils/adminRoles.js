const ADMIN_ROLES = Object.freeze({
  ADMIN: 'admin',
  SUPERADMIN: 'superadmin'
});

function normalizeAdminRole(value, fallback = ADMIN_ROLES.ADMIN) {
  const role = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['superadmin', 'super_admin'].includes(role)) return ADMIN_ROLES.SUPERADMIN;
  if (role === ADMIN_ROLES.ADMIN) return ADMIN_ROLES.ADMIN;
  return fallback;
}

function isValidAdminRole(value) {
  const raw = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['admin', 'superadmin', 'super_admin'].includes(raw);
}

module.exports = { ADMIN_ROLES, normalizeAdminRole, isValidAdminRole };
