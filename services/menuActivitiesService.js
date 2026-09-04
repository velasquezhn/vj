const moment = require('moment');
require('moment/locale/es');
const db = require('../db');

/**
 * Servicio para manejar las actividades del menú
 * Utiliza la tabla Activities que es administrable por separado
 */

// Cargar actividades para el menú desde tabla Activities
const loadMenuActivities = async () => {
  try {
    const activities = await db.runQuery(`
      SELECT 
        activity_id,
        activity_key,
        nombre,
        categoria,
        subcategoria,
        descripcion,
        descripcion_corta,
        ubicacion,
        contacto,
        horarios,
        precios,
        servicios,
        dificultad,
        duracion,
        capacidad_maxima,
        edad_minima,
        idiomas,
        recomendaciones,
        disponibilidad,
        multimedia,
        calificacion,
        certificaciones,
        orden,
        activo,
        incluir_en_menu,
        orden_menu,
        created_at,
        updated_at
      FROM Activities 
      ORDER BY orden_menu ASC, orden ASC, nombre ASC
    `);
    
    // Convertir datos JSON strings de vuelta a objetos
    const activitiesFormatted = activities.map(activity => ({
      ...activity,
      // Campos para compatibilidad con el código existente
      id: activity.activity_key,
      nombre: activity.nombre,
      categoria: activity.categoria,
      subcategoria: activity.subcategoria,
      descripcion: activity.descripcion,
      descripcionCorta: activity.descripcion_corta,
      ubicacion: activity.ubicacion ? JSON.parse(activity.ubicacion) : {},
      contacto: activity.contacto ? JSON.parse(activity.contacto) : {},
      horarios: activity.horarios ? JSON.parse(activity.horarios) : {},
      precios: activity.precios ? JSON.parse(activity.precios) : {},
      servicios: activity.servicios ? JSON.parse(activity.servicios) : [],
      dificultad: activity.dificultad,
      duracion: activity.duracion,
      capacidadMaxima: activity.capacidad_maxima,
      edadMinima: activity.edad_minima,
      idiomas: activity.idiomas ? JSON.parse(activity.idiomas) : [],
      recomendaciones: activity.recomendaciones ? JSON.parse(activity.recomendaciones) : {},
      disponibilidad: activity.disponibilidad ? JSON.parse(activity.disponibilidad) : {},
      multimedia: activity.multimedia ? JSON.parse(activity.multimedia) : {},
      calificacion: activity.calificacion ? JSON.parse(activity.calificacion) : {},
      certificaciones: activity.certificaciones ? JSON.parse(activity.certificaciones) : []
    }));
    
    return activitiesFormatted;
    
  } catch (e) {
    console.error('Error loading menu activities from Activities table:', e);
    console.error('❌ CRÍTICO: No se pudo cargar actividades desde base de datos');
    console.error('   Asegúrate de que la tabla Activities existe y tiene datos');
    return [];
  }
};

// Obtener una actividad específica por clave
const getActivityByKey = async (activityKey) => {
  try {
    const activity = await db.runQuery(
      'SELECT * FROM Activities WHERE activity_key = ? AND activo = true',
      [activityKey]
    );
    
    if (activity.length > 0) {
      const activityData = activity[0];
      return {
        ...activityData,
        ubicacion: activityData.ubicacion ? JSON.parse(activityData.ubicacion) : {},
        contacto: activityData.contacto ? JSON.parse(activityData.contacto) : {},
        horarios: activityData.horarios ? JSON.parse(activityData.horarios) : {},
        precios: activityData.precios ? JSON.parse(activityData.precios) : {},
        servicios: activityData.servicios ? JSON.parse(activityData.servicios) : [],
        idiomas: activityData.idiomas ? JSON.parse(activityData.idiomas) : [],
        recomendaciones: activityData.recomendaciones ? JSON.parse(activityData.recomendaciones) : {},
        disponibilidad: activityData.disponibilidad ? JSON.parse(activityData.disponibilidad) : {},
        multimedia: activityData.multimedia ? JSON.parse(activityData.multimedia) : {},
        calificacion: activityData.calificacion ? JSON.parse(activityData.calificacion) : {},
        certificaciones: activityData.certificaciones ? JSON.parse(activityData.certificaciones) : []
      };
    }
    return null;
  } catch (e) {
    console.error('Error getting activity by key:', e);
    return null;
  }
};

