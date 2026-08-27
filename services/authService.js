/**
 * Servicio de autenticación para administradores
 */

const bcrypt = require('bcryptjs');
const { runQuery, runExecute } = require('../db.js');
const { normalizeAdminRole } = require('../utils/adminRoles');

/**
 * Verificar credenciales del administrador contra la base de datos
 */
async function verifyAdminCredentials(username, password) {
  try {
    // Buscar admin activo por username
    const admin = await runQuery(
      'SELECT * FROM Admins WHERE username = ? AND is_active = 1',
      [username]
    );
    
    if (admin.length === 0) {
      return null; // Usuario no encontrado
    }
    
    const adminData = admin[0];
    
    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, adminData.password_hash);
    
    if (!isValidPassword) {
      return null; // Contraseña incorrecta
    }
    
    // Actualizar último login
    await runExecute(
      'UPDATE Admins SET last_login = datetime("now") WHERE admin_id = ?',
      [adminData.admin_id]
    );
    
    // Retornar datos del admin (sin el hash de la contraseña)
    const { password_hash, ...safeAdminData } = adminData;
    safeAdminData.role = normalizeAdminRole(safeAdminData.role);
    return safeAdminData;
    
  } catch (error) {
    console.error('[AUTH SERVICE] Error verificando credenciales:', error);
    return null;
  }
}

/**
 * Obtener información del admin por ID
 */
async function getAdminById(adminId) {
  try {
    const admin = await runQuery(
      'SELECT admin_id, username, email, full_name, role, must_change_password, is_active, last_login, created_at FROM Admins WHERE admin_id = ? AND is_active = 1',
      [adminId]
    );
    
    if (!admin.length) return null;
    return { ...admin[0], role: normalizeAdminRole(admin[0].role) };
  } catch (error) {
    console.error('[AUTH SERVICE] Error obteniendo admin:', error);
    return null;
  }
}

/**
 * Hash de password
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

module.exports = {
  verifyAdminCredentials,
  getAdminById,
  hashPassword
};
