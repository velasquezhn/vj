const express = require('express');
const router = express.Router();
const { runQuery, runExecute } = require('../db');
const bcrypt = require('bcryptjs');
const { normalizeAdminRole, isValidAdminRole, ADMIN_ROLES } = require('../utils/adminRoles');

function passwordIsStrong(password) {
  return typeof password === 'string' && password.length >= 10 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function activeSuperadminCount(excludeId = null) {
  const rows = await runQuery(`SELECT COUNT(*) AS count FROM Admins
    WHERE is_active = 1 AND lower(replace(role, '-', '_')) IN ('superadmin', 'super_admin')
    ${excludeId == null ? '' : 'AND admin_id != ?'}`, excludeId == null ? [] : [excludeId]);
  return Number(rows[0]?.count || 0);
}

// GET / - Obtener todos los administradores
router.get('/', async (req, res) => {
  try {
    const admins = await runQuery(`
      SELECT admin_id as id, username, email, full_name, role, is_active, created_at, updated_at 
      FROM Admins 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      data: admins,
      total: admins.length
    });
  } catch (error) {
    console.error('Error obteniendo administradores:', error);
    res.status(500).json({
      success: false,
      message: 'Error obteniendo administradores',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// POST / - Crear nuevo administrador
router.post('/', async (req, res) => {
  try {
    const { username, email, fullName, password, role = 'admin' } = req.body;
    if (!isValidAdminRole(role)) {
      return res.status(400).json({ success: false, message: 'Rol administrativo inválido' });
    }
    const normalizedRole = normalizeAdminRole(role);
    
    // Validaciones
    if (!username || !password || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username, email y contraseña son requeridos'
      });
    }
    
    // Verificar que el username no exista
    const existingUser = await runQuery(
      'SELECT admin_id FROM Admins WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El username o email ya existe'
      });
    }
    
    // Validar contraseña
    if (!passwordIsStrong(password)) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 10 caracteres, letras y números'
      });
    }
    
    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    
    // Insertar nuevo admin
    const result = await runExecute(`
      INSERT INTO Admins (username, email, full_name, password_hash, role, is_active, must_change_password, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
    `, [username, email, fullName || username, hashedPassword, normalizedRole]);
    
    if (result.lastID) {
      res.json({
        success: true,
        message: 'Administrador creado exitosamente',
        data: {
          id: result.lastID,
          username,
          email,
          fullName: fullName || username,
          role: normalizedRole,
          mustChangePassword: true
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error creando administrador'
      });
    }
    
  } catch (error) {
    console.error('Error creando administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// PUT /:id/password - Cambiar contraseña de administrador
router.put('/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    const adminId = req.user.adminId; // Del token JWT
    
    // Validaciones
    if (!newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Nueva contraseña es requerida'
      });
    }
    
    if (!passwordIsStrong(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'La contraseña debe tener al menos 10 caracteres, letras y números'
      });
    }
    
    // Si el admin está cambiando su propia contraseña, verificar la actual
    if (parseInt(id) === adminId) {
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Contraseña actual es requerida'
        });
      }
      
      const admin = await runQuery(
        'SELECT password_hash FROM Admins WHERE admin_id = ?',
        [id]
      );
      
      if (admin.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Administrador no encontrado'
        });
      }
      
      const validPassword = await bcrypt.compare(currentPassword, admin[0].password_hash);
      if (!validPassword) {
        return res.status(400).json({
          success: false,
          message: 'Contraseña actual incorrecta'
        });
      }
    }
    
    // Hash nueva contraseña
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    
    // Actualizar contraseña
    const result = await runExecute(
      'UPDATE Admins SET password_hash = ?, must_change_password = ?, token_version = token_version + 1, updated_at = datetime("now") WHERE admin_id = ?',
      [hashedPassword, parseInt(id) === adminId ? 0 : 1, id]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }
    
  } catch (error) {
    console.error('Error actualizando contraseña:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PUT /:id - Actualizar datos de administrador
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email, fullName, role } = req.body;
    if (!isValidAdminRole(role)) {
      return res.status(400).json({ success: false, message: 'Rol administrativo inválido' });
    }
    const normalizedRole = normalizeAdminRole(role);
    
    // Validaciones
    if (!username || !email) {
      return res.status(400).json({
        success: false,
        message: 'Username y email son requeridos'
      });
    }
    
    // Verificar que el username/email no exista en otro admin
    const existingUser = await runQuery(
      'SELECT admin_id FROM Admins WHERE (username = ? OR email = ?) AND admin_id != ?',
      [username, email, id]
    );
    
    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'El username o email ya existe'
      });
    }
    
    const currentRows = await runQuery('SELECT role FROM Admins WHERE admin_id = ?', [id]);
    if (!currentRows.length) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    if (normalizeAdminRole(currentRows[0].role) === ADMIN_ROLES.SUPERADMIN && normalizedRole !== ADMIN_ROLES.SUPERADMIN && await activeSuperadminCount(Number(id)) === 0) {
      return res.status(409).json({ success: false, message: 'No se puede degradar el último superadministrador activo' });
    }

    // Actualizar datos
    const result = await runExecute(`
      UPDATE Admins 
      SET username = ?, email = ?, full_name = ?, role = ?, updated_at = datetime('now')
      WHERE admin_id = ?
    `, [username, email, fullName || username, normalizedRole, id]);
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: 'Administrador actualizado exitosamente'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }
    
  } catch (error) {
    console.error('Error actualizando administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// PATCH /:id/toggle - Activar/desactivar administrador
router.patch('/:id/toggle', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const adminId = req.user.adminId; // Del token JWT
    
    // No permitir que un admin se desactive a sí mismo
    if (parseInt(id) === adminId && !isActive) {
      return res.status(400).json({
        success: false,
        message: 'No puedes desactivar tu propia cuenta'
      });
    }
    
    const targetRows = await runQuery('SELECT role FROM Admins WHERE admin_id = ?', [id]);
    if (!targetRows.length) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    if (!isActive && normalizeAdminRole(targetRows[0].role) === ADMIN_ROLES.SUPERADMIN && await activeSuperadminCount(Number(id)) === 0) {
      return res.status(409).json({ success: false, message: 'No se puede desactivar el último superadministrador activo' });
    }

    const result = await runExecute(
      'UPDATE Admins SET is_active = ?, updated_at = datetime("now") WHERE admin_id = ?',
      [isActive ? 1 : 0, id]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: `Administrador ${isActive ? 'activado' : 'desactivado'} exitosamente`
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }
    
  } catch (error) {
    console.error('Error cambiando estado del administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

// DELETE /:id - Eliminar administrador (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.adminId; // Del token JWT
    
    // No permitir que un admin se elimine a sí mismo
    if (parseInt(id) === adminId) {
      return res.status(400).json({
        success: false,
        message: 'No puedes eliminar tu propia cuenta'
      });
    }
    
    const targetRows = await runQuery('SELECT role FROM Admins WHERE admin_id = ?', [id]);
    if (!targetRows.length) return res.status(404).json({ success: false, message: 'Administrador no encontrado' });
    if (normalizeAdminRole(targetRows[0].role) === ADMIN_ROLES.SUPERADMIN && await activeSuperadminCount(Number(id)) === 0) {
      return res.status(409).json({ success: false, message: 'No se puede eliminar el último superadministrador activo' });
    }

    // Verificar que no sea el último admin activo
    const activeAdmins = await runQuery(
      'SELECT COUNT(*) as count FROM Admins WHERE is_active = 1 AND admin_id != ?',
      [id]
    );
    
    if (activeAdmins[0].count === 0) {
      return res.status(400).json({
        success: false,
        message: 'No se puede eliminar el último administrador activo'
      });
    }
    
    // Soft delete - desactivar en lugar de eliminar
    const result = await runExecute(
      'UPDATE Admins SET is_active = 0, updated_at = datetime("now") WHERE admin_id = ?',
      [id]
    );
    
    if (result.changes > 0) {
      res.json({
        success: true,
        message: 'Administrador eliminado exitosamente'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Administrador no encontrado'
      });
    }
    
  } catch (error) {
    console.error('Error eliminando administrador:', error);
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor'
    });
  }
});

module.exports = router;
