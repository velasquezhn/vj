/**
 * Middleware de autenticación JWT - Versión mejorada con seguridad avanzada
 * Bot VJ - Sistema de Reservas Villas Julie
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const logger = require('../config/logger');

// Clave secreta para JWT (OBLIGATORIO de variables de entorno)
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  logger.error('❌ CRITICAL ERROR: JWT_SECRET no está definido en las variables de entorno');
  logger.error('💡 Crea un archivo .env basado en .env.example y define JWT_SECRET');
  process.exit(1);
}

// Lista de tokens revocados (en producción usar Redis)
const revokedTokens = new Set();

// Store para refresh tokens
const refreshTokens = new Map();

class JWTSecurity {
  /**
   * Generar token con refresh token incluido
   */
  static generateTokenPair(adminData) {
    const payload = {
      adminId: adminData.admin_id,
      username: adminData.username,
      role: adminData.role || 'admin',
      iat: Math.floor(Date.now() / 1000),
      jti: this.generateJTI(),
      tokenVersion: 1 // Para invalidar todos los tokens de un usuario
    };
    
    // Access token (corta duración)
    const accessToken = jwt.sign(payload, JWT_SECRET, { 
      expiresIn: '15m', // 15 minutos
      issuer: 'villas-julie-admin',
      audience: 'villas-julie-dashboard'
    });

    // Refresh token (larga duración)
    const refreshToken = this.generateRefreshToken(adminData.admin_id);
    
    logger.info('Token pair generado', {
      adminId: payload.adminId,
      username: payload.username,
      role: payload.role,
      jti: payload.jti,
      accessTokenExpiry: '15m',
      refreshTokenExpiry: '7d'
    });
    
    return { accessToken, refreshToken };
  }

  /**
   * Generar refresh token seguro
   */
  static generateRefreshToken(adminId) {
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 días
    
    refreshTokens.set(refreshToken, {
      adminId,
      expiresAt,
      used: false
    });
    
    // Limpiar refresh token expirado
    setTimeout(() => {
      refreshTokens.delete(refreshToken);
    }, 7 * 24 * 60 * 60 * 1000);
    
    return refreshToken;
  }

  /**
   * Validar y renovar token usando refresh token
   */
  static refreshAccessToken(refreshToken, adminData) {
    const tokenData = refreshTokens.get(refreshToken);
    
    if (!tokenData || tokenData.used || Date.now() > tokenData.expiresAt) {
      logger.warn('Intento de uso de refresh token inválido', {
        token: refreshToken.substring(0, 8) + '...',
        valid: !!tokenData,
        used: tokenData?.used,
        expired: tokenData ? Date.now() > tokenData.expiresAt : 'unknown'
      });
      return null;
    }
    
    // Marcar como usado (one-time use)
    tokenData.used = true;
    
    // Generar nuevo par de tokens
    return this.generateTokenPair(adminData);
  }

  /**
   * Generar JWT ID único
   */
  static generateJTI() {
    return Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  }

  /**
   * Validar fortaleza del token
   */
  static validateTokenSecurity(token) {
    try {
      const decoded = jwt.decode(token, { complete: true });
      
      // Verificar algoritmo de firma
      if (decoded.header.alg !== 'HS256') {
        return { valid: false, reason: 'Invalid algorithm' };
      }
      
      // Verificar claims necesarios
      const requiredClaims = ['adminId', 'username', 'role', 'iat', 'exp', 'jti'];
      const missingClaims = requiredClaims.filter(claim => !(claim in decoded.payload));
      
      if (missingClaims.length > 0) {
        return { valid: false, reason: `Missing claims: ${missingClaims.join(', ')}` };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, reason: error.message };
    }
  }
}

