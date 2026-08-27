const moment = require('moment');
require('moment/locale/es');
const db = require('../db');

/**
 * Servicio para manejar los tipos de cabañas del menú
 * Utiliza la tabla CabinTypes que es administrable por separado
 */

// Cargar tipos de cabañas para el menú desde tabla CabinTypes
const loadMenuCabinTypes = async () => {
  try {
    console.log('[DEBUG] Cargando tipos de cabañas desde tabla CabinTypes...');
    
    const types = await db.runQuery(`
      SELECT 
        type_id,
        type_key,
        nombre,
        tipo,
        capacidad,
        habitaciones,
        baños,
        precio_noche,
        moneda,
        fotos,
        comodidades,
        ubicacion,
        descripcion,
        orden,
        activo
      FROM CabinTypes 
      WHERE activo = true 
      ORDER BY orden ASC
    `);
    
    console.log(`[DEBUG] Encontrados ${types.length} tipos activos`);
    
    // Convertir datos JSON strings de vuelta a objetos
    const typesFormatted = types.map(type => ({
      ...type,
      // Campos para compatibilidad con el código existente
      id: `cab_type_${type.type_key}`,
      nombre: type.nombre,
      tipo: type.tipo,
      capacidad: type.capacidad,
      habitaciones: type.habitaciones,
      baños: type.baños,
      precio_noche: type.precio_noche,
      moneda: type.moneda,
      fotos: safeJson(type.fotos, []),
      comodidades: safeJson(type.comodidades, []),
      ubicacion: safeJson(type.ubicacion, {}),
      activo: Boolean(type.activo),
      descripcion: type.descripcion,
      reservas: [] // Siempre vacío para tipos de menú
    }));
    
    console.log('[DEBUG] Tipos formateados para compatibilidad:', typesFormatted.map(t => t.nombre));
    return typesFormatted;
    
  } catch (e) {
    console.error('Error loading menu cabin types from CabinTypes table:', e);
    console.error('❌ CRÍTICO: No se pudo cargar tipos de menú desde base de datos');
    console.error('   Asegúrate de que la tabla CabinTypes existe y tiene datos');
    return [];
  }
};

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

// Obtener un tipo específico por clave
const getCabinTypeByKey = async (typeKey) => {
  try {
    const type = await db.runQuery(
      'SELECT * FROM CabinTypes WHERE type_key = ? AND activo = true',
      [typeKey]
    );
    
    if (type.length > 0) {
      const typeData = type[0];
      return {
        ...typeData,
        fotos: safeJson(typeData.fotos, []),
        comodidades: safeJson(typeData.comodidades, []),
        ubicacion: safeJson(typeData.ubicacion, {}),
        activo: Boolean(typeData.activo)
      };
    }
    return null;
  } catch (e) {
    console.error('Error getting cabin type by key:', e);
    return null;
  }
};

// Activar/desactivar un tipo de cabaña
const toggleCabinType = async (typeKey, activo) => {
  try {
    const result = await db.runExecute(
      'UPDATE CabinTypes SET activo = ?, updated_at = CURRENT_TIMESTAMP WHERE type_key = ?',
      [activo, typeKey]
    );
    return result.changes > 0;
  } catch (e) {
    console.error('Error toggling cabin type:', e);
    return false;
  }
};

// Actualizar un tipo de cabaña
const updateCabinType = async (typeKey, updateData) => {
  try {
    const fields = [];
    const values = [];
    
    // Campos que se pueden actualizar
    const allowedFields = ['nombre', 'tipo', 'capacidad', 'habitaciones', 'baños', 'precio_noche', 'descripcion', 'orden'];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updateData[field]);
      }
    });
    
    // Campos especiales que requieren JSON.stringify
    if (updateData.fotos) {
      fields.push('fotos = ?');
      values.push(JSON.stringify(updateData.fotos));
    }
    
    if (updateData.comodidades) {
      fields.push('comodidades = ?');
      values.push(JSON.stringify(updateData.comodidades));
    }
    
    if (updateData.ubicacion) {
      fields.push('ubicacion = ?');
      values.push(JSON.stringify(updateData.ubicacion));
    }
    
    if (fields.length === 0) return false;
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(typeKey);
    
    const sql = `UPDATE CabinTypes SET ${fields.join(', ')} WHERE type_key = ?`;
    return (await db.runExecute(sql, values)).changes > 0;
  } catch (e) {
    console.error('Error updating cabin type:', e);
    return false;
  }
};

