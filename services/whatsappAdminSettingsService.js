const db = require('../db');
const { normalizeRecipient } = require('./whatsappCloudService');

function validatePhone(value) {
  const phone = normalizeRecipient(value);
  if (!/^\d{8,15}$/.test(phone)) {
    const error = new Error('El número debe incluir código de país y contener entre 8 y 15 dígitos');
    error.code = 'INVALID_PHONE';
    throw error;
  }
  return phone;
}

async function listAdmins() {
  return db.runQuery(`SELECT whatsapp_admin_id AS id, phone_number, display_name, is_active,
    created_at, updated_at FROM WhatsAppAdmins ORDER BY display_name, phone_number`);
}

async function activeAdminNumbers() {
  const rows = await db.runQuery('SELECT phone_number FROM WhatsAppAdmins WHERE is_active = 1');
  return rows.map((row) => row.phone_number);
}

async function createAdmin({ phone_number, display_name = '' }) {
  const phone = validatePhone(phone_number);
  const result = await db.runExecute(
    `INSERT INTO WhatsAppAdmins (phone_number, display_name, is_active)
     VALUES (?, ?, 1)`,
    [phone, String(display_name).trim().slice(0, 80)]
  );
  return (await db.runQuery('SELECT * FROM WhatsAppAdmins WHERE whatsapp_admin_id = ?', [result.lastID]))[0];
}

async function updateAdmin(id, { phone_number, display_name = '', is_active = true }) {
  const phone = validatePhone(phone_number);
  const result = await db.runExecute(
    `UPDATE WhatsAppAdmins SET phone_number = ?, display_name = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
     WHERE whatsapp_admin_id = ?`,
    [phone, String(display_name).trim().slice(0, 80), is_active ? 1 : 0, id]
  );
  return result.changes ? (await db.runQuery('SELECT * FROM WhatsAppAdmins WHERE whatsapp_admin_id = ?', [id]))[0] : null;
}

async function deleteAdmin(id) {
  return (await db.runExecute('DELETE FROM WhatsAppAdmins WHERE whatsapp_admin_id = ?', [id])).changes > 0;
}

module.exports = { validatePhone, listAdmins, activeAdminNumbers, createAdmin, updateAdmin, deleteAdmin };
