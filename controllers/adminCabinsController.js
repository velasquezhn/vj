const { db } = require('../db');
const logger = require('../config/logger');

exports.getAllCabanas = (req, res) => {
  const query = 'SELECT * FROM Cabins ORDER BY cabin_id';
  db.all(query, [], (err, rows) => {
    if (err) {
      logger.error('Error reading cabins', { error: err.message });
      return res.status(500).json({ success: false, message: 'Error leyendo las cabañas' });
    }
    
    if (!rows || rows.length === 0) {
      return res.json([]);
    }
    
    // Map database fields to frontend expected fields
    const mappedCabanas = rows.map(cabin => ({
      id: cabin.cabin_id,
      cabin_id: cabin.cabin_id,
      name: cabin.name,
      nombre: cabin.name,
      capacity: cabin.capacity,
      capacidad: cabin.capacity,
      price: cabin.price,
      precio_noche: cabin.price,
      precio_por_noche: cabin.price,
      description: cabin.description,
      descripcion: cabin.description,
      disponible: cabin.is_active !== 0,
      created_at: cabin.created_at,
      updated_at: cabin.updated_at
    }));
    
    res.json(mappedCabanas);
  });
};

exports.createCabana = (req, res) => {
  try {
    const { name, nombre, capacity, capacidad, price, precio_noche, precio_por_noche, description, descripcion } = req.body;
    
    // Use both English and Spanish field names for compatibility
    const cabinName = name || nombre;
    const cabinCapacity = capacity || capacidad;
    const cabinPrice = price || precio_noche || precio_por_noche;
    const cabinDescription = description || descripcion || '';
    
    if (!cabinName || !cabinCapacity || !cabinPrice) {
      return res.status(400).json({ success: false, message: 'Campos obligatorios faltantes' });
    }

    const query = `
      INSERT INTO Cabins (name, capacity, description, price, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    
    db.run(query, [cabinName, parseInt(cabinCapacity), cabinDescription, parseFloat(cabinPrice)], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Error creando la cabaña' });
      }
      
      res.json({ 
        success: true, 
        cabin_id: this.lastID,
        message: 'Cabaña creada exitosamente'
      });
    });
  } catch (error) {
    console.error('Error in createCabana:', error);
    res.status(500).json({ success: false, message: 'Error creando la cabaña' });
  }
};

exports.updateCabana = (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, nombre, capacity, capacidad, price, precio_noche, precio_por_noche, description, descripcion } = req.body;
    
    // Use both English and Spanish field names for compatibility
    const cabinName = name || nombre;
    const cabinCapacity = capacity || capacidad;
    const cabinPrice = price || precio_noche || precio_por_noche;
    const cabinDescription = description || descripcion;
    
    // Build dynamic update query
    let updateFields = [];
    let updateValues = [];
    
    if (cabinName) {
      updateFields.push('name = ?');
      updateValues.push(cabinName);
    }
    if (cabinCapacity) {
      updateFields.push('capacity = ?');
      updateValues.push(parseInt(cabinCapacity));
    }
    if (cabinPrice) {
      updateFields.push('price = ?');
      updateValues.push(parseFloat(cabinPrice));
    }
    if (cabinDescription !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(cabinDescription);
    }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ success: false, message: 'No hay campos para actualizar' });
    }
    
    updateFields.push('updated_at = datetime(\'now\')');
    updateValues.push(id);
    
    const query = `UPDATE Cabins SET ${updateFields.join(', ')} WHERE cabin_id = ?`;
    
    db.run(query, updateValues, function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Error actualizando la cabaña' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'Cabaña no encontrada' });
      }
      
      res.json({ success: true, message: 'Cabaña actualizada exitosamente' });
    });
  } catch (error) {
    console.error('Error in updateCabana:', error);
    res.status(500).json({ success: false, message: 'Error actualizando la cabaña' });
  }
};

exports.deleteCabana = (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const query = 'DELETE FROM Cabins WHERE cabin_id = ?';
    
    db.run(query, [id], function(err) {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ success: false, message: 'Error eliminando la cabaña' });
      }
      
      if (this.changes === 0) {
        return res.status(404).json({ success: false, message: 'Cabaña no encontrada' });
      }
      
      res.json({ success: true, message: 'Cabaña eliminada exitosamente' });
    });
  } catch (error) {
    console.error('Error in deleteCabana:', error);
    res.status(500).json({ success: false, message: 'Error eliminando la cabaña' });
  }
};