// Crear un nuevo tipo de cabaña
const createCabinType = async (typeData) => {
  try {
    const sql = `
      INSERT INTO CabinTypes (
        type_key, nombre, tipo, capacidad, habitaciones, baños,
        precio_noche, moneda, fotos, comodidades, ubicacion,
        descripcion, orden, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      typeData.type_key,
      typeData.nombre,
      typeData.tipo,
      typeData.capacidad,
      typeData.habitaciones,
      typeData.baños,
      typeData.precio_noche,
      typeData.moneda || 'HNL',
      JSON.stringify(typeData.fotos || []),
      JSON.stringify(typeData.comodidades || []),
      JSON.stringify(typeData.ubicacion || {}),
      typeData.descripcion || '',
      typeData.orden || 999,
      typeData.activo !== false // por defecto true
    ];
    
    return (await db.runExecute(sql, params)).changes > 0;
  } catch (e) {
    console.error('Error creating cabin type:', e);
    return false;
  }
};

// Funciones de compatibilidad con el sistema existente
const checkDisponibilidad = (cabaña, fechaEntrada, fechaSalida) => {
  // Para tipos de menú, siempre devolvemos true
  // La verificación real se hará con las cabañas físicas
  return true;
};

const parsearFechas = (texto) => {
  moment.locale('es');
  
  const patterns = [
    /(\d{1,2})[\s\-]*(?:de\s+)?(\w+)[\s\-]*(?:a|al|\-)\s*(\d{1,2})[\s\-]*(?:de\s+)?(\w+)/i,
    /(\d{1,2})\/(\d{1,2})[\s\-]*(?:a|al|\-)\s*(\d{1,2})\/(\d{1,2})/,
    /(\d{1,2})[\s\-]*(\d{1,2})[\s\-]*(?:a|al|\-)\s*(\d{1,2})[\s\-]*(\d{1,2})/
  ];

  for (const pattern of patterns) {
    const match = texto.match(pattern);
    if (match) {
      try {
        if (pattern.source.includes('\\w+')) {
          const [, diaInicio, mesInicio, diaFin, mesFin] = match;
          const entrada = moment(`${diaInicio} ${mesInicio} 2025`, 'DD MMMM YYYY');
          const salida = moment(`${diaFin} ${mesFin} 2025`, 'DD MMMM YYYY');
          
          if (entrada.isValid() && salida.isValid()) {
            return { entrada, salida };
          }
        } else {
          const [, d1, m1, d2, m2] = match;
          const entrada = moment(`${d1}/${m1}/2025`, 'DD/MM/YYYY');
          const salida = moment(`${d2}/${m2}/2025`, 'DD/MM/YYYY');
          
          if (entrada.isValid() && salida.isValid()) {
            return { entrada, salida };
          }
        }
      } catch (e) {
        continue;
      }
    }
  }
  
  return null;
};

module.exports = {
  // Función principal para el menú
  loadMenuCabinTypes,
  
  // Funciones de administración
  getCabinTypeByKey,
  toggleCabinType,
  updateCabinType,
  createCabinType,
  
  // Funciones de compatibilidad
  checkDisponibilidad,
  parsearFechas,
  
  // Alias para compatibilidad con código existente
  loadCabañas: loadMenuCabinTypes,
  loadTiposCabañas: loadMenuCabinTypes
};