// Activar/desactivar una actividad
const toggleActivity = async (activityKey, activo) => {
  try {
    await db.runQuery(
      'UPDATE Activities SET activo = ?, updated_at = CURRENT_TIMESTAMP WHERE activity_key = ?',
      [activo, activityKey]
    );
    return true;
  } catch (e) {
    console.error('Error toggling activity:', e);
    return false;
  }
};

// Actualizar una actividad
const updateActivity = async (activityKey, updateData) => {
  try {
    const fields = [];
    const values = [];
    
    // Campos que se pueden actualizar directamente
    const allowedFields = [
      'nombre', 'categoria', 'subcategoria', 'descripcion', 'descripcion_corta',
      'dificultad', 'duracion', 'capacidad_maxima', 'edad_minima', 'orden'
    ];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(updateData[field]);
      }
    });
    
    // Campos especiales que requieren JSON.stringify
    const jsonFields = [
      'ubicacion', 'contacto', 'horarios', 'precios', 'servicios',
      'idiomas', 'recomendaciones', 'disponibilidad', 'multimedia',
      'calificacion', 'certificaciones'
    ];
    
    jsonFields.forEach(field => {
      if (updateData[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(JSON.stringify(updateData[field]));
      }
    });
    
    if (fields.length === 0) return false;
    
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(activityKey);
    
    const sql = `UPDATE Activities SET ${fields.join(', ')} WHERE activity_key = ?`;
    await db.runQuery(sql, values);
    
    return true;
  } catch (e) {
    console.error('Error updating activity:', e);
    return false;
  }
};

// Crear una nueva actividad
const createActivity = async (activityData) => {
  try {
    const sql = `
      INSERT INTO Activities (
        activity_key, nombre, categoria, subcategoria, descripcion, descripcion_corta,
        ubicacion, contacto, horarios, precios, servicios, dificultad, duracion,
        capacidad_maxima, edad_minima, idiomas, recomendaciones, disponibilidad,
        multimedia, calificacion, certificaciones, orden, activo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      activityData.activity_key,
      activityData.nombre,
      activityData.categoria,
      activityData.subcategoria || '',
      activityData.descripcion || '',
      activityData.descripcion_corta || '',
      JSON.stringify(activityData.ubicacion || {}),
      JSON.stringify(activityData.contacto || {}),
      JSON.stringify(activityData.horarios || {}),
      JSON.stringify(activityData.precios || {}),
      JSON.stringify(activityData.servicios || []),
      activityData.dificultad || '',
      activityData.duracion || '',
      activityData.capacidad_maxima || 0,
      activityData.edad_minima || 0,
      JSON.stringify(activityData.idiomas || []),
      JSON.stringify(activityData.recomendaciones || {}),
      JSON.stringify(activityData.disponibilidad || {}),
      JSON.stringify(activityData.multimedia || {}),
      JSON.stringify(activityData.calificacion || {}),
      JSON.stringify(activityData.certificaciones || []),
      activityData.orden || 999,
      activityData.activo !== false // por defecto true
    ];
    
    await db.runQuery(sql, params);
    return true;
  } catch (e) {
    console.error('Error creating activity:', e);
    return false;
  }
};

// Funciones de compatibilidad con el sistema existente
const checkDisponibilidadActividad = (actividad, fecha) => {
  // Para actividades de menú, siempre devolvemos true
  // La verificación real se hará con la disponibilidad específica
  return true;
};

module.exports = {
  // Función principal para el menú
  loadMenuActivities,
  
  // Funciones de administración
  getActivityByKey,
  toggleActivity,
  updateActivity,
  createActivity,
  
  // Funciones de compatibilidad
  checkDisponibilidadActividad,
  
  // Alias para compatibilidad con código existente
  loadActividades: loadMenuActivities,
  loadTiposActividades: loadMenuActivities
};
