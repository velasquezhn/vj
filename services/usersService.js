const db = require('../db');

const getUserByPhone = async (phone_number) => {
  try {
    const rows = await db.runQuery('SELECT * FROM Users WHERE phone_number = ?', [phone_number]);
    return rows.length > 0 ? rows[0] : null;
  } catch (e) {
    console.error('Error fetching user by phone:', e);
    return null;
  }
};

const createUser = async (userData) => {
  try {
    const sql = "INSERT INTO Users (phone_number, name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))";
    const params = [
      userData.phone_number,
      userData.name || null,
      userData.role || 'guest',
      userData.is_active !== undefined ? userData.is_active : 1
    ];
    const result = await db.runExecute(sql, params);
    return result.lastID ? result.lastID : null;
  } catch (e) {
    console.error('Error creating user:', e);
    return null;
  }
};

const updateUser = async (user_id, updateData) => {
  try {
    const fields = [];
    const params = [];
    for (const key in updateData) {
      fields.push(key + ' = ?');
      params.push(updateData[key]);
    }
    params.push(user_id);
    const sql = 'UPDATE Users SET ' + fields.join(', ') + ', updated_at = datetime(\'now\') WHERE user_id = ?';
    const result = await db.runExecute(sql, params);
    return result.changes > 0;
  } catch (e) {
    console.error('Error updating user:', e);
    return false;
  }
};

const listUsers = async () => {
  try {
    const users = await db.runQuery('SELECT * FROM Users');
    return users;
  } catch (e) {
    console.error('Error listing users:', e);
    return [];
  }
};

const updateUserStatesBasedOnReservations = async () => {
  try {
    console.log('[UserService] Iniciando actualización de estados de usuarios...');
    
    // Obtener todos los usuarios y reservas
    const users = await db.runQuery('SELECT * FROM Users');
    const reservations = await db.runQuery('SELECT * FROM Reservations');
    
    console.log(`[UserService] Procesando ${users.length} usuarios y ${reservations.length} reservas`);
    
    let updatedCount = 0;
    const currentDate = new Date();
    console.log(`[UserService] Fecha actual: ${currentDate.toISOString().split('T')[0]}`);
    
    for (const user of users) {
      // Buscar reservas del usuario
      const userReservations = reservations.filter(res => 
        res.user_id === user.user_id || res.user_id === user.user_id.toString()
      );
      
      let newState = false; // Por defecto inactivo
      
      if (userReservations.length > 0) {
        console.log(`[UserService] Usuario ${user.name} (${user.user_id}): ${userReservations.length} reservas`);
        
        // Verificar si tiene reservas activas o futuras
        const hasActiveReservations = userReservations.some(res => {
          const endDate = new Date(res.end_date);
          const validStates = [
            'pendiente_autorizacion', 'esperando_pago', 'pendiente_verificacion',
            'confirmado', 'confirmada', 'confirmed'
          ];
          const isActiveStatus = validStates.includes(res.status.toLowerCase());
          const isFutureOrCurrent = endDate >= currentDate;
          
          console.log(`[UserService]   Reserva ${res.reservation_id}: ${res.status} | fin: ${res.end_date} | válido: ${isActiveStatus} | futuro: ${isFutureOrCurrent}`);
          
          return isActiveStatus && isFutureOrCurrent;
        });
        
        newState = hasActiveReservations;
        console.log(`[UserService] Usuario ${user.name}: resultado final = ${newState ? 'ACTIVO' : 'INACTIVO'}`);
      } else {
        console.log(`[UserService] Usuario ${user.name} (${user.user_id}): sin reservas`);
      }
      
      // Actualizar solo si hay cambio
      if (user.is_active !== (newState ? 1 : 0)) {
        const updated = await updateUser(user.user_id, { is_active: newState });
        if (updated) {
          updatedCount++;
          console.log(`[UserService] ✅ Usuario ${user.name} (${user.user_id}): ${user.is_active ? 'activo' : 'inactivo'} -> ${newState ? 'activo' : 'inactivo'}`);
        }
      } else {
        console.log(`[UserService] ⚪ Usuario ${user.name}: sin cambios (ya ${newState ? 'activo' : 'inactivo'})`);
      }
    }
    
    console.log(`[UserService] Estados actualizados para ${updatedCount} usuarios`);
    return updatedCount;
    
  } catch (e) {
    console.error('Error updating user states:', e);
    throw e;
  }
};

module.exports = {
  getUserByPhone,
  createUser,
  updateUser,
  listUsers,
  updateUserStatesBasedOnReservations
};
