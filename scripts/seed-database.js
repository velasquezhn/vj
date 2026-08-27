const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const dbPath = path.resolve(process.env.DB_PATH || './data/bot_database.sqlite');
const cabins = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/cabañas_v2_structured.json'), 'utf8'));
const activities = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/actividades.json'), 'utf8'));
const db = new sqlite3.Database(dbPath);
const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) {
  if (error) reject(error); else resolve({ lastID: this.lastID, changes: this.changes });
}));
const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));

async function seed() {
  await run('BEGIN IMMEDIATE');
  try {
    for (const [index, type] of cabins.cabin_types.entries()) {
      await run(`INSERT OR IGNORE INTO CabinTypes
        (type_key, nombre, tipo, capacidad, habitaciones, baños, precio_noche, base_price, moneda, fotos, comodidades, descripcion, orden)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        type.id, type.display_name || type.name, type.id, type.capacity.max_guests, type.capacity.rooms,
        type.capacity.bathrooms, type.pricing.base_price, type.pricing.base_price, type.pricing.currency,
        JSON.stringify(type.gallery || []), JSON.stringify(type.amenities || []), type.description?.full || '', index + 1
      ]);
      const cabinType = await get('SELECT cabin_type_id FROM CabinTypes WHERE type_key = ?', [type.id]);
      // Completa campos que quedaron vacíos en instalaciones anteriores sin sobrescribir
      // cambios válidos realizados desde el panel administrativo.
      await run(`UPDATE CabinTypes SET
        fotos = CASE WHEN fotos IS NULL OR TRIM(fotos) = '' OR TRIM(fotos) = '[]' THEN ? ELSE fotos END,
        comodidades = CASE WHEN comodidades IS NULL OR TRIM(comodidades) = '' OR TRIM(comodidades) = '[]' THEN ? ELSE comodidades END,
        descripcion = CASE WHEN descripcion IS NULL OR TRIM(descripcion) = '' THEN ? ELSE descripcion END,
        updated_at = CURRENT_TIMESTAMP
        WHERE cabin_type_id = ?`, [
        JSON.stringify(type.gallery || []), JSON.stringify(type.amenities || []),
        type.description?.full || type.description?.short || '', cabinType.cabin_type_id
      ]);
      for (const unitName of type.physical_units?.unit_names || []) {
        await run(`INSERT INTO Cabins (cabin_type_id, name, capacity, description, price, base_price, price_per_night, photos)
          SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM Cabins WHERE name = ?)`, [
          cabinType.cabin_type_id, unitName, type.capacity.max_guests, type.description?.short || '',
          type.pricing.base_price, type.pricing.base_price, type.pricing.base_price, (type.gallery || []).join(','), unitName
        ]);
        await run(`UPDATE Cabins SET
          photos = CASE WHEN photos IS NULL OR TRIM(photos) = '' THEN ? ELSE photos END,
          description = CASE WHEN description IS NULL OR TRIM(description) = '' THEN ? ELSE description END,
          updated_at = CURRENT_TIMESTAMP
          WHERE name = ?`, [(type.gallery || []).join(','), type.description?.short || '', unitName]);
      }
    }
    for (const [index, activity] of activities.entries()) {
      await run(`INSERT OR IGNORE INTO Activities
        (activity_key, name, nombre, categoria, subcategoria, description, descripcion, descripcion_corta,
         ubicacion, contacto, horarios, precios, servicios, dificultad, duracion, capacidad_maxima,
         edad_minima, idiomas, recomendaciones, disponibilidad, multimedia, calificacion, certificaciones, orden, orden_menu)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        activity.id, activity.nombre, activity.nombre, activity.categoria, activity.subcategoria,
        activity.descripcion, activity.descripcion, activity.descripcionCorta,
        JSON.stringify(activity.ubicacion || {}), JSON.stringify(activity.contacto || {}), JSON.stringify(activity.horarios || {}),
        JSON.stringify(activity.precios || {}), JSON.stringify(activity.servicios || []), activity.dificultad || '',
        activity.duracion || '', activity.capacidadMaxima || 0, activity.edadMinima || 0, JSON.stringify(activity.idiomas || []),
        JSON.stringify(activity.recomendaciones || {}), JSON.stringify(activity.disponibilidad || {}), JSON.stringify(activity.multimedia || {}),
        JSON.stringify(activity.calificacion || {}), JSON.stringify(activity.certificaciones || []), index + 1, index + 1
      ]);
    }
    await run('COMMIT');
    console.log('Seed completed without overwriting existing records.');
  } catch (error) {
    await run('ROLLBACK');
    throw error;
  }
}

seed().then(() => db.close()).catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  db.close(() => process.exit(1));
});
