const db = require('../db');

/**
 * Servicio para manejar los tipos de cabañas del menú
 * Utiliza la tabla CabinTypes que es administrable por separado
 */

function formatCabinType(type) {
  return {
    ...type,
    id: `cab_type_${type.type_key}`,
    fotos: safeJson(type.fotos, []),
    comodidades: safeJson(type.comodidades, []),
    ubicacion: safeJson(type.ubicacion, {}),
    activo: Boolean(type.activo),
    reservas: []
  };
}

async function loadCabinTypes({ includeInactive = false } = {}) {
  try {
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
      ${includeInactive ? '' : 'WHERE activo = true'}
      ORDER BY orden ASC
    `);
    return types.map(formatCabinType);
  } catch (e) {
    console.error('Error loading menu cabin types from CabinTypes table:', e);
    throw e;
  }
}

// El menú de WhatsApp solo muestra tipos activos.
const loadMenuCabinTypes = () => loadCabinTypes();

// El panel necesita ver también los inactivos para poder reactivarlos.
const loadAllCabinTypes = () => loadCabinTypes({ includeInactive: true });

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}

// Obtener un tipo específico por clave
const getCabinTypeByKey = async (typeKey) => {
  try {
    const type = await db.runQuery(
      'SELECT * FROM CabinTypes WHERE type_key = ?',
      [typeKey]
    );
    
    if (type.length > 0) {
      const typeData = type[0];
      return formatCabinType(typeData);
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
    if (updateData.fotos !== undefined) {
      fields.push('fotos = ?');
      values.push(JSON.stringify(updateData.fotos));
    }
    
    if (updateData.comodidades !== undefined) {
      fields.push('comodidades = ?');
      values.push(JSON.stringify(updateData.comodidades));
    }
    
    if (updateData.ubicacion !== undefined) {
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
      typeData.orden ?? 999,
      typeData.activo !== false // por defecto true
    ];
    
  return (await db.runExecute(sql, params)).changes > 0;
};

module.exports = {
  // Función principal para el menú
  loadMenuCabinTypes,
  loadAllCabinTypes,
  
  // Funciones de administración
  getCabinTypeByKey,
  toggleCabinType,
  updateCabinType,
  createCabinType,
};
