/**
 * 🔐 GENERADOR Y VALIDADOR DE CÓDIGOS DE CONFIRMACIÓN
 * Sistema seguro para códigos de reservas y confirmaciones
 */

const crypto = require('crypto');

// Configuración de códigos
const CODE_CONFIG = {
  length: 8,
  expirationHours: 24,
  secretKey: process.env.JWT_SECRET
};

/**
 * Generar código de confirmación
 * @param {string} phoneNumber - Número de teléfono
 * @param {string} context - Contexto adicional (fecha, etc.)
 * @returns {string} Código de confirmación
 */
function generate(phoneNumber, context = '') {
  try {
    const timestamp = Date.now();
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    
    // Crear hash base
    const baseData = `${cleanPhone}${context}${timestamp}`;
    const hash = crypto
      .createHmac('sha256', CODE_CONFIG.secretKey)
      .update(baseData)
      .digest('hex');
    
    // Generar código alfanumérico de 8 caracteres
    const codeChars = hash.substring(0, 6).toUpperCase();
    const checksum = generateChecksum(codeChars, timestamp);
    
    const code = `${codeChars}${checksum}`;
    
    console.log(`✅ Código generado: ${code} para ${phoneNumber}`);
    return code;
    
  } catch (error) {
    console.error('❌ Error generando código:', error);
    return generateFallbackCode();
  }
}

/**
 * Validar código de confirmación
 * @param {string} code - Código a validar
 * @param {string} phoneNumber - Número de teléfono
 * @param {string} context - Contexto usado en generación
 * @param {number} maxAgeHours - Edad máxima en horas (default: 24)
 * @returns {boolean} true si el código es válido
 */
function validate(code, phoneNumber, context = '', maxAgeHours = 24) {
  try {
    if (!code || code.length !== CODE_CONFIG.length) {
      return false;
    }
    
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    const codeUpper = code.toUpperCase();
    
    // Validar formato básico
    if (!/^[A-F0-9]{8}$/.test(codeUpper)) {
      return false;
    }
    
    // Extraer partes del código
    const codeChars = codeUpper.substring(0, 6);
    const providedChecksum = codeUpper.substring(6, 8);
    
    // Probar diferentes timestamps en el rango válido
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convertir a ms
    
    // Buscar en ventana de tiempo (en intervalos de 1 minuto hacia atrás)
    for (let offset = 0; offset < maxAge; offset += 60000) {
      const testTimestamp = now - offset;
      const baseData = `${cleanPhone}${context}${testTimestamp}`;
      
      const hash = crypto
        .createHmac('sha256', CODE_CONFIG.secretKey)
        .update(baseData)
        .digest('hex');
      
      const expectedCodeChars = hash.substring(0, 6).toUpperCase();
      const expectedChecksum = generateChecksum(expectedCodeChars, testTimestamp);
      
      if (codeChars === expectedCodeChars && providedChecksum === expectedChecksum) {
        console.log(`✅ Código válido: ${code} para ${phoneNumber}`);
        return true;
      }
    }
    
    console.log(`❌ Código inválido: ${code} para ${phoneNumber}`);
    return false;
    
  } catch (error) {
    console.error('❌ Error validando código:', error);
    return false;
  }
}

/**
 * Generar código de reservación único
 * @param {string} prefix - Prefijo del código (default: 'VJ')
 * @returns {string} Código de reservación
 */
function generateReservationCode(prefix = 'VJ') {
  try {
    const timestamp = Date.now().toString().slice(-6); // Últimos 6 dígitos
    const random = crypto.randomBytes(2).toString('hex').toUpperCase();
    const sequence = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    
    return `${prefix}${timestamp}${random}${sequence}`;
    
  } catch (error) {
    console.error('❌ Error generando código de reservación:', error);
    return `${prefix}${Date.now().toString().slice(-8)}`;
  }
}

/**
 * Validar código de reservación
 * @param {string} code - Código de reservación
 * @returns {Object} Información de validación
 */