/**
 * Middleware para verificar token JWT con logging de seguridad
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  const clientIP = req.ip || req.connection.remoteAddress;

  if (!token) {
    logger.warn('Intento de acceso sin token', {
      ip: clientIP,
      userAgent: req.get('User-Agent'),
      endpoint: req.originalUrl,
      method: req.method
    });
    
    return res.status(401).json({ 
      success: false, 
      message: 'Token de acceso requerido',
      error: 'MISSING_TOKEN'
    });
  }

  // Verificar si el token está revocado
  if (revokedTokens.has(token)) {
    logger.warn('Intento de uso de token revocado', {
      ip: clientIP,
      endpoint: req.originalUrl
    });
    
    return res.status(401).json({ 
      success: false, 
      message: 'Token revocado',
      error: 'REVOKED_TOKEN'
    });
  }

  jwt.verify(token, JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: 'villas-julie-admin',
    audience: 'villas-julie-dashboard'
  }, (err, user) => {
    if (err) {
      logger.warn('Token JWT inválido', {
        ip: clientIP,
        error: err.message,
        endpoint: req.originalUrl,
        tokenPreview: token.substring(0, 10) + '...'
      });
      
      return res.status(403).json({ 
        success: false, 
        message: 'Token inválido',
        error: 'INVALID_TOKEN'
      });
    }
    
    // Log acceso exitoso
    logger.info('Acceso autenticado exitoso', {
      userId: user.adminId,
      username: user.username,
      ip: clientIP,
      endpoint: req.originalUrl,
      method: req.method
    });
    
    req.user = user;
    req.authToken = token; // Guardar token para posible revocación
    next();
  });
}

/**
 * Middleware de autorización por roles
 */
function authorizeRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      logger.error('authorizeRole llamado sin usuario autenticado');
      return res.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
        error: 'NOT_AUTHENTICATED'
      });
    }

    const userRole = req.user.role || 'guest';
    const hasPermission = allowedRoles.includes(userRole) || allowedRoles.includes('*');

    if (!hasPermission) {
      logger.warn('Acceso denegado por permisos insuficientes', {
        userId: req.user.adminId,
        username: req.user.username,
        userRole: userRole,
        requiredRoles: allowedRoles,
        endpoint: req.originalUrl,
        method: req.method,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        message: 'Permisos insuficientes',
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    logger.debug('Autorización exitosa', {
      userId: req.user.adminId,
      userRole: userRole,
      endpoint: req.originalUrl
    });

    next();
  };
}

/**
 * Generar token JWT con información mejorada
 */
function generateToken(adminData) {
  const payload = {
    adminId: adminData.admin_id,
    username: adminData.username,
    role: adminData.role || 'admin',
    iat: Math.floor(Date.now() / 1000),
    jti: generateJTI() // JWT ID único para tracking
  };
  
  logger.info('Token JWT generado', {
    adminId: payload.adminId,
    username: payload.username,
    role: payload.role,
    jti: payload.jti
  });
  
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: '24h',
    issuer: 'villas-julie-admin',
    audience: 'villas-julie-dashboard'
  });
}

/**
 * Revocar token (logout)
 */
function revokeToken(token) {
  if (token) {
    revokedTokens.add(token);
    
    // En producción, esto debería ir a Redis con TTL
    // Limpiar tokens expirados cada hora
    setTimeout(() => {
      revokedTokens.delete(token);
    }, 24 * 60 * 60 * 1000); // 24 horas
    
    logger.info('Token revocado exitosamente', {
      tokenPreview: token.substring(0, 10) + '...'
    });
  }
}

/**
 * Generar JWT ID único
 */
function generateJTI() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Middleware de rate limiting por usuario
 */
function rateLimitByUser(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  const userRequests = new Map();
  
  return (req, res, next) => {
    if (!req.user) return next();
    
    const userId = req.user.adminId;
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    const windowStart = now - windowMs;
    
    // Limpiar requests antiguos
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= maxRequests) {
      logger.warn('Rate limit excedido', {
        userId: userId,
        requestCount: validRequests.length,
        maxRequests: maxRequests,
        ip: req.ip
      });
      
      return res.status(429).json({
        success: false,
        message: 'Demasiadas solicitudes. Intenta más tarde.',
        error: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    validRequests.push(now);
    userRequests.set(userId, validRequests);
    
    next();
  };
}

// Exportar funciones mejoradas
module.exports = {
  authenticateToken,
  authorizeRole,
  generateToken,
  revokeToken,
  rateLimitByUser,
  JWT_SECRET
};
