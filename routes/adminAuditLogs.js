const express = require('express');
const { runQuery } = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const rows = await runQuery(`SELECT audit_id AS id, admin_id, username, role, method, path,
      status_code, ip_address, user_agent, created_at
      FROM AdminAuditLogs ORDER BY audit_id DESC LIMIT ? OFFSET ?`, [limit, offset]);
    const count = await runQuery('SELECT COUNT(*) AS total FROM AdminAuditLogs');
    return res.json({ success: true, data: rows, total: Number(count[0]?.total || 0), limit, offset });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'No se pudo consultar la auditoría' });
  }
});

module.exports = router;