function validateReservationCode(code) {
  try {
    if (!code || typeof code !== 'string') {
      return { valid: false, reason: 'Código vacío o inválido' };
    }
    
    const cleanCode = code.toUpperCase().trim();
    
    // Formato esperado: VJ + 6 dígitos timestamp + 4 caracteres hex + 2 dígitos
    const format1 = /^VJ\d{6}[A-F0-9]{4}\d{2}$/; // Formato nuevo
    const format2 = /^VJ\d{6}[A-Z0-9]{3}$/; // Formato legacy
    
    if (!format1.test(cleanCode) && !format2.test(cleanCode)) {
      return { 
        valid: false, 
        reason: 'Formato de código inválido. Debe ser como VJ123456AB01' 
      };
    }
    
    // Extraer timestamp para validar edad
    const timestampStr = cleanCode.substring(2, 8);
    const codeTimestamp = parseInt('1' + timestampStr + '000'); // Reconstruir timestamp
    const now = Date.now();
    const ageHours = (now - codeTimestamp) / (1000 * 60 * 60);
    
    // Códigos válidos por máximo 1 año
    if (ageHours > 8760) { // 365 días * 24 horas
      return { 
        valid: false, 
        reason: 'Código expirado (más de 1 año)' 
      };
    }
    
    return {
      valid: true,
      code: cleanCode,
      generated: new Date(codeTimestamp),
      ageHours: Math.round(ageHours * 100) / 100
    };
    
  } catch (error) {
    console.error('❌ Error validando código de reservación:', error);
    return { valid: false, reason: 'Error interno en validación' };
  }
}

/**
 * Generar checksum para códigos
 * @param {string} data - Datos para checksum
 * @param {number} timestamp - Timestamp
 * @returns {string} Checksum de 2 caracteres
 */
function generateChecksum(data, timestamp) {
  try {
    const combined = `${data}${timestamp}`;
    const hash = crypto
      .createHash('md5')
      .update(combined)
      .digest('hex');
    return hash.substring(0, 2).toUpperCase();
  } catch (error) {
    console.error('❌ Error generando checksum:', error);
    return '00';
  }
}

/**
 * Generar código de respaldo simple
 * @returns {string} Código de respaldo
 */
function generateFallbackCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < CODE_CONFIG.length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generar código PIN numérico
 * @param {number} length - Longitud del PIN (default: 4)
 * @returns {string} PIN numérico
 */
function generatePIN(length = 4) {
  try {
    let pin = '';
    for (let i = 0; i < length; i++) {
      pin += Math.floor(Math.random() * 10).toString();
    }
    return pin;
  } catch (error) {
    console.error('❌ Error generando PIN:', error);
    return '0000';
  }
}

/**
 * Verificar si un código tiene formato válido
 * @param {string} code - Código a verificar
 * @returns {boolean} true si el formato es válido
 */
function hasValidFormat(code) {
  try {
    if (!code || typeof code !== 'string') return false;
    
    const cleanCode = code.toUpperCase().trim();
    return /^[A-Z0-9]{6,12}$/.test(cleanCode);
  } catch (error) {
    return false;
  }
}

/**
 * Obtener información de un código
 * @param {string} code - Código a analizar
 * @returns {Object} Información del código
 */
function getCodeInfo(code) {
  try {
    const cleanCode = code.toUpperCase().trim();
    
    return {
      code: cleanCode,
      length: cleanCode.length,
      hasNumbers: /\d/.test(cleanCode),
      hasLetters: /[A-Z]/.test(cleanCode),
      isReservationCode: cleanCode.startsWith('VJ'),
      format: cleanCode.length === 8 ? 'confirmation' : 
              cleanCode.startsWith('VJ') ? 'reservation' : 'unknown'
    };
  } catch (error) {
    return { code: '', length: 0, format: 'error' };
  }
}

module.exports = {
  generate,
  validate,
  generateReservationCode,
  validateReservationCode,
  generatePIN,
  hasValidFormat,
  getCodeInfo
};
