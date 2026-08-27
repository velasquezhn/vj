const { runExecute } = require('../db');
const logger = require('../config/logger');
const { normalizeAdminRole } = require('../utils/adminRoles');

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function adminAudit(req, res, next) {
  if (!MUTATING_METHODS.has(req.method)) return next();

  res.once('finish', () => {
    if (!req.user?.adminId) return;
    runExecute(`INSERT INTO AdminAuditLogs
      (admin_id, username, role, method, path, status_code, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      req.user.adminId,
      req.user.username || null,
      normalizeAdminRole(req.user.role),
      req.method,
      String(req.originalUrl || req.path).slice(0, 500),
      res.statusCode,
      String(req.ip || '').slice(0, 100),
      String(req.get('User-Agent') || '').slice(0, 500)
    ]).catch((error) => logger.error('No se pudo registrar auditoría administrativa', {
      error: error.message,
      adminId: req.user.adminId,
      path: req.originalUrl
    }));
  });
  next();
}

module.exports = { adminAudit };
