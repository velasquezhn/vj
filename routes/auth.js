const express = require('express');
const router = express.Router();
const { generateToken, authenticateToken } = require('../middleware/auth');
const { verifyAdminCredentials, getAdminById } = require('../services/authService');
const { validateLogin } = require('../middleware/validation');
const { loginLimiter } = require('../middleware/security');
const { 
  validateAdminLogin, 
  sanitizeRequestData, 
  logAdminActivity 
} = require('../middleware/apiValidation');
const logger = require('../config/logger');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Authentication]
 *     summary: Login de administradores
 *     description: Autentica un usuario administrador y devuelve un token JWT
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *                 description: Nombre de usuario del administrador
 *               password:
 *                 type: string
 *                 format: password
 *                 example: use-a-secret-password-manager
 *                 description: Contraseña del administrador
 *     responses:
 *       200:
 *         description: Login exitoso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Login exitoso
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: admin
 *                         email:
 *                           type: string
 *                           example: admin@villasjulie.com
 *                         fullName:
 *                           type: string
 *                           example: Administrador Principal
 *                         role:
 *                           type: string
 *                           example: admin
 *                     expiresIn:
 *                       type: string
 *                       example: 24h
 *       401:
 *         description: Credenciales inválidas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Demasiados intentos de login
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/login', 
  sanitizeRequestData,
  loginLimiter, 
  validateAdminLogin, 
  logAdminActivity('admin_login'),
  async (req, res) => {
  try {
    const { username, password } = req.body;
    
    logger.info('Intento de login administrativo', { 
      username, 
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Verificar credenciales
    const adminData = await verifyAdminCredentials(username, password);
    
    if (!adminData) {
      logger.warn('Login administrativo fallido', { 
        username, 
        ip: req.ip,
        reason: 'Credenciales inválidas'
      });
      
      return res.status(401).json({
        success: false,
        message: 'Credenciales inválidas',
        error: 'INVALID_CREDENTIALS'
      });
    }
    
    // Generar token JWT
    const token = generateToken(adminData);
    
    logger.info('Login administrativo exitoso', { 
      username, 
      adminId: adminData.admin_id,
      ip: req.ip
    });
    
    res.json({
      success: true,
      message: 'Login exitoso',
      data: {
        token,
        user: {
          id: adminData.admin_id,
          username: adminData.username,
          email: adminData.email,
          fullName: adminData.full_name,
          role: 'admin'
        },
        expiresIn: '24h'
      }
    });
    
  } catch (error) {
    logger.error('Error crítico en login administrativo', { 
      error: error.message,
      stack: error.stack,
      username: req.body?.username,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * @swagger
 * /auth/verify:
 *   post:
 *     tags: [Authentication]
 *     summary: Verificar validez de token JWT
 *     description: Verifica si un token JWT es válido y no ha expirado
 *     requestBody:
 *       required: false
 *       description: El token se lee del header Authorization
 *     responses:
 *       200:
 *         description: Token válido
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Token válido
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         username:
 *                           type: string
 *                           example: admin
 *                         role:
 *                           type: string
 *                           example: admin
 *                     iat:
 *                       type: integer
 *                       example: 1691234567
 *                       description: Timestamp de emisión del token
 *       401:
 *         description: Token no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Token inválido o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security: []
 */
router.post('/verify', 
  sanitizeRequestData,
  logAdminActivity('token_verification'),
  async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      logger.warn('Verificación de token sin token', { ip: req.ip });
      return res.status(401).json({
        success: false,
        message: 'Token no proporcionado',
        error: 'NO_TOKEN'
      });
    }
    
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../middleware/auth');
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        logger.warn('Token inválido rechazado', { 
          ip: req.ip, 
          error: err.message 
        });
        
        return res.status(403).json({
          success: false,
          message: 'Token inválido o expirado',
          error: 'INVALID_TOKEN'
        });
      }
      
      logger.info('Token verificado exitosamente', { 
        username: user.username,
        ip: req.ip
      });
      
      res.json({
        success: true,
        message: 'Token válido',
        data: {
          user: {
            username: user.username,
            role: user.role
          },
          iat: user.iat
        }
      });
    });
    
  } catch (error) {
    logger.error('Error verificando token', { 
      error: error.message,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Authentication]
 *     summary: Obtener información del usuario autenticado
 *     description: Retorna la información completa del usuario administrador autenticado
 *     responses:
 *       200:
 *         description: Información del usuario obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: admin
 *                         email:
 *                           type: string
 *                           example: admin@villasjulie.com
 *                         fullName:
 *                           type: string
 *                           example: Administrador Principal
 *                         lastLogin:
 *                           type: string
 *                           format: date-time
 *                           example: 2024-08-04T10:30:00Z
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                           example: 2024-01-15T08:00:00Z
 *                         role:
 *                           type: string
 *                           example: admin
 *       401:
 *         description: Token no válido o no proporcionado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Usuario no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Error interno del servidor
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *     security:
 *       - bearerAuth: []
 */
router.get('/me', 
  authenticateToken, 
  logAdminActivity('get_profile'),
  async (req, res) => {
  try {
    const adminData = await getAdminById(req.user.adminId);
    
    if (!adminData) {
      logger.warn('Usuario autenticado no encontrado en BD', { 
        adminId: req.user.adminId 
      });
      
      return res.status(404).json({
        success: false,
        message: 'Usuario no encontrado',
        error: 'USER_NOT_FOUND'
      });
    }
    
    logger.info('Perfil administrativo consultado', { 
      adminId: adminData.admin_id,
      username: adminData.username
    });
    
    res.json({
      success: true,
      data: {
        user: {
          id: adminData.admin_id,
          username: adminData.username,
          email: adminData.email,
          fullName: adminData.full_name,
          lastLogin: adminData.last_login,
          createdAt: adminData.created_at,
          role: 'admin'
        }
      }
    });
  } catch (error) {
    logger.error('Error obteniendo perfil administrativo', { 
      error: error.message,
      adminId: req.user?.adminId
    });
    
    res.status(500).json({
      success: false,
      message: 'Error interno del servidor',
      error: 'INTERNAL_SERVER_ERROR'
    });
  }
});

module.exports = router;
